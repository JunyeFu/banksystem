"""Prepare the fixed Debian APT security patch context, never operate a service."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
GOSU_SHA256 = '659327a56817bc638fdf26d65afcaf509af1e5df0f52ecedf3a9ba32558c5fa7'
PACKAGES = {
    'apt_3.0.4_amd64.deb': {'size': 1453228, 'sha256': '15c2030e0fb46580af4f1b4cc303f4bd26da781b004e99763bc9eff7cf8e19b8'},
    'libapt-pkg7.0_3.0.4_amd64.deb': {'size': 1113872, 'sha256': '577eb8f489de419290102364892dbd13ca256297b61f96d61b114fd4ac18be41'},
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(gosu_context, downloads, output):
    if 'banksystem-rf065' not in output.resolve().parts:
        raise ValueError('APT_OWNED_OUTPUT_REQUIRED')
    for filename, expected in PACKAGES.items():
        archive = downloads / filename
        if archive.stat().st_size != expected['size'] or sha(archive) != expected['sha256']:
            raise ValueError('APT_PUBLISHER_PACKAGE_MISMATCH:' + filename)
    if sha(gosu_context / 'gosu') != GOSU_SHA256:
        raise ValueError('APT_PRESERVED_GOSU_MISMATCH')
    patch = json.loads((gosu_context / 'notices/local-patch.json').read_text(encoding='utf-8'))
    if patch['binarySha256'] != GOSU_SHA256 or patch['version'] != '1.19-rf065-moby041-go12610':
        raise ValueError('APT_GOSU_SOURCE_MATERIAL_MISMATCH')
    output.mkdir(parents=True, exist_ok=False)
    context = output / 'context'
    context.mkdir()
    shutil.copyfile(gosu_context / 'gosu', context / 'gosu')
    shutil.copytree(gosu_context / 'notices', context / 'notices')
    packages = context / 'packages'
    packages.mkdir()
    for filename in PACKAGES:
        shutil.copyfile(downloads / filename, packages / filename)
    shutil.copyfile(ROOT / 'scripts/deploy/postgres-apt-patch.Dockerfile', context / 'Dockerfile')
    manifest = {'scope': 'FIXED_PG18_6_APT_3_0_4_CANDIDATE_ONLY',
                'debianRelease': 'trixie-security', 'architecture': 'amd64',
                'advisory': 'CVE-2026-109518', 'gosuSha256': GOSU_SHA256,
                'packages': [{**expected, 'filename': filename,
                              'url': 'https://security.debian.org/debian-security/pool/updates/main/a/apt/' + filename}
                             for filename, expected in PACKAGES.items()],
                'releaseDecision': 'NO_GO', 'originalServicesModified': False}
    (output / 'apt-patch-inputs.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'packages': len(PACKAGES), 'version': '3.0.4', 'releaseDecision': 'NO_GO'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gosu-context', type=Path, required=True)
    parser.add_argument('--downloads', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.gosu_context.resolve(), args.downloads.resolve(), args.output.resolve())
