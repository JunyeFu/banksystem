"""Prepare the two authorized foundation contexts, without touching live services."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[2]
MQ_SHA512 = '0dda456dfc6b0701f61f66076011c6197863697a952c3b3128b0d3809f746b49e1a04c44e14d7ae89055ed4cec35a84fd24561d496452625540bab634f26b182'
MQ_EXCLUDED_OPTIONAL_FILES = {
    'lib/optional/activemq-shiro-6.3.3.jar',
    'lib/optional/shiro-core-2.2.1.jar',
    'lib/optional/shiro-spring-2.2.1.jar',
}
NOBLE_PACKAGES = {
    'libfreetype6_2.13.2+dfsg-1ubuntu0.2_amd64.deb': {
        'size': 402610, 'sha256': '8c6d3bac5a6197fa2f48b2d56f04f3ffecaa7082eeab91b0939f97a40adc88a6',
        'path': 'f/freetype/', 'advisory': 'CVE-2026-95512'},
    'libpng16-16t64_1.6.43-5ubuntu0.7_amd64.deb': {
        'size': 188998, 'sha256': '863d6abb089b2820ceba98e6b18f06eaacc55f9b05827001e7b4021a9a7b246c',
        'path': 'libp/libpng1.6/', 'advisory': 'CVE-2026-46675'},
    'apt_2.8.4ubuntu0.1_amd64.deb': {
        'size': 1396574, 'sha256': 'ad2ea7f107f250ba88b0bfdba31812a341e3247589647aa2b03b9dc4e8abf8ed',
        'path': 'a/apt/', 'advisory': 'USN-8996-1'},
    'libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb': {
        'size': 985236, 'sha256': 'a50f3e68a793f90b05f44a4b5f2f59f3ec7687e39b5d8bbd1da44c84671fa3d6',
        'path': 'a/apt/', 'advisory': 'USN-8996-1'},
    'ca-certificates_20260816ubuntu0.24.04.2_all.deb': {
        'size': 140064, 'sha256': 'f9fbacd417b515450b831032cc39d18059e9874e67525679a43c16071dabf9a0',
        'path': 'c/ca-certificates/', 'advisory': 'USN-9001-1'},
    'curl_8.5.0-2ubuntu10.16_amd64.deb': {
        'size': 226386, 'sha256': '3c5ca6af64370cfb0fac85876d8025563005cbd399fcaf7e34bbde9051058ae0',
        'path': 'c/curl/', 'advisory': 'USN-8932-1'},
    'libcurl4t64_8.5.0-2ubuntu10.16_amd64.deb': {
        'size': 344412, 'sha256': '8196381b41f0078083a2a52b43f7e7ca9b0b79e5325451bf3948e4af7693cd8d',
        'path': 'c/curl/', 'advisory': 'USN-8932-1'},
    'libbrotli1_1.1.0-2ubuntu0.1_amd64.deb': {
        'size': 330968, 'sha256': '70b188a86d81f30d7510aab30e25d638ed5037dded6691af1533952b71ac61de',
        'path': 'b/brotli/', 'advisory': 'USN-8956-1'},
    'liblzma5_5.6.1+really5.4.5-1ubuntu0.4_amd64.deb': {
        'size': 127704, 'sha256': '5bcf5da2339331e21d3f42a831e82c61c54c6b2f29804010e8d59abd0ae52167',
        'path': 'x/xz-utils/', 'advisory': 'USN-8945-1'},
    'libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb': {
        'size': 228546, 'sha256': 'f41da7cb7e979d6b037ea92650c72ec8ec532ec3c93aa8d5b997207de56695ea',
        'path': 'p/pcre2/', 'advisory': 'USN-8974-1'},
    'zlib1g_1.3.dfsg-3.1ubuntu2.3_amd64.deb': {
        'size': 63158, 'sha256': '376249c8de139568221dbb242318cc8cb8f02299e3a62b7432948e1754fbddf9',
        'path': 'z/zlib/', 'advisory': 'USN-8954-1'},
}


def verify_noble_packages(downloads):
    rows = []
    for filename, expected in NOBLE_PACKAGES.items():
        package = downloads / filename
        if package.stat().st_size != expected['size'] or hashlib.sha256(package.read_bytes()).hexdigest() != expected['sha256']:
            raise ValueError('MQ_NOBLE_PUBLISHER_PACKAGE_MISMATCH:' + filename)
        rows.append({**expected, 'filename': filename,
                     'url': 'https://security.ubuntu.com/ubuntu/pool/main/' + expected['path'] + filename})
    return rows


def prepare(archive, entrypoint, output, noble_downloads):
    if hashlib.sha512(archive.read_bytes()).hexdigest() != MQ_SHA512:
        raise ValueError('ACTIVEMQ_PUBLISHER_ARCHIVE_CHECKSUM_MISMATCH')
    noble_packages = verify_noble_packages(noble_downloads)
    runtime_packages = [row for row in noble_packages if row['filename'] in {
        'apt_2.8.4ubuntu0.1_amd64.deb', 'libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb',
        'libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb',
        'ca-certificates_20260816ubuntu0.24.04.2_all.deb'}]
    output.mkdir(parents=True, exist_ok=False)
    mq = output / 'activemq'
    mq.mkdir()
    (mq / 'packages').mkdir()
    for package in runtime_packages:
        shutil.copyfile(noble_downloads / package['filename'], mq / 'packages' / package['filename'])
    with tarfile.open(archive) as bundle:
        excluded_names = {'apache-activemq-6.3.3/' + path for path in MQ_EXCLUDED_OPTIONAL_FILES}
        excluded = [{'path': member.name.removeprefix('apache-activemq-6.3.3/'),
                     'sha256': hashlib.sha256(bundle.extractfile(member).read()).hexdigest(),
                     'reason': 'Unused optional Shiro authentication is not part of the product simple-authentication and JAAS profile'}
                    for member in bundle.getmembers() if member.name in excluded_names]
        bundle.extractall(mq, members=[member for member in bundle.getmembers() if member.name not in excluded_names], filter='data')
    home = mq / 'apache-activemq-6.3.3'
    if not (home / 'lib/activemq-broker-6.3.3.jar').is_file():
        raise ValueError('ACTIVEMQ_BROKER_VERSION_NOT_EXPECTED')
    shutil.copyfile(entrypoint, mq / 'entrypoint.sh')
    shutil.copyfile(ROOT / 'scripts/deploy/activemq-foundation.Dockerfile', mq / 'Dockerfile')
    pg = output / 'postgres'
    pg.mkdir()
    shutil.copyfile(ROOT / 'scripts/deploy/postgres-foundation.Dockerfile', pg / 'Dockerfile')
    files = {p.relative_to(mq).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(mq.rglob('*')) if p.is_file()}
    result = {'scope': 'RF065_S3_8_NEW_FOUNDATION_IMAGES_ONLY', 'archiveSha512': MQ_SHA512,
              'archiveSource': 'https://downloads.apache.org/activemq/6.3.3/apache-activemq-6.3.3-bin.tar.gz',
              'activemqFiles': files, 'candidateReady': False, 'releaseDecision': 'NO_GO',
              'dependencyPatches': [],
              'excludedRuntimePackages': ['gnupg', 'gpg', 'keyboxd', 'libsqlite3-0'],
              'excludedOptionalArtifacts': excluded,
              'nobleSecurityPackages': noble_packages,
              'runtimeNobleSecurityPackages': runtime_packages,
              'javaRuntime': {
                  'baseImage': (mq / 'Dockerfile').read_text(encoding='utf-8').splitlines()[0].removeprefix('FROM '),
                  'version': '21.0.13+9',
                  'trustStore': 'VENDOR_RELEASE_NO_LOCAL_CERTIFICATE_IMPORT_OR_DELETE',
                  'revokedRootSha256': '86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b',
                  'source': 'https://adoptium.net/en-GB/news/2026/10/eclipse-temurin-17021-21013-2505-2701-available'},
              'limits': 'ActiveMQ 6.3.3 is the authorized supported candidate with required upstream dependencies and Jetty configuration; unused optional Shiro and the four reviewed GPG/SQLite runtime inputs are not shipped. gpgv and the other retained OS tools remain. PostgreSQL stays major18, no old data mounted. Original services are not replaced; other feature upgrades are not included.'}
    (output / 'foundation-patch-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({'activemqVersion': '6.3.3', 'activemqFiles': len(files), 'postgresMajor': 18, 'releaseDecision': 'NO_GO'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--activemq-archive', type=Path, required=True)
    parser.add_argument('--activemq-entrypoint', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--noble-downloads', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.activemq_archive, args.activemq_entrypoint, args.output, args.noble_downloads)
