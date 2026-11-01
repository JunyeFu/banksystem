"""Prepare a fixed Fineract dependency overlay; never modify an original image or DB."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import re
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / 'scripts/test/ci-fineract-dependency-patch.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def properties(data):
    return dict(line.split('=', 1) for line in data.decode().splitlines()
                if '=' in line and not line.startswith('#'))


def coordinates(archive, artifact, version):
    if artifact.startswith('tomcat-embed-'):
        # These actual Tomcat JARs publish OSGi metadata, not pom.properties.
        manifest = dict(line.split(': ', 1) for line in archive.read('META-INF/MANIFEST.MF').decode().splitlines()
                        if ': ' in line and not line.startswith(' '))
        bundle = 'tomcat-embed-jasper-el' if artifact == 'tomcat-embed-el' else artifact
        if (manifest['Bundle-Name'], manifest['Bundle-Version']) != (bundle, version):
            raise ValueError('FINERACT_TOMCAT_MANIFEST_MISMATCH')
        return {'artifactId': artifact, 'groupId': 'org.apache.tomcat.embed', 'version': version}
    candidates = [properties(archive.read(name)) for name in archive.namelist()
                  if name.startswith('META-INF/maven/') and name.endswith('/pom.properties')]
    matches = [p for p in candidates if p['artifactId'] == artifact and p['version'] == version]
    if len(matches) != 1:
        raise ValueError('FINERACT_DEPENDENCY_COORDINATES_AMBIGUOUS:' + artifact)
    return matches[0]


def replacements(app, policy):
    git = properties((app / 'resources/git.properties').read_bytes())
    if git['git.commit.id'] != policy['declaredSourceCommit'] or git['git.build.version'] != policy['declaredVersion']:
        raise ValueError('FINERACT_SOURCE_METADATA_DRIFT')
    rows = []
    matched = set()
    for jar in sorted((app / 'libs').glob('*.jar')):
        for index, rule in enumerate(policy['replacements']):
            if not jar.name.startswith(rule['prefix']) or not jar.name.endswith('-' + rule['from'] + '.jar'):
                continue
            artifact = jar.name.removesuffix('-' + rule['from'] + '.jar')
            with zipfile.ZipFile(jar) as archive:
                identity = coordinates(archive, artifact, rule['from'])
            if artifact.startswith('fineract-'):
                raise ValueError('FINERACT_DEPENDENCY_COORDINATES_AMBIGUOUS:' + jar.name)
            group = identity['groupId']
            target = artifact + '-' + rule['to'] + '.jar'
            url = 'https://repo.maven.apache.org/maven2/' + group.replace('.', '/') + '/' + artifact + '/' + rule['to'] + '/' + target
            rows.append({'original': jar.name, 'originalSha256': sha(jar), 'target': target,
                         'group': group, 'artifact': artifact, 'version': rule['to'], 'url': url})
            matched.add(index)
    if matched != set(range(len(policy['replacements']))):
        raise ValueError('FINERACT_PATCH_RULE_NOT_CONSUMED')
    return rows


def preserved_files(app, changed):
    return {p.relative_to(app).as_posix(): sha(p) for p in sorted(app.rglob('*'))
            if p.is_file() and p.name not in changed and p.name != 'jib-classpath-file'}


def feature_references(app):
    needles = ('org/apache/commons/configuration/', 'SseEmitter', 'FragmentsRendering', 'XsltView')
    rows = []
    for jar in sorted((app / 'libs').glob('*.jar')):
        if jar.name.startswith(('commons-configuration-', 'spring-webmvc-')):
            continue  # Feature implementation itself is not a consumer.
        with zipfile.ZipFile(jar) as archive:
            for name in archive.namelist():
                if name.endswith('.class'):
                    data = archive.read(name)
                    hits = [needle for needle in needles if needle.encode() in data]
                    if hits:
                        rows.append({'archive': jar.name, 'class': name, 'references': hits})
    for path in sorted((app / 'classes').rglob('*.class')):
        data = path.read_bytes()
        hits = [needle for needle in needles if needle.encode() in data]
        if hits:
            rows.append({'archive': 'classes', 'class': path.relative_to(app).as_posix(), 'references': hits})
    return rows


def publisher_checksums(directory, policy):
    checksums = {}
    for item in policy['checksumArchives']:
        path = directory / item['url'].rsplit('/', 1)[1]
        expected = re.search(r'\b[0-9a-fA-F]{128}\b', (directory / (path.name + '.sha512')).read_text()).group().lower()
        if hashlib.sha512(path.read_bytes()).hexdigest() != expected:
            raise ValueError('FINERACT_PUBLISHER_ARCHIVE_CHECKSUM_MISMATCH:' + path.name)
        if path.suffix == '.zip':
            with zipfile.ZipFile(path) as archive:
                members = {name: archive.read(name) for name in archive.namelist()
                           if Path(name).name in item['jars']}
        else:
            with tarfile.open(path) as archive:
                members = {member.name: archive.extractfile(member).read() for member in archive.getmembers()
                           if member.isfile() and Path(member.name).name in item['jars']}
        for jar in item['jars']:
            matches = [(name, data) for name, data in members.items() if Path(name).name == jar]
            if len(matches) != 1:
                raise ValueError('FINERACT_PUBLISHER_JAR_AMBIGUOUS:' + jar)
            name, data = matches[0]
            checksums[jar] = {'sha512': hashlib.sha512(data).hexdigest(), 'source': 'PUBLISHER_ARCHIVE',
                              'archiveUrl': item['url'], 'archiveSha512': expected, 'member': name}
    return checksums


def materialize(app, downloads, output, policy, archives):
    rows = replacements(app, policy)
    published = publisher_checksums(archives, policy)
    classpath = (app / 'jib-classpath-file').read_text().strip()
    libs = output / 'libs'
    libs.mkdir(parents=True, exist_ok=False)
    for row in rows:
        target = downloads / row['target']
        proof = published[row['target']] if row['target'] in published else {
            'sha512': (downloads / (row['target'] + '.sha512')).read_text().split()[0].lower(),
            'source': 'MAVEN_JAR_SHA512', 'url': row['url'] + '.sha512'}
        expected = proof['sha512']
        if hashlib.sha512(target.read_bytes()).hexdigest() != expected:
            raise ValueError('FINERACT_MAVEN_CHECKSUM_MISMATCH:' + row['target'])
        with zipfile.ZipFile(target) as archive:
            actual = coordinates(archive, row['artifact'], row['version'])
        if (actual['groupId'], actual['artifactId'], actual['version']) != (row['group'], row['artifact'], row['version']):
            raise ValueError('FINERACT_PATCH_ARTIFACT_IDENTITY_MISMATCH')
        old_entry = '/app/libs/' + row['original']
        entries = classpath.split(':')
        if entries.count(old_entry) != 1:
            raise ValueError('FINERACT_CLASSPATH_ENTRY_MISMATCH:' + row['original'])
        classpath = ':'.join('/app/libs/' + row['target'] if entry == old_entry else entry for entry in entries)
        shutil.copyfile(target, libs / row['target'])
        row['targetSha256'] = sha(target)
        row['integrityProof'] = proof
    changed = {row['original'] for row in rows}
    manifest = {'scope': policy['scope'], 'originalImage': policy['originalImage'],
                'declaredSourceCommit': policy['declaredSourceCommit'], 'declaredVersion': policy['declaredVersion'],
                'replacements': rows, 'preserved': preserved_files(app, changed), 'osPackages': policy['osPackages'],
                'limits': policy['limits'], 'candidateReady': False, 'releaseDecision': 'NO_GO'}
    (output / 'jib-classpath-file').write_text(classpath + '\n', encoding='utf-8', newline='\n')
    (output / 'remove-files.txt').write_text(''.join(row['original'] + '\n' for row in rows), encoding='utf-8', newline='\n')
    (output / 'dependency-patch-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    shutil.copyfile(ROOT / 'scripts/deploy/fineract-dependency-patch.Dockerfile', output / 'Dockerfile')
    return {'replacedJars': len(rows), 'preservedFiles': len(manifest['preserved']), 'candidateReady': False}


def verify(app, manifest):
    expected_files = set(manifest['preserved']) | {'jib-classpath-file', 'rf065-dependency-patch-manifest.json'}
    expected_files |= {'libs/' + row['target'] for row in manifest['replacements']}
    actual_files = {p.relative_to(app).as_posix() for p in app.rglob('*') if p.is_file()}
    if actual_files != expected_files:
        raise ValueError('FINERACT_APP_FILE_SET_CHANGED')
    for name, expected in manifest['preserved'].items():
        if sha(app / name) != expected:
            raise ValueError('FINERACT_BUSINESS_PAYLOAD_CHANGED:' + name)
    entries = (app / 'jib-classpath-file').read_text().strip().split(':')
    for row in manifest['replacements']:
        if (app / 'libs' / row['original']).exists() or '/app/libs/' + row['original'] in entries:
            raise ValueError('FINERACT_OLD_DEPENDENCY_RETAINED:' + row['original'])
        if sha(app / 'libs' / row['target']) != row['targetSha256'] or entries.count('/app/libs/' + row['target']) != 1:
            raise ValueError('FINERACT_PATCH_PAYLOAD_DRIFT:' + row['target'])
    return {'status': 'PRESERVED', 'preservedFiles': len(manifest['preserved']),
            'replacedJars': len(manifest['replacements']), 'candidateReady': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['plan', 'materialize', 'verify'])
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--downloads', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--publisher-archives', type=Path)
    args = parser.parse_args()
    policy = json.loads(POLICY.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    if args.mode == 'plan':
        result = {'policy': policy, 'downloads': replacements(args.app, policy),
                  'featureReferences': feature_references(args.app)}
    elif args.mode == 'materialize':
        result = materialize(args.app, args.downloads, args.output, policy, args.publisher_archives)
    else:
        result = verify(args.app, json.loads(args.manifest.read_text()))
    (args.output / (args.mode + '-result.json')).write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({key: value for key, value in result.items() if key not in ('policy', 'downloads', 'featureReferences')}))


if __name__ == '__main__':
    main()
