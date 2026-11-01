"""Bind precise remaining Fineract findings to the preserved derived image."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/deploy' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


IMAGE = load('image_review', 'verify-ci-image-review.py')
PATCH = load('fineract_patch', 'prepare-fineract-dependency-patch.py')
POLICY = ROOT / 'scripts/test/ci-fineract-dispositions.json'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--bom', type=Path, required=True)
    parser.add_argument('--native-report', type=Path, required=True)
    parser.add_argument('--original-native-report', type=Path, required=True)
    parser.add_argument('--native-exit', type=int, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    policy = json.loads(POLICY.read_text(encoding='utf-8'))
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    preserved = PATCH.verify(args.app, manifest)
    digest = IMAGE.sha(args.manifest)
    if digest != IMAGE.sha(args.app / 'rf065-dependency-patch-manifest.json'):
        raise ValueError('FINERACT_EMBEDDED_MANIFEST_MISMATCH')
    inspection = json.loads(subprocess.run(['docker', 'image', 'inspect', args.image],
                                          check=True, capture_output=True, text=True).stdout)[0]
    bom = json.loads(args.bom.read_text(encoding='utf-8'))
    native = json.loads(args.native_report.read_text(encoding='utf-8'))
    layers = [p['diff_id'] for p in native['image_metadata']['layer_metadata'] if not p['is_empty']]
    if (inspection['Id'] != policy['reviewedImageId']
            or bom['metadata']['component']['version'] != inspection['Id'].removeprefix('sha256:')
            or layers != inspection['RootFS']['Layers']
            or inspection['Config']['User'] != 'nobody:nogroup'
            or inspection['Config']['Entrypoint'] != ['java', '-cp', '@/app/jib-classpath-file', 'org.apache.fineract.ServerApplication']):
        raise ValueError('FINERACT_IMAGE_BINDING_MISMATCH')
    refs = PATCH.feature_references(args.app)
    allowed = {'ACRParameterLoader', 'DynaBeanACRParameterLoader', 'ACRPolicyFileLoader', 'ACRParameterLoaderHelper'}
    if len(refs) != 4 or any(row['archive'] != 'esapi-2.7.0.0.jar'
                            or Path(row['class']).stem not in allowed
                            or row['references'] != ['org/apache/commons/configuration/'] for row in refs):
        raise ValueError('FINERACT_REVIEW_FEATURE_CONSUMER_DRIFT')
    esapi = PATCH.properties((args.app / 'resources/ESAPI.properties').read_bytes())
    if esapi['ESAPI.AccessControl'] != 'org.owasp.esapi.reference.DefaultAccessController':
        raise ValueError('FINERACT_ESAPI_POLICY_DRIFT')
    result = IMAGE.review(IMAGE.findings(native, args.native_exit), policy, digest)
    original = json.loads(args.original_native_report.read_text(encoding='utf-8'))
    original_inspection = json.loads(subprocess.run(['docker', 'image', 'inspect', manifest['originalImage']],
                                                   check=True, capture_output=True, text=True).stdout)[0]
    original_layers = [p['diff_id'] for p in original['image_metadata']['layer_metadata'] if not p['is_empty']]
    if original_layers != original_inspection['RootFS']['Layers']:
        raise ValueError('FINERACT_ORIGINAL_NATIVE_BINDING_MISMATCH')
    original_rows = IMAGE.findings(original, 1)
    remaining = {(row['name'], row['version'], row['ecosystem'], row['id']) for row in result['reviewed'] + result['blocking']}
    inventory = [{**row, 'currentStatus': 'REMAINING_PRECISE_REVIEW' if
                  (row['name'], row['version'], row['ecosystem'], row['id']) in remaining else
                  'NO_LONGER_REPORTED_AFTER_DEPENDENCY_PATCH'} for row in original_rows]
    result.update({'imageId': inspection['Id'], 'nativeScannerExitCode': args.native_exit,
                   'nativeScannerStatus': 'FAILED' if args.native_exit == 1 else 'PASSED',
                   'preservation': preserved, 'featureReferences': refs,
                   'nativeReportSha256': IMAGE.sha(args.native_report), 'bomSha256': IMAGE.sha(args.bom),
                   'policySha256': IMAGE.sha(POLICY, text=True), 'candidateReady': False,
                   'originalUniqueAdvisories': len({row['id'] for row in original_rows}),
                   'originalAdvisoryInventory': inventory,
                   'originalNativeReportSha256': IMAGE.sha(args.original_native_report),
                   'releaseDecision': 'NO_GO', 'runtimeGoldenPathVerified': False,
                   'licenseDistributionGateCompleted': False})
    (args.output / 'fineract-review.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({key: result[key] for key in ('status', 'uniqueAdvisories', 'reviewedAdvisories', 'blockingAdvisories', 'nativeScannerExitCode')}))
    return 0 if result['status'] == 'REVIEWED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
