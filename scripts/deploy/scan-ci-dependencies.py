"""Generate the declared product SBOM and propagate the actual OSV result."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess

from importlib.util import module_from_spec, spec_from_file_location

SPEC = spec_from_file_location('product_dependencies', Path(__file__).with_name('prepare-ci-dependencies.py'))
DEPENDENCIES = module_from_spec(SPEC)
SPEC.loader.exec_module(DEPENDENCIES)


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def inventory(report, coverage, directory, scanner_exit):
    expected = {str((directory / 'product-dependencies' / lock).resolve()).replace('\\', '/'): lock for lock in coverage['locks']}
    observed = {item['source']['path'].replace('\\', '/'): item for item in report['results']}
    rows = []
    for path, result in observed.items():
        if path not in expected:
            continue
        lock = expected[path]
        entries = json.loads((directory / 'product-dependencies' / lock).read_text(encoding='utf-8'))['packages']
        root = entries['']
        for item in result['packages']:
            advisories = item.get('vulnerabilities', [])
            if not advisories:
                continue
            package = item['package']
            locations = [(key, value) for key, value in entries.items() if key.endswith('/node_modules/' + package['name']) or key == 'node_modules/' + package['name']]
            locations = [(key, value) for key, value in locations if value.get('version') == package['version']]
            rows.append({
                'lockfile': lock, 'name': package['name'], 'version': package['version'],
                'lockLocations': [key for key, _ in locations],
                'declarationScopes': sorted({'DEVELOPMENT' if value.get('dev', False) else 'RUNTIME' for _, value in locations}),
                'directDeclarations': [scope for scope in ('dependencies', 'devDependencies', 'optionalDependencies') if package['name'] in root.get(scope, {})],
                'advisories': [{'id': v['id'], 'summary': v.get('summary', ''), 'severity': v.get('database_specific', {}).get('severity', 'UNKNOWN'),
                                'published': v.get('published'), 'references': [r['url'] for r in v.get('references', [])],
                                'fixedVersions': sorted({event['fixed'] for affected in v.get('affected', []) if affected.get('package', {}).get('name') == package['name'] for r in affected.get('ranges', []) for event in r.get('events', []) if 'fixed' in event})}
                               for v in advisories],
            })
    complete = set(observed) == set(expected)
    status = 'PASSED' if scanner_exit == 0 and not rows and complete else 'FAILED'
    if scanner_exit not in (0, 1) or not complete or (scanner_exit == 0 and rows) or (scanner_exit == 1 and not rows):
        status = 'ERROR'
    return {'status': status, 'scannerExitCode': scanner_exit, 'queriedAt': datetime.now(timezone.utc).isoformat(),
            'scope': 'DECLARED_PRODUCT_NPM_DEPENDENCIES', 'installedRuntimeProven': False,
            'expectedLocks': coverage['locks'], 'coveredLocks': sorted(expected[path] for path in observed if path in expected),
            'coverageComplete': complete, 'vulnerablePackageOccurrences': len(rows),
            'uniquePackageVersions': len({(r['name'], r['version']) for r in rows}),
            'uniqueAdvisories': len({v['id'] for r in rows for v in r['advisories']}), 'findings': rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--syft', type=Path, required=True)
    parser.add_argument('--osv-scanner', type=Path, required=True)
    args = parser.parse_args()
    directory = args.directory.resolve()
    if 'banksystem-rf065' not in directory.parts:
        raise ValueError('DEPENDENCY_OWNED_DIRECTORY_REQUIRED')
    coverage = json.loads((directory / 'dependency-coverage.json').read_text(encoding='utf-8'))
    required = [f'{package}/package-lock.json' for package in DEPENDENCIES.PACKAGES]
    if coverage['locks'] != required or coverage['scope'] != 'DECLARED_PRODUCT_NPM_DEPENDENCIES':
        raise ValueError('DEPENDENCY_PRODUCT_COVERAGE_MISMATCH')
    outputs = ['source.cdx.json', 'dependencies.json', 'dependency-result.json', 'vulnerability-inventory.json', 'license-unresolved.json']
    if any((directory / name).exists() for name in outputs):
        raise ValueError('DEPENDENCY_NEW_REPORTS_REQUIRED')
    policy = Path(__file__).resolve().parents[1] / 'test/ci-syft.yaml'
    code = subprocess.run([str(args.syft), '--config', str(policy), 'scan', f'dir:{directory / "product-dependencies"}', '--source-name', 'banksystem-product-dependencies',
                           '-o', f'cyclonedx-json={directory / "source.cdx.json"}']).returncode
    if code:
        write_json(directory / 'dependency-result.json', {'status': 'ERROR', 'stage': 'SBOM', 'scannerExitCode': code})
        return code
    bom = json.loads((directory / 'source.cdx.json').read_text(encoding='utf-8'))
    unresolved = [{key: c.get(key) for key in ('name', 'version', 'purl', 'bom-ref')} for c in bom['components'] if c['type'] == 'library' and not c.get('licenses')]
    write_json(directory / 'license-unresolved.json', {'status': 'REVIEW_REQUIRED' if unresolved else 'DECLARED_METADATA_PRESENT',
               'scope': 'SBOM_DECLARED_LICENSE_METADATA_ONLY', 'obligationsReviewed': False, 'count': len(unresolved), 'components': unresolved})
    command = [str(args.osv_scanner), 'scan', 'source', '--format=json', '--all-packages', f'--output-file={directory / "dependencies.json"}']
    for lock in required:
        command.extend(['--lockfile', ':' + str(directory / 'product-dependencies' / lock)])
    code = subprocess.run(command).returncode
    if not (directory / 'dependencies.json').is_file():
        write_json(directory / 'dependency-result.json', {'status': 'ERROR', 'stage': 'OSV', 'scannerExitCode': code})
        return code or 2
    result = inventory(json.loads((directory / 'dependencies.json').read_text(encoding='utf-8')), coverage, directory, code)
    write_json(directory / 'vulnerability-inventory.json', result)
    write_json(directory / 'dependency-result.json', {key: value for key, value in result.items() if key != 'findings'})
    print(f'DEPENDENCY_SCAN={result["status"]} locks={len(result["coveredLocks"])} vulnerablePackageOccurrences={result["vulnerablePackageOccurrences"]} uniqueAdvisories={result["uniqueAdvisories"]}')
    return 2 if result['status'] == 'ERROR' else code


if __name__ == '__main__':
    raise SystemExit(main())
