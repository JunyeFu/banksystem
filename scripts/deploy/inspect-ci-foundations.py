"""Inspect exact foundation reports and the observed PGDG advisory coverage gap."""
import argparse
import ast
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import yaml

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / 'scripts/test/ci-foundation-policy.json'
SPEC = importlib.util.spec_from_file_location('image_review', ROOT / 'scripts/deploy/verify-ci-image-review.py')
IMAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMAGE)


def runtime_scope(root):
    constants = {}
    ci = ast.parse((root / 'scripts/deploy/prepare-ci-bank.py').read_text(encoding='utf-8'))
    for node in ci.body:
        if isinstance(node, ast.Assign):
            for name in node.targets:
                if isinstance(name, ast.Name) and name.id in ('CORE', 'CHANNEL'):
                    constants[name.id] = set(ast.literal_eval(node.value))
    if set(constants) != {'CORE', 'CHANNEL'}:
        raise ValueError('BANK_SMOKE_SERVICE_SCOPE_MISSING')
    rows, optional = [], []
    for filename, group in (('postgresql/docker-compose.isolated.yml', 'CORE'), ('compose.channel.yaml', 'CHANNEL')):
        services = yaml.safe_load((root / filename).read_text(encoding='utf-8'))['services']
        for name, definition in services.items():
            if definition.get('extends'):
                parent = definition['extends']
                if parent.get('file', Path(filename).name) != Path(filename).name:
                    raise ValueError('RUNTIME_IMAGE_EXTERNAL_EXTENDS_UNREVIEWED')
                definition = {**services[parent['service']], **definition}
            image = definition.get('image')
            if not image:
                raise ValueError('RUNTIME_IMAGE_SOURCE_MISSING:' + name)
            built = 'build' in definition
            row = {'service': name, 'compose': filename, 'image': image, 'builtFromSource': built,
                   'inBankSmoke': name in constants[group],
                   'mutableThirdPartyTag': not built and not re.search(r'@sha256:[a-f0-9]{64}$', image)}
            if definition.get('profiles'):
                optional.append({**row, 'profiles': definition['profiles']})
            else:
                rows.append(row)
    return {'defaultServiceCount': len(rows), 'defaultImageCount': len({row['image'] for row in rows}),
            'bankSmokeServiceCount': sum(row['inBankSmoke'] for row in rows),
            'outsideBankSmoke': [row['service'] for row in rows if not row['inBankSmoke']],
            'mutableThirdPartyTags': [row['service'] for row in rows if row['mutableThirdPartyTag']],
            'services': rows,
            'optionalServices': optional,
            'limits': 'Default image security scope is not limited to bank-smoke startup. '
                      'Opt-in services retain separate inventory and evidence; exclusion is not a security disposition. '
                      'Inclusion or digest pinning is not advisory disposition or runtime acceptance.'}


def postgres_vendor_gate(versions, requirement):
    if len(set(versions)) != 1:
        raise ValueError('POSTGRES_SERVER_VERSION_NOT_UNIQUE')
    version = versions[0]
    match = re.fullmatch(r'(\d+)\.(\d+)(?:-[^\s]+)?', version)
    if not match:
        raise ValueError('POSTGRES_SERVER_VERSION_UNRECOGNIZED:' + version)
    major, minor = map(int, match.groups())
    if major != requirement['major']:
        raise ValueError('POSTGRES_MAJOR_CHANGE_REQUIRES_REVIEW')
    passed = minor >= requirement['minimumMinor']
    return {'status': 'PASSED' if passed else 'BLOCKED', 'version': version,
            'minimum': f"{requirement['major']}.{requirement['minimumMinor']}",
            'reasonCode': 'VENDOR_MINIMUM_PATCH_MET' if passed else 'PGDG_OSV_VENDOR_COVERAGE_GAP',
            'advisories': requirement['advisories'], 'sources': requirement['sources']}


def package_inventory(native):
    grouped = {}
    for result in native['results']:
        for item in result['packages']:
            if not item.get('vulnerabilities'):
                continue
            package = item['package']
            key = (package['name'], package['version'], package['ecosystem'])
            row = grouped.setdefault(key, {'name': key[0], 'version': key[1], 'ecosystem': key[2],
                                          'advisories': {}, 'status': 'UNDER_INVESTIGATION'})
            for advisory in item['vulnerabilities']:
                fixed = sorted({event['fixed'] for affected in advisory.get('affected', [])
                                if affected['package']['name'] == package['name']
                                for interval in affected.get('ranges', []) for event in interval.get('events', [])
                                if 'fixed' in event})
                row['advisories'][advisory['id']] = {
                    'id': advisory['id'], 'summary': advisory.get('summary'), 'details': advisory.get('details'),
                    'severity': advisory.get('severity', []),
                    'databaseSeverity': advisory.get('database_specific', {}).get('severity'),
                    'fixedVersionsReported': fixed,
                    'references': [r['url'] for r in advisory.get('references', [])]}
    return [{**row, 'advisories': list(row['advisories'].values())} for row in grouped.values()]


def webapp_nginx_gate(versions, requirement):
    if len(set(versions)) != 1:
        raise ValueError('WEBAPP_NGINX_VERSION_NOT_UNIQUE')
    version = versions[0]
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:-[^\s]+)?', version)
    if not match:
        raise ValueError('WEBAPP_NGINX_VERSION_UNRECOGNIZED:' + version)
    major, minor, patch = map(int, match.groups())
    if (major, minor) != (requirement['major'], requirement['minor']):
        raise ValueError('WEBAPP_NGINX_BRANCH_CHANGE_REQUIRES_REVIEW')
    passed = patch >= requirement['minimumPatch']
    return {'status': 'PASSED' if passed else 'BLOCKED', 'version': version,
            'minimum': f"{major}.{minor}.{requirement['minimumPatch']}",
            'reasonCode': 'VENDOR_MINIMUM_PATCH_MET' if passed else 'NGINX_OSV_VENDOR_COVERAGE_GAP',
            'advisories': requirement['advisories'], 'sources': requirement['sources']}


def inspect(name, reference, directory, native_exit, policy, stem):
    native_path, bom_path = directory / (stem + '-native.json'), directory / (stem + '.cdx.json')
    native = json.loads(native_path.read_text(encoding='utf-8'))
    bom = json.loads(bom_path.read_text(encoding='utf-8'))
    image = json.loads(subprocess.run(['docker', 'image', 'inspect', reference], check=True,
                                     capture_output=True, text=True).stdout)[0]
    if bom['metadata']['component']['version'] != image['Id'].removeprefix('sha256:'):
        raise ValueError('FOUNDATION_BOM_IMAGE_MISMATCH:' + name)
    layers = [p['diff_id'] for p in native['image_metadata']['layer_metadata'] if not p['is_empty']]
    if layers != image['RootFS']['Layers']:
        raise ValueError('FOUNDATION_NATIVE_IMAGE_MISMATCH:' + name)
    findings = IMAGE.findings(native, native_exit)
    result = {'name': name, 'reference': reference, 'imageId': image['Id'],
              'nativeScannerExitCode': native_exit, 'nativeScannerStatus': 'FAILED' if findings else 'PASSED',
              'bomSha256': IMAGE.sha(bom_path), 'nativeReportSha256': IMAGE.sha(native_path),
              'uniqueAdvisories': len({r['id'] for r in findings}),
              'affectedPackages': package_inventory(native), 'status': 'UNDER_INVESTIGATION'}
    if name == 'postgres':
        requirement = policy['postgresVendorRequirement']
        versions = [c['version'] for c in bom['components'] if c['name'] == requirement['package']]
        result['vendorGate'] = postgres_vendor_gate(versions, requirement)
    if name == 'webapp':
        requirement = policy['webappNginxRequirement']
        versions = [c['version'] for c in bom['components'] if c['name'] == requirement['package']]
        result['vendorGate'] = webapp_nginx_gate(versions, requirement)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reports', type=Path, required=True)
    parser.add_argument('--native-exit', action='append', required=True, help='Exact subject=exit-code, once per subject')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--candidate', action='store_true', help='Inspect only the exact already-built candidate IDs, not original images')
    args = parser.parse_args()
    policy = json.loads(POLICY.read_text(encoding='utf-8'))
    subjects = policy['candidateSubjects'] if args.candidate else {
        name: {'image': reference, 'reportStem': name} for name, reference in policy['subjects'].items()}
    exits = dict(value.split('=', 1) for value in args.native_exit)
    if set(exits) != set(subjects):
        raise ValueError('FOUNDATION_SUBJECT_COVERAGE_INCOMPLETE')
    rows = [inspect(name, item['image'], args.reports, int(exits[name]), policy, item['reportStem'])
            for name, item in subjects.items()]
    result = {'scope': policy['scope'], 'subjects': rows, 'policySha256': IMAGE.sha(POLICY, text=True),
              'runtimeScope': runtime_scope(ROOT),
              'missingCandidateSubjects': sorted(set(policy['subjects']) - set(subjects)),
              'candidateReady': False, 'releaseDecision': 'NO_GO', 'advisoriesReviewed': False}
    args.output.mkdir(parents=True, exist_ok=False)
    (args.output / 'foundation-inventory.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'subjects': {r['name']: r['uniqueAdvisories'] for r in rows},
                      'postgresVendorGate': next(r['vendorGate']['status'] for r in rows if r['name'] == 'postgres'),
                      'releaseDecision': 'NO_GO'}))


if __name__ == '__main__':
    main()
