"""Prepare the two authorized foundation contexts, without touching live services."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MQ_SHA512 = '89784176c6890cc3f766ea4b168852ee0ca8c9a8da9bc48ed7b585bad4ec2a1fd90f91a14a01f55ae50f8f91c28b16df27d32d26d778418bde239c8fdb72618e'


def patch_jackson(home, downloads):
    changed = []
    for artifact in ('jackson-core', 'jackson-databind'):
        source = downloads / (artifact + '-2.22.3.jar')
        expected = (downloads / (source.name + '.sha512')).read_text(encoding='utf-8').split()[0].lower()
        if hashlib.sha512(source.read_bytes()).hexdigest() != expected:
            raise ValueError('MQ_JACKSON_PUBLISHER_CHECKSUM_MISMATCH:' + artifact)
        with zipfile.ZipFile(source) as bundle:
            data = bundle.read('META-INF/maven/com.fasterxml.jackson.core/' + artifact + '/pom.properties').decode()
        props = dict(line.split('=', 1) for line in data.splitlines() if '=' in line and not line.startswith('#'))
        if (props['groupId'], props['artifactId'], props['version']) != ('com.fasterxml.jackson.core', artifact, '2.22.3'):
            raise ValueError('MQ_JACKSON_ARTIFACT_IDENTITY_MISMATCH')
        old = home / 'lib' / (artifact + '-2.22.1.jar')
        original = hashlib.sha256(old.read_bytes()).hexdigest()
        old.unlink()
        shutil.copyfile(source, home / 'lib' / source.name)
        changed.append({'original': old.name, 'originalSha256': original, 'target': source.name,
                        'targetSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sha512': expected,
                        'source': 'https://repo.maven.apache.org/maven2/com/fasterxml/jackson/core/' + artifact + '/2.22.3/' + source.name})
    return changed


def prepare(archive, entrypoint, output, jackson_downloads):
    if hashlib.sha512(archive.read_bytes()).hexdigest() != MQ_SHA512:
        raise ValueError('ACTIVEMQ_PUBLISHER_ARCHIVE_CHECKSUM_MISMATCH')
    output.mkdir(parents=True, exist_ok=False)
    mq = output / 'activemq'
    mq.mkdir()
    with tarfile.open(archive) as bundle:
        bundle.extractall(mq, filter='data')
    home = mq / 'apache-activemq-6.2.10'
    if not (home / 'lib/activemq-broker-6.2.10.jar').is_file():
        raise ValueError('ACTIVEMQ_BROKER_VERSION_NOT_EXPECTED')
    changed = patch_jackson(home, jackson_downloads)
    shutil.copyfile(entrypoint, mq / 'entrypoint.sh')
    shutil.copyfile(ROOT / 'scripts/deploy/activemq-foundation.Dockerfile', mq / 'Dockerfile')
    pg = output / 'postgres'
    pg.mkdir()
    shutil.copyfile(ROOT / 'scripts/deploy/postgres-foundation.Dockerfile', pg / 'Dockerfile')
    files = {p.relative_to(mq).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(mq.rglob('*')) if p.is_file()}
    result = {'scope': 'RF065_S3_8_NEW_FOUNDATION_IMAGES_ONLY', 'archiveSha512': MQ_SHA512,
              'archiveSource': 'https://archive.apache.org/dist/activemq/6.2.10/apache-activemq-6.2.10-bin.tar.gz',
              'activemqFiles': files, 'candidateReady': False, 'releaseDecision': 'NO_GO',
              'dependencyPatches': changed,
              'limits': 'ActiveMQ 6.2.10 is the final inactive 6.2 line patch, not a claim of continued upstream support. PostgreSQL stays major 18, no old data mounted. Keycloak upgrade not included.'}
    (output / 'foundation-patch-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'activemqVersion': '6.2.10', 'activemqFiles': len(files), 'postgresMajor': 18, 'releaseDecision': 'NO_GO'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--activemq-archive', type=Path, required=True)
    parser.add_argument('--activemq-entrypoint', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--jackson-downloads', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.activemq_archive, args.activemq_entrypoint, args.output, args.jackson_downloads)
