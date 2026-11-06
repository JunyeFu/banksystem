"""Build/verify unfrozen source materials; never declare a product release GO."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


SOURCE = module('artifact_source', 'prepare-ci-scan.py')
REVIEW = module('artifact_dependencies', 'verify-ci-dependency-review.py')
FOUNDATIONS = module('artifact_foundations', 'inspect-ci-foundations.py')
NGINX = module('artifact_nginx', 'verify-ci-nginx-review.py')
IMAGE = FOUNDATIONS.IMAGE
REPORTS = ('dependency-coverage.json', 'dependencies.json', 'dependency-result.json',
           'vulnerability-inventory.json', 'source.cdx.json', 'dependency-review.json',
           'license-review.json', 'source.reviewed.cdx.json', 'zip-patch-regression.txt')
LICENSE_REPORT = 'reports/source-license-review.json'
PENDING = ['FULL_RUNTIME_IMAGE_EVIDENCE', 'REDISTRIBUTION_OBLIGATIONS',
           'RELEASE_IDENTITY_FREEZE', 'RF057_LIVE_28', 'REMOTE_CI']
# Historical external manuals are scanned locally, not redistributed as product source.
REFERENCE_LIBRARIES = ('docs/reference/hiagent-2.5.1-help/',)
FULL_SCOPE = 'FULL_DEFAULT_RUNTIME_CANDIDATE_MATERIALS'
DELIVERY_SCOPE = 'SOURCE_AND_FACT_SUMMARY_DELIVERY'
FULL_PENDING = ['RUNTIME_IMAGE_RISK_REVIEW', *PENDING[1:]]
IMAGE_FILES = {'bom': 'bom.cdx.json', 'nativeReport': 'native.json', 'review': 'review.json',
               'licenseReport': 'license-review.json', 'patchManifest': 'patch-manifest.json'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def owned(path):
    path = path.resolve()
    if 'banksystem-rf065' not in path.parts:
        raise ValueError('ARTIFACT_OWNED_PATH_REQUIRED')
    return path


def controlled_files(repository):
    tracked = SOURCE.git_paths(repository, '--cached')
    untracked = SOURCE.git_paths(repository, '--others', '--exclude-standard')
    return sorted(name for name in set(tracked + untracked)
                  if SOURCE.source_path(name) and (repository / name).is_file())


def git_info(repository):
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repository,
                            check=True, capture_output=True, text=True).stdout.strip()
    status = subprocess.run(['git', 'status', '--porcelain', '-z'], cwd=repository,
                            check=True, capture_output=True).stdout
    return {'sourceCommit': commit, 'workingTreeDirty': bool(status)}


def archive_files(files):
    return [name for name in files if not name.startswith(REFERENCE_LIBRARIES)]


def validate_source(repository, directory):
    manifest = load(directory / 'source-manifest.json')
    files = controlled_files(repository)
    if manifest['files'] != files or manifest['scope'] != 'CURRENT_CONTROLLED_SOURCE':
        raise ValueError('ARTIFACT_SOURCE_COVERAGE_MISMATCH')
    snapshot = directory / 'scan-source'
    actual = SOURCE.file_hashes(snapshot, files)
    if (actual != manifest['fileHashes'] or actual != SOURCE.file_hashes(repository, files)
            or SOURCE.source_digest(actual) != manifest['sourceDigest']):
        raise ValueError('ARTIFACT_SOURCE_DRIFT')
    scan = load(directory / 'secrets.json')
    if (scan['status'] != 'PASSED' or scan['scannerExitCode'] != 0 or scan['count'] != 0
            or scan['findings'] or scan['sourceDigest'] != manifest['sourceDigest']):
        raise ValueError('ARTIFACT_SOURCE_SCAN_NOT_PASSED')
    return manifest


def validate_dependencies(source, directory, *, relocated=False):
    coverage = load(directory / 'dependency-coverage.json')
    expected = [f'{package}/package-lock.json' for package in REVIEW.DEPENDENCIES.PACKAGES]
    if coverage['locks'] != expected or coverage['scope'] != 'DECLARED_PRODUCT_NPM_DEPENDENCIES':
        raise ValueError('ARTIFACT_DEPENDENCY_COVERAGE_MISMATCH')
    for package in REVIEW.DEPENDENCIES.PACKAGES:
        for filename in ('package.json', 'package-lock.json'):
            relative = f'{package}/{filename}'
            if not relocated and REVIEW.digest(source / relative) != REVIEW.digest(directory / 'product-dependencies' / relative):
                raise ValueError('ARTIFACT_SCANNED_DEPENDENCY_DRIFT:' + relative)
    result = load(directory / 'dependency-result.json')
    recorded = load(directory / 'vulnerability-inventory.json')
    native = load(directory / 'dependencies.json')
    if relocated:
        for row in native['results']:
            location = row['source']['path'].replace('\\', '/').rsplit('/product-dependencies/', 1)
            if len(location) != 2 or location[1] not in expected:
                raise ValueError('ARTIFACT_DEPENDENCY_RELOCATED_LOCK_PATH_MISMATCH')
            row['source']['path'] = str(source / location[1])
    actual = REVIEW.SCAN.inventory(native, coverage, directory, result['scannerExitCode'],
                                   source_root=source if relocated else None)
    actual['queriedAt'] = recorded['queriedAt']
    if actual != recorded or actual['status'] == 'ERROR':
        raise ValueError('ARTIFACT_DEPENDENCY_NATIVE_MISMATCH')
    policy = load(REVIEW.POLICY_PATH)
    status = REVIEW.review_findings(actual, source, policy)
    bom = load(directory / 'source.cdx.json')
    if bom['bomFormat'] != 'CycloneDX' or not bom['components']:
        raise ValueError('ARTIFACT_SBOM_MISSING_COMPONENTS')
    reviewed_bom, licenses = REVIEW.review_licenses(bom, source, policy)
    if licenses['unresolved'] or licenses != load(directory / 'license-review.json'):
        raise ValueError('ARTIFACT_DECLARED_LICENSE_REVIEW_FAILED')
    if reviewed_bom != load(directory / 'source.reviewed.cdx.json'):
        raise ValueError('ARTIFACT_REVIEWED_BOM_DRIFT')
    reviewed = load(directory / 'dependency-review.json')
    test = source / 'platform/hengzhun-regression-system/scripts/verification/runtime-dependency-security.test.cjs'
    regression = directory / 'zip-patch-regression.txt'
    text = regression.read_text(encoding='utf-8')
    if (reviewed['status'] != status or reviewed['policySha256'] != REVIEW.digest(REVIEW.POLICY_PATH)
            or reviewed['nativeScannerExitCode'] != result['scannerExitCode']
            or reviewed['patchFiles'] != policy['zipPatch']['files']
            or reviewed['patchRegressionExitCode'] != 0
            or reviewed['patchRegressionSha256'] != REVIEW.digest(regression)
            or reviewed['patchTestSourceSha256'] != REVIEW.digest(test)
            or '# pass 4\n' not in text or '# fail 0\n' not in text):
        raise ValueError('ARTIFACT_PATCH_REGRESSION_BINDING_FAILED')
    return {'status': status, 'locks': expected, 'nativeScannerExitCode': result['scannerExitCode'],
            'queriedAt': actual['queriedAt'], 'licenseScope': licenses['scope']}


def tool_evidence(path):
    declared, installed = load(ROOT / 'scripts/test/ci-security-tools.json'), load(path)
    if set(installed) != set(declared):
        raise ValueError('ARTIFACT_TOOL_COVERAGE_MISMATCH')
    tools = {}
    for name, spec in declared.items():
        row = installed[name]
        platform = row['platform']
        asset = spec[platform]
        binary = owned(Path(row['path']))
        if (row['version'] != spec['version'] or row['sha256'] != asset['sha256']
                or binary.name != asset['executable'] or binary.is_symlink()):
            raise ValueError('ARTIFACT_TOOL_BINDING_MISMATCH:' + name)
        tools[name] = {'version': row['version'], 'platform': platform,
                       'releaseAssetSha256': row['sha256'], 'executableSha256': sha(binary)}
    return tools


def source_license_materials(source, files):
    policy = load(REVIEW.POLICY_PATH)
    delivery = policy['sourceDelivery']
    for name, expected in delivery['files'].items():
        if name not in files or REVIEW.digest(source / name) != expected:
            raise ValueError('ARTIFACT_LICENSE_MATERIAL_MISSING_OR_CHANGED:' + name)
    fonts = delivery['fonts']
    actual_fonts = {name for name in files if Path(name).suffix.lower() in ('.ttf', '.otf', '.woff', '.woff2')}
    if actual_fonts != {font['path'] for font in fonts}:
        raise ValueError('ARTIFACT_FONT_COVERAGE_MISMATCH')
    for font in fonts:
        if sha(source / font['path']) != font['sha256']:
            raise ValueError('ARTIFACT_FONT_BINARY_DRIFT:' + font['path'])
    wrapper = delivery['mavenWrapper']
    if wrapper['path'] not in files or sha(source / wrapper['path']) != wrapper['sha256']:
        raise ValueError('ARTIFACT_BOOTSTRAP_BINARY_DRIFT')
    with zipfile.ZipFile(source / wrapper['path']) as jar:
        properties = jar.read('META-INF/maven/org.apache.maven.wrapper/maven-wrapper/pom.properties').decode('utf-8')
        if f"version={wrapper['version']}\n" not in properties:
            raise ValueError('ARTIFACT_BOOTSTRAP_VERSION_DRIFT')
        for embedded, original in wrapper['originals'].items():
            if jar.read(embedded).replace(b'\r\n', b'\n') != (source / original).read_bytes().replace(b'\r\n', b'\n'):
                raise ValueError('ARTIFACT_BOOTSTRAP_LICENSE_ORIGINAL_DRIFT')
    binaries = [name for name in files if Path(name).suffix.lower() in
                ('.jar', '.war', '.exe', '.dll', '.so', '.pyd', '.apk', '.deb', '.tar', '.zip', '.7z')]
    if binaries != [wrapper['path']]:
        raise ValueError('ARTIFACT_UNREVIEWED_SOFTWARE_BINARY')
    if any(Path(name).suffix.lower() == '.env' for name in files):
        raise ValueError('ARTIFACT_ENV_CANNOT_BE_DISTRIBUTED')
    historical = 'platform/hengzhun-regression-system/THIRD-PARTY-NOTICES.md'
    if historical in files and not (source / historical).read_text(encoding='utf-8').startswith(
            '# Historical I10 portable-package license inventory\n'):
        raise ValueError('ARTIFACT_HISTORICAL_LICENSE_INVENTORY_MISLABELED')
    patch = policy['zipPatch']
    return {'status': 'SOURCE_AND_BOOTSTRAP_MATERIALS_REVIEWED', 'scope': delivery['scope'],
            'noticeFiles': delivery['files'], 'mavenWrapper': wrapper,
            'embeddedOriginalsPreserved': True, 'softwareBinariesInArchive': binaries,
            'vendoredSource': {'name': patch['name'], 'version': patch['version'], 'license': 'BSD-2-Clause',
                               'original': 'platform/hengzhun-regression-system/vendor/extract-zip/LICENSE'},
            'fontMaterials': [{**font, 'licenseSha256': delivery['files'][font['licenseOriginal']]} for font in fonts],
            'runtimeImageBinaries': 'NOT_DISTRIBUTED_IN_THIS_BUNDLE',
            'fullDistributionGateCompleted': False,
            'pending': ['UPSTREAM_RUNTIME_REPORT_DATA_RIGHTS', 'RUNTIME_BINARY_DISTRIBUTION_IF_INCLUDED'],
            'limits': delivery['limits']}


def inspect_image(reference):
    # Public immutable image metadata only, not container env, mounts or runtime state.
    command = ['docker', 'image', 'inspect', '--format',
               '{{json .Id}}|{{json .RootFS.Layers}}|{{json .Architecture}}|{{json .Os}}', reference]
    values = subprocess.run(command, check=True, capture_output=True, text=True).stdout.strip().split('|')
    image_id, layers, architecture, system = map(json.loads, values)
    return {'Id': image_id, 'RootFS': {'Layers': layers}, 'Architecture': architecture, 'Os': system}


def expected_image_id(key):
    if key in ('customer-portal', 'operations-console', 'gateway'):
        return load(ROOT / 'scripts/test/ci-nginx-dispositions.json')['reviewedImages'][key]
    if key in ('bank-channel-service', 'fineract-server'):
        file = 'ci-image-dispositions.json' if key == 'bank-channel-service' else 'ci-fineract-dispositions.json'
        return load(ROOT / 'scripts/test' / file)['reviewedImageId']
    name = {'bank-channel-postgres': 'postgres', 'web-app': 'webapp', 'otel-collector': 'otel'}.get(key, key)
    policy = load(FOUNDATIONS.POLICY)
    if name in policy['candidateSubjects']:
        return policy['candidateSubjects'][name]['image']
    # An explicitly registered unchanged baseline remains blocking, not a silent runtime fallback.
    return policy['subjects'][name].rsplit('@', 1)[1]


def image_security(source, key, selection, paths, inspection, findings, controlled=None):
    if inspection['Id'] != expected_image_id(key):
        raise ValueError('ARTIFACT_IMAGE_REVIEW_ID_DRIFT:' + key)
    policy_file = {'bank-channel-service': 'ci-image-dispositions.json',
                   'customer-portal': 'ci-nginx-dispositions.json',
                   'operations-console': 'ci-nginx-dispositions.json',
                   'gateway': 'ci-nginx-dispositions.json',
                   'fineract-server': 'ci-fineract-dispositions.json'}.get(key)
    if policy_file:
        if 'review' not in paths:
            return {'status': 'BLOCKED', 'reason': 'EXACT_CURRENT_REVIEW_MISSING'}
        policy_path = ROOT / 'scripts/test' / policy_file
        policy = load(policy_path)
        recorded = load(paths['review'])
        if key in ('customer-portal', 'operations-console', 'gateway'):
            expected = NGINX.review(findings, policy, NGINX.source_digest(source, controlled))
            bom_key = 'bomSha256'
        else:
            if key == 'bank-channel-service':
                digest = IMAGE.source_digest(source)
                bom_key = 'originalBomSha256'
            else:
                digest = sha(paths['patchManifest'])
                bom_key = 'bomSha256'
            expected = IMAGE.review(findings, policy, digest)
        if (any(recorded.get(name) != value for name, value in expected.items())
                or recorded['imageId'] != inspection['Id']
                or recorded['nativeScannerExitCode'] != selection['nativeExit']
                or recorded['nativeReportSha256'] != sha(paths['nativeReport'])
                or recorded[bom_key] != sha(paths['bom'])
                or recorded['policySha256'] != REVIEW.digest(policy_path)):
            raise ValueError('ARTIFACT_IMAGE_REVIEW_DRIFT:' + key)
        return {'status': 'PASSED' if expected['status'] == 'REVIEWED' else 'BLOCKED',
                'reviewStatus': expected['status'], 'reviewedAdvisories': expected['reviewedAdvisories'],
                'blockingAdvisories': expected['blockingAdvisories'],
                'missingExpectedAdvisories': expected['missingExpectedAdvisories'],
                'policySha256': recorded['policySha256']}
    if key in ('bank-channel-postgres', 'activemq') and 'review' in paths and 'patchManifest' not in paths:
        name = 'postgres' if key == 'bank-channel-postgres' else 'activemq'
        error = 'ARTIFACT_' + name.upper() + '_REVIEW_DRIFT'
        policy = load(FOUNDATIONS.POLICY)
        receipt = load(paths['review'])
        records = [row for row in receipt.get('subjects', []) if row['name'] == name]
        if (receipt.get('scope') != policy['scope'] or len(records) != 1
                or receipt.get('policySha256') != REVIEW.digest(FOUNDATIONS.POLICY)):
            raise ValueError(error)
        features = (FOUNDATIONS.postgres_features if name == 'postgres' else FOUNDATIONS.activemq_features)(inspection['Id'])
        function = FOUNDATIONS.postgres_review if name == 'postgres' else FOUNDATIONS.activemq_review
        expected = function(findings, inspection, features, policy[name + 'Review'])
        recorded = records[0]
        if (recorded.get('imageId') != inspection['Id'] or recorded.get('nativeScannerExitCode') != selection['nativeExit']
                or recorded.get('nativeReportSha256') != sha(paths['nativeReport'])
                or recorded.get('bomSha256') != sha(paths['bom']) or recorded.get('featureFacts') != features
                or recorded.get('riskReview') != expected):
            raise ValueError(error)
        result = {'status': 'PASSED' if expected['status'] == 'REVIEWED' else 'BLOCKED',
                  'reviewStatus': expected['status'], 'reviewedAdvisories': expected['reviewedAdvisories'],
                  'blockingAdvisories': expected['blockingAdvisories'],
                  'missingExpectedAdvisories': expected['missingExpectedAdvisories'],
                  'policySha256': receipt['policySha256']}
    else:
        if 'review' in paths or 'patchManifest' in paths:
            raise ValueError('ARTIFACT_UNSUPPORTED_FOUNDATION_REVIEW:' + key)
        result = {'status': 'BLOCKED' if findings else 'PASSED',
                  'blockingAdvisories': len({row['id'] for row in findings}),
                  'reason': 'UNREVIEWED_NATIVE_FINDINGS' if findings else 'NATIVE_SCAN_CLEAN'}
    if key in ('bank-channel-postgres', 'web-app'):
        policy = load(FOUNDATIONS.POLICY)
        bom = load(paths['bom'])
        if key == 'bank-channel-postgres':
            requirement, function = policy['postgresVendorRequirement'], FOUNDATIONS.postgres_vendor_gate
        else:
            requirement, function = policy['webappNginxRequirement'], FOUNDATIONS.webapp_nginx_gate
        versions = [item['version'] for item in bom['components'] if item['name'] == requirement['package']]
        result['vendorGate'] = function(versions, requirement)
        if result['vendorGate']['status'] != 'PASSED':
            result['status'] = 'BLOCKED'
    return result


def validate_images(source, plan, controlled=None):
    scope = FOUNDATIONS.runtime_scope(source)
    groups = {}
    for row in scope['services']:
        groups.setdefault(row['image'], []).append(row['service'])
    subjects = plan['subjects']
    references = [row['declaredReference'] for row in subjects]
    if len(references) != len(set(references)) or set(references) != set(groups):
        raise ValueError('ARTIFACT_DEFAULT_IMAGE_COVERAGE_MISMATCH')
    records, copies = [], []
    for selection in sorted(subjects, key=lambda row: row['declaredReference']):
        services = sorted(groups[selection['declaredReference']])
        key = services[0]
        if not re.fullmatch(r'[a-z0-9-]+', key) or not re.fullmatch(r'sha256:[a-f0-9]{64}', selection['imageId']):
            raise ValueError('ARTIFACT_EXPLICIT_IMAGE_ID_REQUIRED')
        paths = {name: owned(Path(selection[name])) for name in IMAGE_FILES if selection.get(name) is not None}
        if not {'bom', 'nativeReport'} <= paths.keys():
            raise ValueError('ARTIFACT_IMAGE_REPORTS_REQUIRED:' + key)
        inspection = inspect_image(selection['imageId'])
        bom, native = load(paths['bom']), load(paths['nativeReport'])
        layers = [row['diff_id'] for row in native['image_metadata']['layer_metadata'] if not row['is_empty']]
        if (inspection['Id'] != selection['imageId'] or bom['bomFormat'] != 'CycloneDX' or not bom['components']
                or bom['metadata']['component']['version'] != inspection['Id'].removeprefix('sha256:')
                or layers != inspection['RootFS']['Layers']):
            raise ValueError('ARTIFACT_IMAGE_NATIVE_BOM_BINDING_MISMATCH:' + key)
        findings = IMAGE.findings(native, selection['nativeExit'])
        security = image_security(source, key, selection, paths, inspection, findings, controlled)
        evidence = {name: f'images/{key}/{IMAGE_FILES[name]}' for name in paths}
        copies.extend((path, evidence[name]) for name, path in paths.items())
        records.append({'key': key, 'services': services, 'declaredReference': selection['declaredReference'],
                        'imageId': inspection['Id'], 'architecture': inspection['Architecture'], 'os': inspection['Os'],
                        'nativeScannerExitCode': selection['nativeExit'],
                        'nativeScannerStatus': 'FAILED' if findings else 'PASSED',
                        'uniqueAdvisories': len({row['id'] for row in findings}), 'security': security,
                        'nativeReportLastModifiedAt': datetime.fromtimestamp(paths['nativeReport'].stat().st_mtime, timezone.utc).isoformat(),
                        'licenseDistributionStatus': 'NOT_DISTRIBUTED_IN_SOURCE_PROFILE', 'evidence': evidence})
    return {'scope': scope, 'records': records, 'copies': copies}


def write_manifest(output, result):
    (output / 'candidate-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    checksums = '\n'.join(f"{row['sha256']}  {row['path']}" for row in result['artifacts'])
    checksums += '\n' + sha(output / 'candidate-manifest.json') + '  candidate-manifest.json\n'
    (output / 'checksums.sha256').write_text(checksums, encoding='utf-8')


def image_engineering_gate(records):
    # Image risk and the actual exported material inventory are distinct gates.
    return 'PASSED' if all(row['security']['status'] == 'PASSED' for row in records) else 'BLOCKED'


def produce(repository, source_scan, dependencies, tools_path, output):
    source_scan, dependencies, tools_path, output = map(owned, (source_scan, dependencies, tools_path, output))
    if output == repository or repository in output.parents:
        raise ValueError('ARTIFACT_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED')
    manifest = validate_source(repository, source_scan)
    source = source_scan / 'scan-source'
    dependencies_result = validate_dependencies(source, dependencies)
    tools = tool_evidence(tools_path)
    members = archive_files(manifest['files'])
    license_materials = source_license_materials(source, members)
    output.mkdir(parents=True, exist_ok=False)
    archive = output / 'controlled-source.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name in members:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, (source / name).read_bytes())
    files = ['controlled-source.zip']
    for name in REPORTS:
        destination = output / 'reports' / name
        destination.parent.mkdir(exist_ok=True)
        shutil.copyfile(dependencies / name, destination)
        files.append('reports/' + name)
    public_scan = {key: load(source_scan / 'secrets.json')[key]
                   for key in ('status', 'scannerExitCode', 'count', 'sourceDigest')}
    (output / 'reports/secrets.json').write_text(json.dumps(public_scan, indent=2), encoding='utf-8')
    files.append('reports/secrets.json')
    (output / LICENSE_REPORT).write_text(json.dumps(license_materials, indent=2), encoding='utf-8')
    files.append(LICENSE_REPORT)
    artifacts = [{'path': name, 'sha256': sha(output / name), 'bytes': (output / name).stat().st_size} for name in files]
    result = {'schemaVersion': 1, 'scope': 'CONTROLLED_SOURCE_CANDIDATE_ONLY',
              'generatedAt': datetime.now(timezone.utc).isoformat(), **git_info(repository),
              'sourceDigest': manifest['sourceDigest'], 'sourceFiles': manifest['fileHashes'],
              'archiveExclusions': list(REFERENCE_LIBRARIES), 'archivedFileCount': len(members),
              'sourceStatus': 'VERIFIED', 'dependencies': dependencies_result, 'tools': tools,
              'sourceLicenseStatus': license_materials['status'],
              'artifacts': artifacts, 'releaseIdentity': 'UNFROZEN', 'releaseDecision': 'NO_GO',
              'productReady': False, 'pendingGates': PENDING,
              'limits': 'Source material integrity only. No runtime-image, redistribution, LIVE, remote CI or release acceptance.'}
    write_manifest(output, result)
    return result


def produce_candidate(repository, source_scan, dependencies, tools_path, images_path, output):
    validate_source(repository, owned(source_scan))
    images = validate_images(source_scan / 'scan-source', load(owned(images_path)))
    result = produce(repository, source_scan, dependencies, tools_path, output)
    for original, relative in images['copies']:
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, destination)
        result['artifacts'].append({'path': relative, 'sha256': sha(destination), 'bytes': destination.stat().st_size})
    result.update({'scope': FULL_SCOPE, 'runtimeScope': images['scope'], 'images': images['records'],
                   'imageCoverageStatus': 'COMPLETE', 'imageEngineeringGate': image_engineering_gate(images['records']),
                   'distributionMaterialGate': 'NOT_EXPORTED',
                   'pendingGates': FULL_PENDING,
                   'limits': 'All default runtime image evidence is inventoried; unresolved risks and redistribution obligations block. '
                             'No image binaries redistributed, no original runtime changes, no ReleaseIdentity/LIVE/remote-CI acceptance.'})
    write_manifest(output, result)
    return result


def verify(repository, directory):
    directory = owned(directory)
    manifest = load(directory / 'candidate-manifest.json')
    full = manifest['scope'] == FULL_SCOPE
    if (manifest['scope'] not in ('CONTROLLED_SOURCE_CANDIDATE_ONLY', FULL_SCOPE) or manifest['releaseIdentity'] != 'UNFROZEN'
            or manifest['releaseDecision'] != 'NO_GO' or manifest['productReady'] is not False
            or manifest['pendingGates'] != (FULL_PENDING if full else PENDING)
            or (full and manifest['distributionMaterialGate'] != 'NOT_EXPORTED')):
        raise ValueError('ARTIFACT_CANNOT_PROMOTE_SOURCE_TO_RELEASE')
    current = SOURCE.file_hashes(repository, controlled_files(repository))
    if current != manifest['sourceFiles'] or SOURCE.source_digest(current) != manifest['sourceDigest']:
        raise ValueError('ARTIFACT_SOURCE_DRIFT')
    members = archive_files(current)
    if manifest['archiveExclusions'] != list(REFERENCE_LIBRARIES) or manifest['archivedFileCount'] != len(members):
        raise ValueError('ARTIFACT_ARCHIVE_SCOPE_MISMATCH')
    if git_info(repository) != {key: manifest[key] for key in ('sourceCommit', 'workingTreeDirty')}:
        raise ValueError('ARTIFACT_GIT_STATE_DRIFT')
    expected = {row['path']: row['sha256'] for row in manifest['artifacts']}
    required = {'controlled-source.zip', 'reports/secrets.json', LICENSE_REPORT, *(f'reports/{name}' for name in REPORTS)}
    if full:
        for row in manifest['images']:
            if not re.fullmatch(r'[a-z0-9-]+', row['key']):
                raise ValueError('ARTIFACT_IMAGE_EVIDENCE_PATH_MISMATCH')
            for role, name in row['evidence'].items():
                if role not in IMAGE_FILES or name != f"images/{row['key']}/{IMAGE_FILES[role]}":
                    raise ValueError('ARTIFACT_IMAGE_EVIDENCE_PATH_MISMATCH')
                required.add(name)
    if set(expected) != required or len(expected) != len(manifest['artifacts']):
        raise ValueError('ARTIFACT_MEMBER_COVERAGE_MISMATCH')
    expected['candidate-manifest.json'] = sha(directory / 'candidate-manifest.json')
    checksums = (directory / 'checksums.sha256').read_text(encoding='utf-8').splitlines()
    if checksums != [f"{expected[name]}  {name}" for name in expected]:
        raise ValueError('ARTIFACT_CHECKSUM_MANIFEST_MISMATCH')
    for name, digest in expected.items():
        path = directory / name
        if path.is_symlink() or sha(path) != digest:
            raise ValueError('ARTIFACT_BYTES_CHANGED:' + name)
    with zipfile.ZipFile(directory / 'controlled-source.zip') as bundle:
        if sorted(bundle.namelist()) != members:
            raise ValueError('ARTIFACT_ZIP_MEMBER_MISMATCH')
        for name in members:
            digest = current[name]
            if bundle.getinfo(name).file_size != (repository / name).stat().st_size or hashlib.sha256(bundle.read(name)).hexdigest() != digest:
                raise ValueError('ARTIFACT_ZIP_SOURCE_MISMATCH:' + name)
    licenses = source_license_materials(repository, members)
    if licenses != load(directory / LICENSE_REPORT) or manifest['sourceLicenseStatus'] != licenses['status']:
        raise ValueError('ARTIFACT_SOURCE_LICENSE_REVIEW_DRIFT')
    if manifest['dependencies'] != validate_dependencies(repository, directory / 'reports', relocated=True):
        raise ValueError('ARTIFACT_DEPENDENCY_REVIEW_DRIFT')
    if full:
        plan = {'subjects': [{'declaredReference': row['declaredReference'], 'imageId': row['imageId'],
                              'nativeExit': row['nativeScannerExitCode'],
                              **{role: str(directory / name) for role, name in row['evidence'].items()}}
                             for row in manifest['images']]}
        # ZIP is never extracted; image source cones are read from the already-verified repository.
        images = validate_images(repository, plan, manifest['sourceFiles'])
        comparable = lambda rows: [{key: value for key, value in row.items() if key != 'nativeReportLastModifiedAt'} for row in rows]
        if (manifest['runtimeScope'] != images['scope'] or comparable(manifest['images']) != comparable(images['records'])
                or manifest['imageCoverageStatus'] != 'COMPLETE'
                or manifest['imageEngineeringGate'] != image_engineering_gate(images['records'])):
            raise ValueError('ARTIFACT_CURRENT_IMAGE_EVIDENCE_DRIFT')
    return manifest


def delivery_jsons(candidate, manifest):
    bom = load(candidate / 'reports/source.reviewed.cdx.json')
    scan = load(candidate / 'reports/secrets.json')
    components = []
    for component in bom['components']:
        if component['type'] not in ('library', 'application', 'framework'):
            continue
        projected = {key: component[key] for key in ('type', 'group', 'name', 'version', 'purl') if key in component}
        if 'licenses' in component:
            projected['licenses'] = [
                {'expression': row['expression']} if 'expression' in row else
                {'license': {key: row['license'][key] for key in ('id', 'name', 'url') if key in row['license']}}
                for row in component['licenses']]
        components.append(projected)
    public_bom = {'bomFormat': 'CycloneDX', 'specVersion': bom['specVersion'], 'version': 1, 'components': components}
    full = manifest['scope'] == FULL_SCOPE
    risk = manifest['imageEngineeringGate'] if full else 'NOT_EVALUATED'
    summary = {'scope': DELIVERY_SCOPE, 'sourceCommit': manifest['sourceCommit'], 'sourceDigest': manifest['sourceDigest'],
               'releaseIdentity': manifest['releaseIdentity'], 'releaseDecision': 'NO_GO', 'productReady': False,
               'sourceScan': {key: scan[key] for key in ('status', 'scannerExitCode', 'count', 'sourceDigest')},
               'dependencies': {key: manifest['dependencies'][key] for key in ('status', 'locks', 'nativeScannerExitCode', 'queriedAt')},
               'dependencyCoverage': 'DECLARED_LOCK_METADATA_NOT_INSTALLED_RUNTIME',
               'imageEngineeringGate': risk,
               'images': [{key: row[key] for key in ('key', 'services', 'imageId', 'nativeScannerExitCode', 'uniqueAdvisories')}
                          | {'securityStatus': row['security']['status']} for row in manifest.get('images', [])],
               'upstreamRawRecords': 'LOCAL_ONLY_NOT_EXPORTED',
               'sourceAttribution': ['https://osv.dev/', 'https://github.com/advisories'],
               'pendingGates': [gate for gate in manifest['pendingGates'] if gate != 'REDISTRIBUTION_OBLIGATIONS'
                                and not (gate == 'RUNTIME_IMAGE_RISK_REVIEW' and risk == 'PASSED')]}
    return {'source.sbom.cdx.json': public_bom, 'evidence-summary.json': summary}


def delivery_metadata(candidate, manifest):
    licenses = load(candidate / LICENSE_REPORT)
    return {'schemaVersion': 1, 'scope': DELIVERY_SCOPE, 'sourceStatus': manifest['sourceStatus'],
            'sourceCommit': manifest['sourceCommit'], 'sourceDigest': manifest['sourceDigest'],
            'candidateManifestSha256': sha(candidate / 'candidate-manifest.json'),
            'sourceLicenseEvidenceSha256': sha(candidate / LICENSE_REPORT),
            'sourceLicenseOriginals': licenses['noticeFiles'], 'fontMaterials': licenses['fontMaterials'],
            'includedSoftwareBinaries': licenses['softwareBinariesInArchive'],
            'runtimeImageBinaries': 'NOT_DISTRIBUTED_IN_SOURCE_PROFILE',
            'upstreamRawRecords': 'LOCAL_ONLY_NOT_EXPORTED', 'distributionMaterialGate': 'VERIFIED',
            'imageEngineeringGate': manifest['imageEngineeringGate'] if manifest['scope'] == FULL_SCOPE else 'NOT_EVALUATED',
            'releaseIdentity': manifest['releaseIdentity'], 'releaseDecision': 'NO_GO', 'productReady': False}


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, indent=2).encode('utf-8')


def delivery_checksums(result, manifest_bytes):
    return '\n'.join(f"{row['sha256']}  {row['path']}" for row in result['artifacts']) + \
        '\n' + hashlib.sha256(manifest_bytes).hexdigest() + '  delivery-manifest.json\n'


def export_delivery(repository, candidate, output):
    candidate, output = owned(candidate), owned(output)
    if (output == repository or repository in output.parents or output == candidate
            or candidate in output.parents or output in candidate.parents):
        raise ValueError('DELIVERY_SEPARATE_OWNED_OUTPUT_REQUIRED')
    manifest = verify(repository, candidate)
    public = delivery_jsons(candidate, manifest)
    output.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(candidate / 'controlled-source.zip', output / 'controlled-source.zip')
    for name, value in public.items():
        (output / name).write_bytes(json_bytes(value))
    result = delivery_metadata(candidate, manifest)
    result['artifacts'] = [{'path': name, 'sha256': sha(output / name), 'bytes': (output / name).stat().st_size}
                           for name in ['controlled-source.zip', *public]]
    encoded = json_bytes(result)
    (output / 'delivery-manifest.json').write_bytes(encoded)
    (output / 'checksums.sha256').write_text(delivery_checksums(result, encoded), encoding='utf-8')
    return verify_delivery(repository, candidate, output)


def verify_delivery(repository, candidate, directory):
    candidate, directory = owned(candidate), owned(directory)
    manifest = verify(repository, candidate)
    public = delivery_jsons(candidate, manifest)
    expected_names = {'controlled-source.zip', *public, 'delivery-manifest.json', 'checksums.sha256'}
    actual_names = {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
    if actual_names != expected_names or any((directory / name).is_symlink() for name in expected_names):
        raise ValueError('DELIVERY_MEMBER_COVERAGE_MISMATCH')
    if sha(directory / 'controlled-source.zip') != sha(candidate / 'controlled-source.zip'):
        raise ValueError('DELIVERY_SOURCE_ARCHIVE_DRIFT')
    for name, value in public.items():
        if (directory / name).read_bytes() != json_bytes(value):
            raise ValueError('DELIVERY_PROJECTION_DRIFT:' + name)
    result = delivery_metadata(candidate, manifest)
    result['artifacts'] = [{'path': name, 'sha256': sha(directory / name), 'bytes': (directory / name).stat().st_size}
                           for name in ['controlled-source.zip', *public]]
    encoded = json_bytes(result)
    if (directory / 'delivery-manifest.json').read_bytes() != encoded:
        raise ValueError('DELIVERY_MATERIAL_EVIDENCE_DRIFT')
    if (directory / 'checksums.sha256').read_text(encoding='utf-8') != delivery_checksums(result, encoded):
        raise ValueError('DELIVERY_CHECKSUM_MANIFEST_MISMATCH')
    return result


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--source-only', action='store_true')
    mode.add_argument('--candidate', action='store_true')
    mode.add_argument('--verify', type=Path)
    mode.add_argument('--export-source', type=Path)
    mode.add_argument('--verify-delivery', type=Path)
    parser.add_argument('--repository', type=Path, required=True)
    for name in ('source-scan', 'dependencies', 'tools', 'output'):
        parser.add_argument('--' + name, type=Path)
    parser.add_argument('--images', type=Path)
    parser.add_argument('--source-candidate', type=Path)
    args = parser.parse_args()
    if args.export_source:
        if args.output is None:
            parser.error('source delivery requires output')
        result = export_delivery(args.repository.resolve(), args.export_source, args.output)
    elif args.verify_delivery:
        if args.source_candidate is None:
            parser.error('delivery verification requires source-candidate')
        result = verify_delivery(args.repository.resolve(), args.source_candidate, args.verify_delivery)
    elif args.verify:
        result = verify(args.repository.resolve(), args.verify)
    else:
        if any(getattr(args, name) is None for name in ('source_scan', 'dependencies', 'tools', 'output')):
            parser.error('production requires source-scan, dependencies, tools and output')
        if args.candidate:
            if args.images is None:
                parser.error('candidate requires explicit images evidence plan')
            result = produce_candidate(args.repository.resolve(), args.source_scan, args.dependencies, args.tools, args.images, args.output)
        else:
            result = produce(args.repository.resolve(), args.source_scan, args.dependencies, args.tools, args.output)
    summary = {key: result[key] for key in ('scope', 'sourceStatus', 'sourceCommit', 'releaseIdentity', 'releaseDecision')}
    if result['scope'] == FULL_SCOPE:
        summary.update({key: result[key] for key in ('imageCoverageStatus', 'imageEngineeringGate')})
        summary['imageSubjects'] = len(result['images'])
    if result['scope'] == DELIVERY_SCOPE:
        summary.update({key: result[key] for key in ('distributionMaterialGate', 'imageEngineeringGate')})
    print(json.dumps(summary))
    if result['scope'] == FULL_SCOPE:
        return 5 if result['imageEngineeringGate'] != 'PASSED' or result['distributionMaterialGate'] != 'VERIFIED' else 0
    return 5 if result['scope'] == DELIVERY_SCOPE and result['imageEngineeringGate'] != 'PASSED' else 0


if __name__ == '__main__':
    raise SystemExit(main())
