import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('ci_artifacts', ROOT / 'scripts/deploy/verify-ci-artifacts.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SourceArtifactTest(unittest.TestCase):
    def write(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding='utf-8')

    def fixture(self, root):
        home = root / 'banksystem-rf065'
        repo, scan, deps = home / 'repo', home / 'scan', home / 'dependencies'
        source = scan / 'scan-source'
        packages = MODULE.REVIEW.DEPENDENCIES.PACKAGES
        policy = MODULE.load(MODULE.REVIEW.POLICY_PATH)
        relatives = ['LICENSE', 'scripts/test/ci-dependency-dispositions.json']
        relatives += [f'{name}/{file}' for name in packages for file in ('package.json', 'package-lock.json')]
        relatives += list(policy['zipPatch']['files'])
        relatives += [row['evidence'] for row in policy['thirdPartyLicenses']]
        relatives += list(policy['sourceDelivery']['files']) + [policy['sourceDelivery']['mavenWrapper']['path']]
        relatives += ['platform/hengzhun-regression-system/scripts/verification/runtime-dependency-security.test.cjs']
        files = sorted(set(relatives))
        for relative in files:
            for target in (repo / relative, source / relative):
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, target)
        historical = MODULE.REFERENCE_LIBRARIES[0] + 'unit-fixture.docx'
        for target in (repo / historical, source / historical):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'unit-only historical manual, not product source')
        files = sorted([*files, historical])
        (repo / '.env').touch()
        hashes = MODULE.SOURCE.file_hashes(source, files)
        digest = MODULE.SOURCE.source_digest(hashes)
        self.write(scan / 'source-manifest.json', {'scope': 'CURRENT_CONTROLLED_SOURCE', 'files': files,
                   'fileHashes': hashes, 'sourceDigest': digest})
        self.write(scan / 'secrets.json', {'status': 'PASSED', 'scannerExitCode': 0, 'count': 0,
                   'findings': [], 'sourceDigest': digest})
        for package in packages:
            for name in ('package.json', 'package-lock.json'):
                target = deps / 'product-dependencies' / package / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source / package / name, target)
        locks = [f'{package}/package-lock.json' for package in packages]
        coverage = {'scope': 'DECLARED_PRODUCT_NPM_DEPENDENCIES', 'locks': locks}
        self.write(deps / 'dependency-coverage.json', coverage)
        native = {'results': [{'source': {'path': str((deps / 'product-dependencies' / lock).resolve())},
                              'packages': []} for lock in locks]}
        self.write(deps / 'dependencies.json', native)
        inventory = MODULE.REVIEW.SCAN.inventory(native, coverage, deps.resolve(), 0)
        self.write(deps / 'vulnerability-inventory.json', inventory)
        self.write(deps / 'dependency-result.json', {key: value for key, value in inventory.items() if key != 'findings'})
        components = []
        for package in packages:
            value = MODULE.load(source / package / 'package.json')
            components.append({'type': 'library', 'name': value['name'], 'version': value['version'],
                               'licenses': [{'license': {'id': 'MPL-2.0'}}]})
        bom = {'bomFormat': 'CycloneDX', 'components': components}
        self.write(deps / 'source.cdx.json', bom)
        reviewed_bom, licenses = MODULE.REVIEW.review_licenses(bom, source, policy)
        self.write(deps / 'source.reviewed.cdx.json', reviewed_bom)
        self.write(deps / 'license-review.json', licenses)
        (deps / 'zip-patch-regression.txt').write_text('# pass 4\n# fail 0\n', encoding='utf-8')
        test = source / 'platform/hengzhun-regression-system/scripts/verification/runtime-dependency-security.test.cjs'
        self.write(deps / 'dependency-review.json', {'status': 'PASSED', 'nativeScannerExitCode': 0,
                   'policySha256': MODULE.REVIEW.digest(MODULE.REVIEW.POLICY_PATH), 'patchFiles': policy['zipPatch']['files'],
                   'patchRegressionExitCode': 0, 'patchRegressionSha256': MODULE.REVIEW.digest(deps / 'zip-patch-regression.txt'),
                   'patchTestSourceSha256': MODULE.REVIEW.digest(test)})
        tools = {}
        for name, spec in MODULE.load(ROOT / 'scripts/test/ci-security-tools.json').items():
            target = home / 'tools' / spec['windows']['executable']
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(b'unit fixture only, never executed')
            tools[name] = {'version': spec['version'], 'platform': 'windows',
                           'sha256': spec['windows']['sha256'], 'path': str(target)}
        tools_path = home / 'toolset.json'
        self.write(tools_path, tools)
        return repo, scan, deps, tools_path, home / 'candidate', files

    def context(self, files):
        return patch.object(MODULE.SOURCE, 'git_paths', side_effect=lambda _, *args: files if '--cached' in args else ['.env'])

    def image_fixture(self, home):
        scope = MODULE.FOUNDATIONS.runtime_scope(ROOT)
        groups = {}
        for row in scope['services']:
            groups.setdefault(row['image'], []).append(row['service'])
        selections, inspections = [], {}
        for index, (reference, services) in enumerate(sorted(groups.items()), 1):
            key = sorted(services)[0]
            # IDs name the registered subjects; every byte/inspection here is a unit-only mock.
            image_id, layer = MODULE.expected_image_id(key), f'sha256:{index + 100:064x}'
            directory = home / 'image-input' / key
            package, version = ('postgresql-18', '18.6') if 'postgresql' in services else (
                ('nginx', '1.31.7-r1') if 'web-app' in services else ('unit-fixture', '0.0.0'))
            bom = {'bomFormat': 'CycloneDX', 'metadata': {'component': {'version': image_id[7:]}},
                   'components': [{'type': 'library', 'name': package, 'version': version}]}
            native = {'image_metadata': {'layer_metadata': [{'diff_id': layer, 'is_empty': False}]},
                      'results': [{'packages': [{'package': {'name': package, 'version': version, 'ecosystem': 'Go'},
                                                'vulnerabilities': [{'id': 'SYNTHETIC-UNIT-ONLY'}]}]}]}
            self.write(directory / 'bom.json', bom)
            self.write(directory / 'native.json', native)
            selections.append({'declaredReference': reference, 'imageId': image_id, 'nativeExit': 1,
                               'bom': str(directory / 'bom.json'), 'nativeReport': str(directory / 'native.json')})
            inspections[image_id] = {'Id': image_id, 'RootFS': {'Layers': [layer]}, 'Architecture': 'amd64', 'Os': 'linux'}
        plan = home / 'images.json'
        self.write(plan, {'subjects': selections})
        return scope, selections, inspections, plan

    def test_full_default_scope_materials_roundtrip_keeps_risks_blocked_and_cli_exit_five(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            scope, selections, inspections, plan = self.image_fixture(out.parent)
            arguments = ['verify-ci-artifacts.py', '--candidate', '--repository', str(repo),
                         '--source-scan', str(scan), '--dependencies', str(deps), '--tools', str(tools),
                         '--images', str(plan), '--output', str(out)]
            with self.context(files), patch.object(MODULE, 'git_info', return_value={'sourceCommit': 'a' * 40, 'workingTreeDirty': True}), \
                    patch.object(MODULE.FOUNDATIONS, 'runtime_scope', return_value=scope), \
                    patch.object(MODULE, 'inspect_image', side_effect=inspections.__getitem__):
                with patch('sys.argv', arguments):
                    self.assertEqual(MODULE.main(), 5)
                with patch('sys.argv', ['verify-ci-artifacts.py', '--verify', str(out), '--repository', str(repo)]):
                    self.assertEqual(MODULE.main(), 5)
                result = MODULE.load(out / 'candidate-manifest.json')
            self.assertEqual(result['scope'], MODULE.FULL_SCOPE)
            self.assertEqual(len(result['images']), 12)
            self.assertEqual(sum(len(row['services']) for row in result['images']), 14)
            self.assertEqual(result['imageCoverageStatus'], 'COMPLETE')
            self.assertEqual(result['imageEngineeringGate'], 'BLOCKED')
            self.assertTrue(all(row['nativeScannerExitCode'] == 1 for row in result['images']))
            self.assertTrue(all(row['licenseDistributionStatus'] == 'NOT_VERIFIED' for row in result['images']))
            self.assertEqual(result['releaseDecision'], 'NO_GO')

    def test_bank_smoke_subset_cannot_replace_default_runtime_scope(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            scope, selections, inspections, plan = self.image_fixture(out.parent)
            smoke = {row['image'] for row in scope['services'] if row['inBankSmoke']}
            self.write(plan, {'subjects': [row for row in selections if row['declaredReference'] in smoke]})
            with self.context(files), patch.object(MODULE.FOUNDATIONS, 'runtime_scope', return_value=scope), \
                    self.assertRaisesRegex(ValueError, 'DEFAULT_IMAGE_COVERAGE_MISMATCH'):
                MODULE.produce_candidate(repo, scan, deps, tools, plan, out)
            self.assertFalse(out.exists())

    def test_optional_admin_tool_cannot_silently_join_default_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            scope, selections, inspections, plan = self.image_fixture(out.parent)
            admin = next(row for row in scope['optionalServices'] if row['service'] == 'web-app')
            selections.append({'declaredReference': admin['image']})
            self.write(plan, {'subjects': selections})
            with self.context(files), patch.object(MODULE.FOUNDATIONS, 'runtime_scope', return_value=scope), \
                    self.assertRaisesRegex(ValueError, 'DEFAULT_IMAGE_COVERAGE_MISMATCH'):
                MODULE.produce_candidate(repo, scan, deps, tools, plan, out)
            self.assertFalse(out.exists())

    def test_image_bom_layer_or_exit_mismatch_cannot_be_packaged(self):
        for failure in ('bom', 'layer', 'exit'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                scope, selections, inspections, plan = self.image_fixture(out.parent)
                first = selections[0]
                if failure == 'bom':
                    report = MODULE.load(Path(first['bom']))
                    report['metadata']['component']['version'] = 'f' * 64
                    self.write(Path(first['bom']), report)
                elif failure == 'layer':
                    inspections[first['imageId']]['RootFS']['Layers'] = ['sha256:' + 'f' * 64]
                else:
                    first['nativeExit'] = 0
                    self.write(plan, {'subjects': selections})
                with self.context(files), patch.object(MODULE.FOUNDATIONS, 'runtime_scope', return_value=scope), \
                        patch.object(MODULE, 'inspect_image', side_effect=inspections.__getitem__), \
                        self.assertRaises(ValueError):
                    MODULE.produce_candidate(repo, scan, deps, tools, plan, out)
                self.assertFalse(out.exists())

    def test_duplicate_subject_or_forged_review_does_not_satisfy_current_policy(self):
        for failure in ('duplicate', 'review'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                scope, selections, inspections, plan = self.image_fixture(out.parent)
                if failure == 'duplicate':
                    selections.append(selections[0])
                else:
                    row = next(row for row in selections if row['declaredReference'].startswith('nginx:'))
                    fake = out.parent / 'fake-review.json'
                    self.write(fake, {'status': 'REVIEWED', 'releaseDecision': 'GO'})
                    row['review'] = str(fake)
                self.write(plan, {'subjects': selections})
                with self.context(files), patch.object(MODULE.FOUNDATIONS, 'runtime_scope', return_value=scope), \
                        patch.object(MODULE, 'inspect_image', side_effect=inspections.__getitem__), \
                        patch.object(MODULE.NGINX, 'source_digest', return_value=MODULE.load(MODULE.NGINX.POLICY_PATH)['sourceDigest']), \
                        self.assertRaises(ValueError):
                    MODULE.produce_candidate(repo, scan, deps, tools, plan, out)
                self.assertFalse(out.exists())

    def test_reviewed_nginx_image_cannot_be_used_for_the_wrong_portal_role(self):
        policy = MODULE.load(ROOT / 'scripts/test/ci-nginx-dispositions.json')
        wrong = policy['reviewedImages']['operations-console']
        self.assertIn(wrong, policy['reviewedImages'].values())
        with tempfile.TemporaryDirectory() as temporary:
            report = Path(temporary) / 'review.json'
            self.write(report, {'status': 'REVIEWED'})
            with self.assertRaisesRegex(ValueError, 'ARTIFACT_IMAGE_REVIEW_ID_DRIFT:customer-portal'):
                MODULE.image_security(Path(temporary), 'customer-portal', {'nativeExit': 1},
                                      {'review': report}, {'Id': wrong}, [])

    def test_clean_image_cannot_be_substituted_for_a_different_foundation_role(self):
        wrong = MODULE.expected_image_id('web-app')
        self.assertNotEqual(wrong, MODULE.expected_image_id('prometheus'))
        with self.assertRaisesRegex(ValueError, 'ARTIFACT_IMAGE_REVIEW_ID_DRIFT:prometheus'):
            MODULE.image_security(ROOT, 'prometheus', {'nativeExit': 0}, {}, {'Id': wrong}, [])

    def test_packaged_image_report_bytes_cannot_change_after_generation(self):
        for failure in ('bytes', 'path'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                scope, selections, inspections, plan = self.image_fixture(out.parent)
                with self.context(files), patch.object(MODULE, 'git_info', return_value={'sourceCommit': 'a' * 40, 'workingTreeDirty': True}), \
                        patch.object(MODULE.FOUNDATIONS, 'runtime_scope', return_value=scope), \
                        patch.object(MODULE, 'inspect_image', side_effect=inspections.__getitem__):
                    result = MODULE.produce_candidate(repo, scan, deps, tools, plan, out)
                    row = result['images'][0]
                    if failure == 'bytes':
                        (out / row['evidence']['nativeReport']).write_text('{}')
                    else:
                        row['key'] = '../outside-candidate'
                        row['evidence']['nativeReport'] = 'images/../outside-candidate/native.json'
                        self.write(out / 'candidate-manifest.json', result)
                    with self.assertRaisesRegex(ValueError, 'ARTIFACT_BYTES_CHANGED|ARTIFACT_IMAGE_EVIDENCE_PATH_MISMATCH'):
                        MODULE.verify(repo, out)

    def test_source_bundle_roundtrip_is_explicitly_not_a_product_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            with self.context(files), patch.object(MODULE, 'git_info', return_value={'sourceCommit': 'a' * 40, 'workingTreeDirty': True}):
                result = MODULE.produce(repo, scan, deps, tools, out)
                self.assertEqual(MODULE.verify(repo, out), result)
            self.assertEqual(result['releaseDecision'], 'NO_GO')
            self.assertEqual(result['releaseIdentity'], 'UNFROZEN')
            self.assertFalse(result['productReady'])
            self.assertEqual(result['sourceLicenseStatus'], 'SOURCE_AND_BOOTSTRAP_MATERIALS_REVIEWED')
            self.assertFalse(MODULE.load(out / MODULE.LICENSE_REPORT)['fullDistributionGateCompleted'])
            self.assertEqual(result['archiveExclusions'], list(MODULE.REFERENCE_LIBRARIES))
            with zipfile.ZipFile(out / 'controlled-source.zip') as archive:
                self.assertEqual(sorted(archive.namelist()), MODULE.archive_files(files))
                self.assertEqual(result['archivedFileCount'], len(files) - 1)
                self.assertNotIn('.env', archive.namelist())
                self.assertIn('LICENSE', archive.namelist())
                self.assertFalse(any(name.startswith(MODULE.REFERENCE_LIBRARIES) for name in archive.namelist()))

    def test_missing_license_original_changed_bootstrap_or_unknown_binary_blocks(self):
        for failure in ('notice', 'wrapper', 'binary'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                source = scan / 'scan-source'
                if failure == 'notice':
                    files.remove('THIRD-PARTY-NOTICES.md')
                elif failure == 'wrapper':
                    (source / 'services/bank-channel-service/.mvn/wrapper/maven-wrapper.jar').write_bytes(b'changed fixture')
                else:
                    name = 'unreviewed-library.jar'
                    (source / name).write_bytes(b'unit-only unreviewed binary')
                    files = sorted([*files, name])
                with self.assertRaisesRegex(ValueError, 'LICENSE_MATERIAL|BOOTSTRAP_BINARY|UNREVIEWED_SOFTWARE_BINARY'):
                    MODULE.source_license_materials(source, MODULE.archive_files(files))

    def test_historical_inventory_cannot_claim_current_release_coverage(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            name = 'platform/hengzhun-regression-system/THIRD-PARTY-NOTICES.md'
            path = scan / 'scan-source' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('# Third-party license inventory\nCurrent release fixture\n', encoding='utf-8')
            files = sorted([*files, name])
            with self.assertRaisesRegex(ValueError, 'HISTORICAL_LICENSE_INVENTORY_MISLABELED'):
                MODULE.source_license_materials(scan / 'scan-source', MODULE.archive_files(files))

    def test_source_changed_after_scan_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            (scan / 'scan-source/LICENSE').write_text('changed')
            with self.context(files), self.assertRaisesRegex(ValueError, 'SOURCE_DRIFT'):
                MODULE.produce(repo, scan, deps, tools, out)
            self.assertFalse(out.exists())

    def test_failed_secret_scan_cannot_produce_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            report = MODULE.load(scan / 'secrets.json')
            report.update(status='FAILED', scannerExitCode=1)
            self.write(scan / 'secrets.json', report)
            with self.context(files), self.assertRaisesRegex(ValueError, 'SOURCE_SCAN_NOT_PASSED'):
                MODULE.produce(repo, scan, deps, tools, out)

    def test_missing_bom_or_lock_coverage_blocks(self):
        for failure in ('bom', 'coverage'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                if failure == 'bom':
                    (deps / 'source.cdx.json').unlink()
                else:
                    coverage = MODULE.load(deps / 'dependency-coverage.json')
                    coverage['locks'].pop()
                    self.write(deps / 'dependency-coverage.json', coverage)
                with self.context(files), self.assertRaises((ValueError, FileNotFoundError)):
                    MODULE.produce(repo, scan, deps, tools, out)

    def test_patch_regression_changed_or_scanned_lock_drift_blocks(self):
        for failure in ('regression', 'lock'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                target = deps / ('zip-patch-regression.txt' if failure == 'regression' else 'product-dependencies/packages/bank-api-client/package-lock.json')
                target.write_text('changed')
                with self.context(files), self.assertRaisesRegex(ValueError, 'REGRESSION_BINDING|SCANNED_DEPENDENCY_DRIFT'):
                    MODULE.produce(repo, scan, deps, tools, out)

    def test_artifact_byte_change_and_release_promotion_are_rejected(self):
        for failure in ('bytes', 'promotion'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                with self.context(files), patch.object(MODULE, 'git_info', return_value={'sourceCommit': 'a' * 40, 'workingTreeDirty': True}):
                    MODULE.produce(repo, scan, deps, tools, out)
                    if failure == 'bytes':
                        with (out / 'controlled-source.zip').open('ab') as stream:
                            stream.write(b'changed')
                    else:
                        manifest = MODULE.load(out / 'candidate-manifest.json')
                        manifest['releaseDecision'] = 'GO'
                        self.write(out / 'candidate-manifest.json', manifest)
                    with self.assertRaisesRegex(ValueError, 'BYTES_CHANGED|CANNOT_PROMOTE_SOURCE'):
                        MODULE.verify(repo, out)


if __name__ == '__main__':
    unittest.main()
