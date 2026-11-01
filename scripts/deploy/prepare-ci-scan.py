"""Copy controlled source and run redacted Gitleaks; never copy local state."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

PRODUCT = 'platform/hengzhun-regression-system'
POLICY = Path(__file__).resolve().parents[1] / 'test/ci-gitleaks.toml'
IGNORE = Path(__file__).resolve().parents[1] / 'test/ci-gitleaks-empty.ignore'
GENERATED = {'.git', '.data', '.local', 'node_modules', 'dist', 'target', 'build', 'logs', 'backups', 'midscene_run', 'playwright-report', 'test-results', '__pycache__'}


class SourceBoundaryError(Exception):
    def __init__(self, code, paths=()):
        super().__init__(code)
        self.code = code
        self.paths = sorted(paths)


def private_path(relative):
    path = Path(relative)
    if relative in ('.env.example', 'secrets/.gitkeep'):
        return False
    return bool(re.match(r'^\.env(?:\..*)?$', path.name) or path.name == 'runtime.env'
                or path.suffix in ('.pem', '.key') or path.name.startswith('storage-state')
                or any(part in {'.data', '.local', 'secrets'} for part in path.parts))


def source_path(relative):
    parts = Path(relative).parts
    if Path(relative).suffix.lower() == '.env':
        return False
    if any(part in GENERATED for part in parts):
        return False
    if relative.startswith(('agent/runs/', 'rag/index/', 'knowledge-sources/raw/', 'deliverables/', 'data/', 'nodejs20-midscene/')):
        return False
    if relative.startswith(f'{PRODUCT}/runtime/'):
        return relative in (f'{PRODUCT}/runtime/package.json', f'{PRODUCT}/runtime/package-lock.json')
    if relative.startswith(f'{PRODUCT}/config/'):
        return relative.endswith(('.example.json', '.schema.json', '/demo-runtime-freeze.json', '/internship-delivery-freeze.json'))
    return not private_path(relative)


def git_paths(repository, *arguments):
    result = subprocess.run(['git', '-c', 'core.quotepath=false', 'ls-files', '-z', *arguments], cwd=repository, check=True, capture_output=True)
    return [item.decode('utf-8') for item in result.stdout.split(b'\0') if item]


def file_hashes(source, files):
    result = {}
    for relative in files:
        path = source / relative
        if (not source_path(relative) or Path(relative).is_absolute() or '..' in Path(relative).parts
                or path.is_symlink() or not path.resolve().is_relative_to(source.resolve())):
            raise SourceBoundaryError('CI_SCAN_INVALID_SOURCE_MEMBER', [relative])
        result[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def source_digest(hashes):
    return hashlib.sha256('\n'.join(f'{name}:{hashes[name]}' for name in sorted(hashes)).encode()).hexdigest()


def prepare(repository, output):
    repository, output = repository.resolve(), output.resolve()
    if 'banksystem-rf065' not in output.parts or output == repository or repository in output.parents:
        raise SourceBoundaryError('CI_SCAN_OWNED_OUTPUT_REQUIRED')
    tracked = git_paths(repository, '--cached')
    untracked = git_paths(repository, '--others', '--exclude-standard')
    # Check names and file metadata first. No forbidden content is ever opened.
    forbidden = [item for item in tracked if private_path(item) and (repository / item).exists()]
    if forbidden:
        raise SourceBoundaryError('CI_SCAN_TRACKED_PRIVATE_PATH', forbidden)
    eligible = [item for item in sorted(set(tracked + untracked)) if source_path(item) and (repository / item).is_file()]
    for item in eligible:
        candidate = repository / item
        if candidate.is_symlink() or not candidate.resolve().is_relative_to(repository):
            raise SourceBoundaryError('CI_SCAN_EXTERNAL_SOURCE_LINK', [item])
    output.mkdir(parents=True, exist_ok=False)
    source = output / 'scan-source'
    source.mkdir()
    for item in eligible:
        destination = source / item
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repository / item, destination)
    hashes = file_hashes(source, eligible)
    manifest = {'source': str(repository), 'files': eligible, 'fileHashes': hashes, 'sourceDigest': source_digest(hashes),
                'excluded': sorted(set(tracked + untracked) - set(eligible)), 'scope': 'CURRENT_CONTROLLED_SOURCE', 'historyScanned': False}
    (output / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return source, len(eligible)


def scan(source, output, executable):
    manifest = json.loads((output / 'source-manifest.json').read_text(encoding='utf-8'))
    if file_hashes(source, manifest['files']) != manifest['fileHashes']:
        raise SourceBoundaryError('CI_SCAN_SOURCE_CHANGED_BEFORE_SCAN')
    raw = output / 'gitleaks-redacted.json'
    with (output / 'scanner.log').open('w', encoding='utf-8') as log:
        result = subprocess.run([str(executable), 'dir', str(source), '--redact=100', '--report-format=json', f'--report-path={raw}', f'--config={POLICY}', f'--gitleaks-ignore-path={IGNORE}', '--ignore-gitleaks-allow'], stdout=log, stderr=subprocess.STDOUT)
    if result.returncode not in (0, 1):
        report = {'status': 'ERROR', 'scannerExitCode': result.returncode}
    else:
        findings = json.loads(raw.read_text(encoding='utf-8'))
        # Public artifact has metadata only, not raw Secret/Match or source excerpts.
        public = [{key: finding[key] for key in ('RuleID', 'File', 'StartLine', 'EndLine', 'Fingerprint') if key in finding} for finding in findings]
        if result.returncode == 0 and public:
            raise SourceBoundaryError('CI_SCAN_RESULT_EXIT_MISMATCH')
        report = {'status': 'PASSED' if result.returncode == 0 else 'FAILED', 'scannerExitCode': result.returncode, 'findings': public, 'count': len(public)}
    report['sourceDigest'] = manifest['sourceDigest']
    code = result.returncode
    if file_hashes(source, manifest['files']) != manifest['fileHashes']:
        report.update({'status': 'ERROR', 'errorCode': 'CI_SCAN_SOURCE_CHANGED_DURING_SCAN'})
        code = 2
    (output / 'secrets.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return code, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--gitleaks', type=Path)
    args = parser.parse_args()
    try:
        source, count = prepare(args.repository, args.output)
        if args.gitleaks:
            code, report = scan(source, args.output, args.gitleaks)
            print(json.dumps({'status': report['status'], 'files': count,
                              'scannerExitCode': report['scannerExitCode'], 'exitCode': code}))
            return code
        print(json.dumps({'status': 'PREPARED', 'files': count, 'source': str(source)}))
        return 0
    except SourceBoundaryError as error:
        print(json.dumps({'status': 'FAILED', 'errorCode': error.code, 'paths': error.paths}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
