"""Select the nine shipped npm dependency trees from a passed controlled-source scan."""
import argparse
import json
from pathlib import Path
import shutil

PACKAGES = (
    'packages/bank-api-client', 'packages/bank-ui-kit',
    'apps/customer-portal', 'apps/operations-console', 'apps/quality-case-portal',
    'platform/hengzhun-regression-system',
    'platform/hengzhun-regression-system/controller',
    'platform/hengzhun-regression-system/agent-cli',
    'platform/hengzhun-regression-system/runtime',
)
VENDOR_FILES = tuple(f'platform/hengzhun-regression-system/vendor/extract-zip/{name}'
                     for name in ('package.json', 'index.js', 'LICENSE'))


def prepare(source, output):
    source, output = source.resolve(), output.resolve()
    if source.name != 'scan-source' or 'banksystem-rf065' not in source.parts:
        raise ValueError('DEPENDENCY_CONTROLLED_SOURCE_REQUIRED')
    if 'banksystem-rf065' not in output.parts or source == output or source in output.parents:
        raise ValueError('DEPENDENCY_NEW_OWNED_OUTPUT_REQUIRED')
    report = json.loads((source.parent / 'secrets.json').read_text(encoding='utf-8'))
    if report['status'] != 'PASSED' or report['scannerExitCode'] != 0 or report['count'] != 0:
        raise ValueError('DEPENDENCY_SECRET_SCAN_NOT_PASSED')
    files = [f'{package}/{name}' for package in PACKAGES for name in ('package.json', 'package-lock.json')] + list(VENDOR_FILES)
    for relative in files:
        if not (source / relative).is_file():
            raise ValueError(f'DEPENDENCY_FILE_MISSING:{relative}')
    output.mkdir(parents=True, exist_ok=False)
    product = output / 'product-dependencies'
    for relative in files + ['LICENSE']:
        destination = product / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, destination)
    coverage = {'source': str(source), 'scope': 'DECLARED_PRODUCT_NPM_DEPENDENCIES', 'packages': list(PACKAGES), 'locks': [f'{package}/package-lock.json' for package in PACKAGES], 'java': 'ACTUAL_BANK_IMAGE_SBOM_REQUIRED', 'rootLicense': 'MPL-2.0', 'installedRuntimeProven': False}
    (output / 'dependency-coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'DEPENDENCY_SOURCE=PREPARED packages={len(PACKAGES)} root={product}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source, args.output)
