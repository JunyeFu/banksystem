"""Review exact image findings; preserve native failure and block unreviewed risks."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / 'scripts/test/ci-image-dispositions.json'


def sha(path, text=False):
    data = path.read_bytes()
    return hashlib.sha256(data.replace(b'\r\n', b'\n') if text else data).hexdigest()


def source_digest(source):
    service = source / 'services/bank-channel-service'
    paths = [source / 'compose.channel.yaml', service / 'pom.xml', service / 'Dockerfile']
    paths += sorted((service / 'src/main').rglob('*'))
    rows = [p.relative_to(source).as_posix() + ':' + sha(p, text=True) for p in paths if p.is_file()]
    return hashlib.sha256('\n'.join(rows).encode()).hexdigest()


def jar_payload_digest(jar):
    with zipfile.ZipFile(jar) as archive:
        rows = [name + ':' + hashlib.sha256(archive.read(name)).hexdigest()
                for name in sorted(archive.namelist()) if name.startswith('BOOT-INF/') and not name.endswith('/')]
    return hashlib.sha256('\n'.join(rows).encode()).hexdigest()


def findings(report, native_exit):
    if native_exit not in (0, 1) or not report.get('image_metadata') or not report.get('results'):
        raise ValueError('IMAGE_NATIVE_SCAN_ERROR')
    rows = []
    for result in report['results']:
        for item in result['packages']:
            for advisory in item.get('vulnerabilities', []):
                package = item['package']
                rows.append({'name': package['name'], 'version': package['version'],
                             'ecosystem': package['ecosystem'], 'binaryPackage': package.get('os_package_name'),
                             'id': advisory['id'], 'aliases': advisory.get('aliases', []),
                             'severity': advisory.get('severity', []),
                             'databaseSeverity': advisory.get('database_specific', {}).get('severity'),
                             'details': advisory.get('details'),
                             'references': [ref['url'] for ref in advisory.get('references', [])]})
    if (native_exit == 0) != (not rows):
        raise ValueError('IMAGE_NATIVE_EXIT_MISMATCH')
    return rows


def review(rows, policy, digest):
    if digest != policy['sourceDigest']:
        raise ValueError('IMAGE_REVIEW_SOURCE_DRIFT')
    decisions = {(r['name'], r['version'], r['ecosystem'], advisory): r
                 for r in policy['dispositions'] for advisory in r['advisories']}
    observed = {(r['name'], r['version'], r['ecosystem'], r['id']) for r in rows}
    missing = [dict(zip(('name', 'version', 'ecosystem', 'id'), key))
               for key in sorted(decisions.keys() - observed)]
    reviewed, blocking = [], []
    for row in rows:
        decision = decisions.get((row['name'], row['version'], row['ecosystem'], row['id']))
        if decision and decision['status'] == 'NOT_AFFECTED' and decision['evidence'] and decision['reason']:
            reviewed.append({**row, 'status': 'NOT_AFFECTED', 'reason': decision['reason'],
                             'evidence': decision['evidence'], 'limits': decision['limits']})
        else:
            blocking.append({**row, 'status': 'UNDER_INVESTIGATION',
                             'reason': 'No accepted exact reachability evidence; native finding still blocks.'})
    return {'status': 'REVIEWED' if not blocking and not missing else 'FAILED',
            'reviewed': reviewed, 'blocking': blocking, 'missing': missing,
            'uniqueAdvisories': len({r['id'] for r in rows}),
            'reviewedAdvisories': len({r['id'] for r in reviewed}),
            'missingExpectedAdvisories': len({r['id'] for r in missing}),
            'blockingAdvisories': len({r['id'] for r in blocking + missing})}


def properties(component):
    return {p['name']: p['value'] for p in component.get('properties', [])}


def has_license_terms(component):
    licenses = component.get('licenses', [])
    return bool(licenses) and not any(re.fullmatch(r'sha256:[0-9a-f]{64}',
                                                  row.get('license', {}).get('name', '')) for row in licenses)


def package_license_owners(materials):
    owners = {}
    path = materials / 'dpkg-lists.txt'
    if not path.is_file():
        return owners
    package = None
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if line.startswith('PACKAGE-LIST:'):
            package = Path(line.partition(':')[2]).name.removesuffix('.list').split(':')[0]
        elif package and line.startswith('/'):
            owners.setdefault(line, set()).add(package)
    return owners


def license_materials(bom, materials, jar, root_license, policy=None):
    """Associate existing originals, never infer a grant from absence of scanner metadata."""
    reviewed = copy.deepcopy(bom)
    peers = {(c['name'], c.get('version')): c for c in bom['components'] if has_license_terms(c)}
    owners = package_license_owners(materials)
    exact = {(r['name'], r['version']): r for r in (policy or {}).get('licenseReviews', [])}
    supplemented, unresolved = [], []
    for c in reviewed['components']:
        if c['type'] == 'file' or has_license_terms(c):
            continue
        if (c['name'], c.get('version')) in exact:
            row = exact[(c['name'], c.get('version'))]
            original = materials / row['file']
            if sha(original) != row['sha256']:
                raise ValueError('IMAGE_LICENSE_ORIGINAL_DRIFT:' + c['name'])
            c['licenses'] = copy.deepcopy(row['licenses'])
            basis = {'kind': 'EXACT_INSTALLED_COPYRIGHT_REVIEW', 'originals': [
                {'path': row['imagePath'], 'sha256': row['sha256']}],
                'note': row['basis'], 'obligation': row['obligation']}
            c.setdefault('properties', []).append({'name': 'banksystem:license-review-source', 'value': json.dumps(basis)})
            supplemented.append({'name': c['name'], 'version': c.get('version'), 'basis': basis})
            continue
        peer = peers.get((c['name'], c.get('version')))
        prop = properties(peer or c)
        paths = [value for key, value in prop.items() if key.startswith('syft:location:') and key.endswith(':path')]
        originals = []
        for path in paths:
            if path.startswith('/usr/share/doc/') and path.endswith('/copyright'):
                local = materials / 'doc' / path.removeprefix('/usr/share/doc/')
                if local.is_file():
                    originals.append({'path': path, 'sha256': sha(local)})
        owned = sorted({name for path in paths for name in owners.get(path, ())})
        copyrights = [(name, materials / 'doc' / name / 'copyright') for name in owned]
        copyrights = [(name, path) for name, path in copyrights if path.is_file()]
        if peer and originals:
            c['licenses'] = copy.deepcopy(peer['licenses'])
            basis = {'kind': 'SAME_PACKAGE_VERSION_DPKG_COPYRIGHT', 'originals': originals}
        elif copyrights:
            terms = sorted({label for _, path in copyrights
                            for label in re.findall(r'^License: (.+)$', path.read_text(encoding='utf-8'), re.M)})
            if not terms:
                unresolved.append({'name': c['name'], 'version': c.get('version'), 'paths': paths,
                                   'copyrightOwners': owned, 'reason': 'Original is non-DEP5; exact terms still need review.'})
                continue
            c['licenses'] = [{'license': {'name': label}} for label in terms]
            basis = {'kind': 'INSTALLED_PATH_OWNER_COPYRIGHT_DECLARATIONS_NOT_BINARY_LICENSE_CONCLUSION',
                     'originals': [{'path': '/usr/share/doc/' + name + '/copyright', 'sha256': sha(path)}
                                   for name, path in copyrights],
                     'note': 'Original per-file scopes and common-license references govern; package-level labels also include source/build files.'}
        elif c['name'] == 'app' and c.get('version') == '0.1.0':
            with zipfile.ZipFile(jar) as archive:
                pom = archive.read('META-INF/maven/local.bank/bank-channel-service/pom.xml')
            if b'Mozilla Public License 2.0' not in pom or not root_license.is_file():
                raise ValueError('IMAGE_OWN_LICENSE_MISSING')
            c['licenses'] = [{'license': {'id': 'MPL-2.0'}}]
            basis = {'kind': 'EMBEDDED_OWN_POM', 'originals': [{'path': 'LICENSE', 'sha256': sha(root_license)}]}
        elif c['name'] in ('openjdk', 'jrt-fs'):
            license_path = materials / 'jre-legal/java.base/LICENSE'
            exception_path = materials / 'jre-legal/java.base/ASSEMBLY_EXCEPTION'
            if not license_path.is_file() or not exception_path.is_file():
                raise ValueError('IMAGE_JRE_LICENSE_MISSING')
            c['licenses'] = [{'expression': 'GPL-2.0-only WITH Classpath-exception-2.0'}]
            basis = {'kind': 'JRE_ORIGINALS', 'originals': [
                {'path': '/opt/java/openjdk/legal/java.base/' + p.name, 'sha256': sha(p)}
                for p in (license_path, exception_path)]}
        elif c['name'] == 'ubuntu' and c['type'] == 'operating-system':
            c.setdefault('properties', []).append({'name': 'banksystem:license-review',
                                    'value': 'Distribution identity, not a separately licensed library; package copyright records govern.'})
            continue
        else:
            unresolved.append({'name': c['name'], 'version': c.get('version'), 'paths': paths})
            continue
        c.setdefault('properties', []).append({'name': 'banksystem:license-review-source', 'value': json.dumps(basis)})
        supplemented.append({'name': c['name'], 'version': c.get('version'), 'basis': basis})
    return reviewed, {'status': 'MATERIALS_ASSOCIATED' if not unresolved else 'INCOMPLETE',
                      'scope': 'ACTUAL_IMAGE_LICENSE_METADATA_AND_ORIGINALS',
                      'supplemented': supplemented, 'unresolved': unresolved,
                      'binaryRedistributionObligationsCompleted': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--bom', type=Path, required=True)
    parser.add_argument('--native-report', type=Path, required=True)
    parser.add_argument('--native-exit', type=int, required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--jar', type=Path, required=True)
    parser.add_argument('--materials', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if 'banksystem-rf065' not in args.output.resolve().parts:
        raise ValueError('IMAGE_OWNED_OUTPUT_REQUIRED')
    args.output.mkdir(parents=True, exist_ok=False)
    bom = json.loads(args.bom.read_text(encoding='utf-8'))
    report = json.loads(args.native_report.read_text(encoding='utf-8'))
    policy = json.loads(POLICY_PATH.read_text(encoding='utf-8'))
    inspection = json.loads(subprocess.run(['docker', 'image', 'inspect', args.image],
                                          check=True, capture_output=True, text=True).stdout)[0]
    if (inspection['Id'] != policy['reviewedImageId']
            or bom['metadata']['component']['version'] != inspection['Id'].removeprefix('sha256:')
            or inspection['RootFS']['Layers'][:-1] != policy['baseLayers']
            or jar_payload_digest(args.jar) != policy['jarPayloadDigest']
            or inspection['Config']['Entrypoint'] != ['java', '-jar', '/app/app.jar']
            or inspection['Config']['User'] != '10001' or inspection['Architecture'] != 'amd64'):
        raise ValueError('IMAGE_REVIEW_IMAGE_DRIFT')
    layers = [p['diff_id'] for p in report['image_metadata']['layer_metadata'] if not p['is_empty']]
    if layers != inspection['RootFS']['Layers']:
        raise ValueError('IMAGE_NATIVE_REPORT_BINDING_MISMATCH')
    jar_component = next(c for c in bom['components'] if c['name'] == '/app/app.jar')
    expected = next(h['content'] for h in jar_component['hashes'] if h['alg'] == 'SHA-256')
    if sha(args.jar) != expected:
        raise ValueError('IMAGE_REVIEW_JAR_DRIFT')
    rows = findings(report, args.native_exit)
    result = review(rows, policy, source_digest(args.source))
    result.update({'imageId': inspection['Id'], 'reviewedImageId': policy['reviewedImageId'], 'nativeScannerExitCode': args.native_exit,
                   'nativeScannerStatus': 'FAILED' if rows else 'PASSED',
                   'nativeReportSha256': sha(args.native_report), 'originalBomSha256': sha(args.bom),
                   'policySha256': sha(POLICY_PATH, text=True), 'candidateReady': False, 'releaseDecision': 'NO_GO'})
    reviewed_bom, licenses = license_materials(bom, args.materials, args.jar, args.source / 'LICENSE', policy)
    for filename, value in (('image-review.json', result), ('image.reviewed.cdx.json', reviewed_bom), ('image-license-review.json', licenses)):
        (args.output / filename).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({key: result[key] for key in ('status', 'uniqueAdvisories', 'reviewedAdvisories', 'blockingAdvisories', 'nativeScannerExitCode')}))
    print(json.dumps({'licenseStatus': licenses['status'], 'unresolved': len(licenses['unresolved']),
                      'binaryRedistributionObligationsCompleted': False}))
    return 0 if result['status'] == 'REVIEWED' and not licenses['unresolved'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
