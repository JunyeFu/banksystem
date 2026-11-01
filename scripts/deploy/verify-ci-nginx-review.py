"""Review the current shared NGINX image only; no blanket image exceptions."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('image_review', Path(__file__).with_name('verify-ci-image-review.py'))
IMAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMAGE)
POLICY_PATH = ROOT / 'scripts/test/ci-nginx-dispositions.json'
SOURCE_SPEC = importlib.util.spec_from_file_location('nginx_source', Path(__file__).with_name('prepare-ci-scan.py'))
SOURCE = importlib.util.module_from_spec(SOURCE_SPEC)
SOURCE_SPEC.loader.exec_module(SOURCE)


def source_files(source):
    files = {'.dockerignore', 'infra/frontend/Dockerfile', 'compose.channel.yaml',
             'contracts/openapi/quality-platform-api.yaml'}
    for relative in ('infra/gateway', 'apps/customer-portal', 'apps/operations-console',
                     'apps/quality-case-portal', 'packages/bank-api-client',
                     'packages/bank-domain-types', 'packages/bank-ui-kit'):
        for directory, children, names in os.walk(source / relative):
            children[:] = [name for name in children if name not in SOURCE.GENERATED
                           and not SOURCE.private_path((Path(directory) / name).relative_to(source).as_posix())]
            files.update((Path(directory) / name).relative_to(source).as_posix()
                         for name in names if SOURCE.source_path((Path(directory) / name).relative_to(source).as_posix()))
    for name in files:
        path = source / name
        if path.is_symlink() or not path.resolve().is_relative_to(source.resolve()):
            raise ValueError('NGINX_INVALID_SOURCE_MEMBER:' + name)
    return sorted(files)


def source_digest(source, controlled=None):
    names = source_files(source)
    if controlled is not None:
        names = [name for name in names if name in controlled]
    rows = [name + ':' + IMAGE.sha(source / name, text=True) for name in names]
    return hashlib.sha256('\n'.join(rows).encode()).hexdigest()


def review(rows, policy, digest):
    result = IMAGE.review(rows, policy, digest)
    result['publisherStatus'] = policy['officialNginxReview']['status']
    if result['publisherStatus'] != 'REVIEWED':
        result['status'] = 'BLOCKED'
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--bom', type=Path, required=True)
    parser.add_argument('--native-report', type=Path, required=True)
    parser.add_argument('--native-exit', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.source.name != 'scan-source' or 'banksystem-rf065' not in args.source.resolve().parts:
        raise ValueError('NGINX_CONTROLLED_SOURCE_REQUIRED')
    if 'banksystem-rf065' not in args.output.resolve().parts:
        raise ValueError('NGINX_OWNED_OUTPUT_REQUIRED')
    args.output.mkdir(parents=True, exist_ok=False)
    policy = json.loads(POLICY_PATH.read_text(encoding='utf-8'))
    bom = json.loads(args.bom.read_text(encoding='utf-8'))
    native = json.loads(args.native_report.read_text(encoding='utf-8'))
    inspection = json.loads(subprocess.run(['docker', 'image', 'inspect', args.image],
                                          check=True, capture_output=True, text=True).stdout)[0]
    if (inspection['Id'] not in policy['reviewedImages'].values()
            or bom['metadata']['component']['version'] != inspection['Id'].removeprefix('sha256:')
            or not (inspection['RootFS']['Layers'] == policy['baseLayers']
                    or inspection['RootFS']['Layers'][:-1] == policy['baseLayers'])
            or inspection['Config']['Entrypoint'] != ['/docker-entrypoint.sh']
            or inspection['Config']['Cmd'] != ['nginx', '-g', 'daemon off;']):
        raise ValueError('NGINX_IMAGE_BINDING_MISMATCH')
    layers = [p['diff_id'] for p in native['image_metadata']['layer_metadata'] if not p['is_empty']]
    if layers != inspection['RootFS']['Layers']:
        raise ValueError('NGINX_NATIVE_BINDING_MISMATCH')
    nginx = next(c for c in bom['components'] if c['name'] == 'nginx' and c['type'] == 'library')
    if nginx['version'] != '1.30.6-r1':
        raise ValueError('NGINX_VERSION_NOT_REVIEWED')
    rows = IMAGE.findings(native, args.native_exit)
    result = review(rows, policy, source_digest(args.source))
    result.update({'imageId': inspection['Id'], 'nativeScannerExitCode': args.native_exit,
                   'nativeScannerStatus': 'FAILED' if rows else 'PASSED',
                   'officialNginxReview': policy['officialNginxReview'],
                   'nativeReportSha256': IMAGE.sha(args.native_report),
                   'bomSha256': IMAGE.sha(args.bom), 'policySha256': IMAGE.sha(POLICY_PATH, text=True),
                   'candidateReady': False, 'releaseDecision': 'NO_GO',
                   'licenseDistributionGateCompleted': False})
    (args.output / 'nginx-review.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({key: result[key] for key in ('status', 'uniqueAdvisories', 'reviewedAdvisories', 'blockingAdvisories', 'nativeScannerExitCode')}))
    return 0 if result['status'] == 'REVIEWED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
