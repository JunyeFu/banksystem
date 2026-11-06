"""Exercise the real scanner against synthetic inputs, including every scoped allowance."""
import argparse
import importlib.util
import json
from pathlib import Path
import secrets

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('ci_scan', ROOT / 'scripts/deploy/prepare-ci-scan.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
PATHS = (
    'docs/architecture/refactoring/batches/RF-028/evidence-index.md',
    'docs/architecture/refactoring/batches/RF-057/tasks/S2.md',
    'knowledge-sources/imported/hiagent-2.5.1/2.5.1帮助文档/API & SDK/HiAgent平台API调用示例.md',
    'docs/reference/hiagent-2.5.1-help/readable/HiAgent平台API调用示例.txt',
    'platform/hengzhun-regression-system/scripts/i9-platform-bootstrap.cjs',
    'platform/hengzhun-regression-system/harness/src/service.ts',
    'platform/hengzhun-regression-system/scripts/verification/image-parallel-delivery.test.cjs',
    'platform/hengzhun-regression-system/scripts/verification/runtime-verification.test.cjs',
    'platform/hengzhun-regression-system/scripts/verification/journey-state-machine.test.cjs',
    'services/bank-channel-service/src/test/java/local/bank/channel/payments/TransferContractTest.java',
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gitleaks', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    for scenario, expected in (('clean', 0), ('generic-positive', 1), ('inline-positive', 1)):
        source = args.output / scenario
        report_path = args.output / f'{scenario}-report'
        source.mkdir()
        report_path.mkdir()
        for relative in PATHS:
            target = source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            # These generated values are never issued credentials or sent to an endpoint.
            value = secrets.token_hex(24)
            content = 'public example text\n' if expected == 0 else f'const apiKey = "{value}";'
            if scenario == 'inline-positive':
                content += ' // gitleaks:allow\n'
            target.write_text(content, encoding='utf-8')
        hashes = MODULE.file_hashes(source, PATHS)
        (report_path / 'source-manifest.json').write_text(json.dumps({
            'files': list(PATHS), 'fileHashes': hashes,
            'sourceDigest': MODULE.source_digest(hashes)}, ensure_ascii=False), encoding='utf-8')
        code, report = MODULE.scan(source, report_path, args.gitleaks)
        assert code == expected, (scenario, code)
        if expected:
            detected = {Path(item['File']).as_posix().removeprefix(source.as_posix() + '/') for item in report['findings'] if item['RuleID'] == 'generic-api-key'}
            assert detected == set(PATHS), (scenario, len(detected))
        print(f'GITLEAKS_NATIVE_CONTRACT={scenario}:PASS expectedExit={expected} findings={report["count"]}')


if __name__ == '__main__':
    main()
