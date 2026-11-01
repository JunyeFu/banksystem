"""Review a precise local patch without changing the native vulnerability report."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess

from importlib.util import module_from_spec, spec_from_file_location

SPEC = spec_from_file_location('review_product_dependencies', Path(__file__).with_name('prepare-ci-dependencies.py'))
DEPENDENCIES = module_from_spec(SPEC)
SPEC.loader.exec_module(DEPENDENCIES)
SCAN_SPEC = spec_from_file_location('review_actual_scan', Path(__file__).with_name('scan-ci-dependencies.py'))
SCAN = module_from_spec(SCAN_SPEC)
SCAN_SPEC.loader.exec_module(SCAN)
ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / 'scripts/test/ci-dependency-dispositions.json'


def digest(path):
    return hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()


def review_findings(inventory, source, policy):
    if inventory['status'] == 'ERROR' or not inventory['coverageComplete']:
        raise ValueError('REVIEW_SCAN_ERROR')
    patch = policy['zipPatch']
    for relative, expected in patch['files'].items():
        if digest(source / relative) != expected:
            raise ValueError('REVIEW_PATCH_DRIFT:' + relative)
    package = json.loads((source / 'platform/hengzhun-regression-system/runtime/package.json').read_text(encoding='utf-8'))
    lock = json.loads((source / patch['lockfile']).read_text(encoding='utf-8'))
    installed = lock['packages']['node_modules/extract-zip']
    if (package['dependencies']['extract-zip'] != 'file:../vendor/extract-zip'
            or package['overrides']['extract-zip'] != '$extract-zip'
            or installed.get('resolved') != 'file:../vendor/extract-zip'
            or installed.get('version') != patch['version'] or installed.get('link')):
        raise ValueError('REVIEW_PATCH_BINDING_MISMATCH')
    rows = inventory['findings']
    if not rows:
        if inventory['status'] != 'PASSED' or inventory['scannerExitCode'] != 0:
            raise ValueError('REVIEW_SCAN_RESULT_MISMATCH')
        return 'PASSED'
    if inventory['status'] != 'FAILED' or inventory['scannerExitCode'] != 1:
        raise ValueError('REVIEW_SCAN_RESULT_MISMATCH')
    if len(rows) != 1:
        raise ValueError('REVIEW_UNHANDLED_FINDINGS')
    row = rows[0]
    if (row['lockfile'] != patch['lockfile'] or row['name'] != patch['name']
            or row['version'] != patch['version']
            or {v['id'] for v in row['advisories']} != set(patch['advisories'])):
        raise ValueError('REVIEW_UNHANDLED_FINDINGS')
    return patch['disposition']


def review_licenses(bom, source, policy):
    reviewed = copy.deepcopy(bom)
    own = {}
    for package in DEPENDENCIES.PACKAGES:
        value = json.loads((source / package / 'package.json').read_text(encoding='utf-8'))
        if value.get('license') != 'MPL-2.0':
            raise ValueError('REVIEW_PROJECT_LICENSE_MISSING:' + package)
        own[value['name']] = value['version']
    third = {(row['name'], row['version']): row for row in policy['thirdPartyLicenses']}
    for row in third.values():
        if digest(source / row['evidence']) != row['sha256']:
            raise ValueError('REVIEW_LICENSE_EVIDENCE_DRIFT:' + row['name'])
    unresolved, supplemented = [], []
    for component in reviewed['components']:
        if component['type'] != 'library':
            continue
        name, version = component['name'], component.get('version', 'UNKNOWN')
        if component.get('licenses') and (name, version) not in third:
            continue
        if name in own and version in (own[name], 'UNKNOWN'):
            license_id, basis = 'MPL-2.0', 'Project package.json and root LICENSE; local linked package metadata.'
        elif (name, version) in third:
            row = third[(name, version)]
            license_id, basis = row['license'], row['evidence']
        else:
            unresolved.append({'name': name, 'version': version})
            continue
        component['licenses'] = [{'license': {'id': license_id}}]
        component.setdefault('properties', []).append({'name': 'banksystem:license-review-source', 'value': basis})
        supplemented.append({'name': name, 'version': version, 'license': license_id, 'basis': basis})
    return reviewed, {'status': 'DECLARED_METADATA_REVIEWED' if not unresolved else 'FAILED',
                      'scope': 'DECLARED_NPM_METADATA_ONLY', 'supplemented': supplemented,
                      'unresolved': unresolved, 'obligationsReviewedForCandidate': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--agent-root', type=Path, required=True)
    parser.add_argument('--node', type=Path, required=True)
    args = parser.parse_args()
    if any('banksystem-rf065' not in value.resolve().parts for value in (args.directory, args.source, args.agent_root)) or args.source.name != 'scan-source':
        raise ValueError('REVIEW_CONTROLLED_OWNED_PATH_REQUIRED')
    policy = json.loads(POLICY_PATH.read_text(encoding='utf-8'))
    inventory = json.loads((args.directory / 'vulnerability-inventory.json').read_text(encoding='utf-8'))
    coverage = json.loads((args.directory / 'dependency-coverage.json').read_text(encoding='utf-8'))
    native = json.loads((args.directory / 'dependency-result.json').read_text(encoding='utf-8'))
    actual = SCAN.inventory(json.loads((args.directory / 'dependencies.json').read_text(encoding='utf-8')),
                            coverage, args.directory.resolve(), native['scannerExitCode'])
    actual['queriedAt'] = inventory['queriedAt']
    if actual != inventory:
        raise ValueError('REVIEW_NATIVE_REPORT_MISMATCH')
    if inventory['expectedLocks'] != [f'{p}/package-lock.json' for p in DEPENDENCIES.PACKAGES]:
        raise ValueError('REVIEW_PRODUCT_COVERAGE_MISMATCH')
    for package in DEPENDENCIES.PACKAGES:
        for filename in ('package.json', 'package-lock.json'):
            relative = f'{package}/{filename}'
            if digest(args.source / relative) != digest(args.directory / 'product-dependencies' / relative):
                raise ValueError('REVIEW_SCANNED_INPUT_DRIFT:' + relative)
    status = review_findings(inventory, args.source, policy)
    for relative, expected in policy['zipPatch']['files'].items():
        agent_relative = relative.removeprefix('platform/hengzhun-regression-system/')
        if digest(args.agent_root / agent_relative) != expected:
            raise ValueError('REVIEW_TEST_SOURCE_DRIFT')
    test_relative = 'scripts/verification/runtime-dependency-security.test.cjs'
    if digest(args.agent_root / test_relative) != digest(args.source / 'platform/hengzhun-regression-system' / test_relative):
        raise ValueError('REVIEW_TEST_SOURCE_DRIFT')
    with (args.directory / 'zip-patch-regression.txt').open('w', encoding='utf-8') as log:
        code = subprocess.run([str(args.node), '--test', '--test-name-pattern=patched ZIP',
                               str(args.agent_root / test_relative)], cwd=args.agent_root,
                              stdout=log, stderr=subprocess.STDOUT).returncode
    regression = (args.directory / 'zip-patch-regression.txt').read_text(encoding='utf-8')
    if code or '# pass 4\n' not in regression or '# fail 0\n' not in regression:
        raise ValueError('REVIEW_PATCH_REGRESSION_FAILED')
    bom, license_report = review_licenses(json.loads((args.directory / 'source.cdx.json').read_text(encoding='utf-8')), args.source, policy)
    (args.directory / 'source.reviewed.cdx.json').write_text(json.dumps(bom, indent=2), encoding='utf-8')
    (args.directory / 'license-review.json').write_text(json.dumps(license_report, indent=2), encoding='utf-8')
    report = {'status': status if not license_report['unresolved'] else 'FAILED',
              'nativeScannerStatus': inventory['status'], 'nativeScannerExitCode': inventory['scannerExitCode'],
              'patchRegressionExitCode': code, 'policySha256': digest(POLICY_PATH),
              'patchRegressionSha256': digest(args.directory / 'zip-patch-regression.txt'),
              'patchTestSourceSha256': digest(args.source / 'platform/hengzhun-regression-system' / test_relative),
              'patchFiles': policy['zipPatch']['files'], 'declaredLicenses': license_report['status'],
              'candidateReady': False, 'releaseDecision': 'NO_GO'}
    (args.directory / 'dependency-review.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return 0 if not license_report['unresolved'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
