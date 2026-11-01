"""Build the authorized gosu 1.19 Moby parser patch, never run the target."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
COMMIT = '6456aaa0f3c854d199d0f037f068eb97515b7513'
ARCHIVE_SHA256 = '33d7537d588ea49458b9509bcf4554bdf5ceacc66da71e5caa1058ea3b689c3b'
PATCH_VERSION = '1.19-rf065-moby041'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare_source(archive, output):
    if sha(archive) != ARCHIVE_SHA256:
        raise ValueError('GOSU_PUBLIC_SOURCE_CHECKSUM_MISMATCH')
    output.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive) as bundle:
        bundle.extractall(output, filter='data')
    return output / ('gosu-' + COMMIT)


def patch_version(home):
    version = home / 'version.go'
    text = version.read_text(encoding='utf-8')
    if text.count('const Version = "1.19"') != 1:
        raise ValueError('GOSU_VERSION_SOURCE_CHANGED')
    version.write_text(text.replace('const Version = "1.19"', 'const Version = "' + PATCH_VERSION + '"'),
                       encoding='utf-8', newline='\n')


def verify_preserved(home, original):
    for name, digest in original.items():
        if sha(home / name) != digest:
            raise ValueError('GOSU_PROGRAM_SOURCE_CHANGED:' + name)


def stream(text):
    rows, decoder = [], json.JSONDecoder()
    while text.strip():
        row, end = decoder.raw_decode(text.lstrip())
        rows.append(row)
        text = text.lstrip()[end:]
    return rows


def prepare(archive, go, output):
    if 'banksystem-rf065' not in output.resolve().parts:
        raise ValueError('GOSU_OWNED_OUTPUT_REQUIRED')
    env = {**os.environ, 'GOENV': 'off', 'GOFLAGS': '', 'GOTOOLCHAIN': 'local', 'GOTELEMETRY': 'off',
           'GOWORK': 'off', 'GOAMD64': 'v1',
           'GOPROXY': 'https://proxy.golang.org', 'GOSUMDB': 'sum.golang.org',
           'GOPRIVATE': '', 'GONOPROXY': '', 'GONOSUMDB': '',
           'GOCACHE': str(output / 'build-cache'), 'GOMODCACHE': str(output / 'mod-cache'),
           'GOPATH': str(output / 'tools'), 'GOOS': 'linux', 'GOARCH': 'amd64', 'CGO_ENABLED': '0'}
    tool_version = subprocess.run([str(go), 'version'], env=env, check=True,
                                  capture_output=True, text=True).stdout.strip()
    if not tool_version.startswith('go version go1.26.9 '):
        raise ValueError('GOSU_COMPILER_VERSION_CHANGED')
    home = prepare_source(archive, output)
    original = {name: sha(home / name) for name in ('main.go', 'setup-user.go')}
    patch_version(home)

    def run(label, *args):
        result = subprocess.run([str(go), *args], cwd=home, env=env, capture_output=True, text=True)
        (output / (label + '.stdout.txt')).write_text(result.stdout, encoding='utf-8')
        (output / (label + '.stderr.txt')).write_text(result.stderr, encoding='utf-8')
        result.check_returncode()
        return result.stdout

    run('mod-edit', 'mod', 'edit', '-require=github.com/moby/sys/user@v0.4.1')
    run('mod-tidy', 'mod', 'tidy')
    downloaded = stream(run('mod-download', 'mod', 'download', '-json', 'all'))
    modules = stream(run('mod-list', 'list', '-m', '-json', 'all'))
    expected = {'github.com/moby/sys/user': 'v0.4.1', 'golang.org/x/sys': 'v0.1.0'}
    if {row['Path']: row['Version'] for row in modules if not row.get('Main')} != expected:
        raise ValueError('GOSU_UNPLANNED_MODULE_CHANGE')
    context = output / 'context'
    notices = context / 'notices'
    notices.mkdir(parents=True)
    run('build', 'build', '-trimpath', '-buildvcs=false', '-mod=readonly', '-ldflags=-s -w',
        '-o', str(context / 'gosu'), '.')
    verify_preserved(home, original)
    shutil.copyfile(ROOT / 'scripts/deploy/postgres-gosu-patch.Dockerfile', context / 'Dockerfile')
    shutil.copyfile(home / 'LICENSE', notices / 'gosu-LICENSE')
    goroot = Path(run('goroot', 'env', 'GOROOT').strip())
    shutil.copyfile(goroot / 'LICENSE', notices / 'Go-LICENSE')
    for row in modules:
        if row.get('Main'):
            continue
        module_dir = Path(row['Dir'])
        name = 'moby-sys-user' if row['Path'] == 'github.com/moby/sys/user' else 'golang-x-sys'
        shutil.copyfile(module_dir / 'LICENSE', notices / (name + '-LICENSE'))
        if (module_dir / 'NOTICE').is_file():
            shutil.copyfile(module_dir / 'NOTICE', notices / (name + '-NOTICE'))
    shutil.copytree(home, notices / 'patched-source')
    manifest = {'scope': 'RF065_S3_8_GOSU_MOBY_DEPENDENCY_PATCH_ONLY', 'version': PATCH_VERSION,
                'sourceCommit': COMMIT, 'sourceArchiveSha256': ARCHIVE_SHA256,
                'sourceUrl': 'https://codeload.github.com/tianon/gosu/tar.gz/' + COMMIT,
                'compiler': tool_version, 'compilerSha256': sha(go),
                'buildTarget': 'linux/amd64/CGO_ENABLED=0', 'binarySha256': sha(context / 'gosu'),
                'preservedProgramSources': original,
                'changedSources': {name: sha(home / name) for name in ('go.mod', 'go.sum', 'version.go')},
                'dependencies': [{key: row[key] for key in ('Path', 'Version', 'Sum', 'GoModSum')}
                                 for row in downloaded],
                'candidateReady': False, 'releaseDecision': 'NO_GO',
                'limits': 'Locally rebuilt gosu, not the upstream signed binary. PostgreSQL18.6 '
                          'and its entrypoint/data remain unchanged; native re-scan and integration still required.'}
    (notices / 'local-patch.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'version': PATCH_VERSION, 'binarySha256': manifest['binarySha256'],
                      'dependencies': expected, 'releaseDecision': 'NO_GO'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('archive', 'go', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    prepare(args.archive, args.go.resolve(), args.output.resolve())
