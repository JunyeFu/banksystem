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
        relatives += ['apps/quality-case-portal/src/agent/assets/NotoSansSC-Regular.ttf',
                      'apps/quality-case-portal/src/agent/assets/OFL.txt']
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
        bom = {'bomFormat': 'CycloneDX', 'specVersion': '1.7', 'components': components}
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
                delivery = out.parent / 'full-source-delivery'
                parent_hash = MODULE.sha(out / 'candidate-manifest.json')
                with patch('sys.argv', ['verify-ci-artifacts.py', '--export-source', str(out), '--repository', str(repo), '--output', str(delivery)]):
                    self.assertEqual(MODULE.main(), 5)
                with patch('sys.argv', ['verify-ci-artifacts.py', '--verify-delivery', str(delivery), '--repository', str(repo), '--source-candidate', str(out)]):
                    self.assertEqual(MODULE.main(), 5)
                material = MODULE.load(delivery / 'delivery-manifest.json')
                self.assertEqual(material['distributionMaterialGate'], 'VERIFIED')
                self.assertEqual(material['imageEngineeringGate'], 'BLOCKED')
                self.assertEqual(MODULE.sha(out / 'candidate-manifest.json'), parent_hash)
                result = MODULE.load(out / 'candidate-manifest.json')
            self.assertEqual(result['scope'], MODULE.FULL_SCOPE)
            self.assertEqual(len(result['images']), 12)
            self.assertEqual(sum(len(row['services']) for row in result['images']), 14)
            self.assertEqual(result['imageCoverageStatus'], 'COMPLETE')
            self.assertEqual(result['imageEngineeringGate'], 'BLOCKED')
            self.assertTrue(all(row['nativeScannerExitCode'] == 1 for row in result['images']))
            self.assertTrue(all(row['licenseDistributionStatus'] == 'NOT_DISTRIBUTED_IN_SOURCE_PROFILE' for row in result['images']))
            self.assertEqual(result['distributionMaterialGate'], 'NOT_EXPORTED')
            self.assertEqual(result['releaseDecision'], 'NO_GO')

    def test_image_risk_gate_has_a_success_path_without_approving_runtime_binary_redistribution(self):
        records = [{'security': {'status': 'PASSED'}, 'licenseDistributionStatus': 'NOT_DISTRIBUTED_IN_SOURCE_PROFILE'}]
        self.assertEqual(MODULE.image_engineering_gate(records), 'PASSED')
        records[0]['security']['status'] = 'BLOCKED'
        self.assertEqual(MODULE.image_engineering_gate(records), 'BLOCKED')

    def test_source_delivery_contains_only_verified_source_and_projected_facts(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            marker = 'UPSTREAM_DESCRIPTION_NOT_FOR_PUBLIC_DELIVERY'
            bom = MODULE.load(deps / 'source.cdx.json')
            bom['components'][0]['description'] = marker
            bom['components'][0]['properties'] = [{'name': 'localPath', 'value': str(deps)}]
            self.write(deps / 'source.cdx.json', bom)
            reviewed, _ = MODULE.REVIEW.review_licenses(bom, scan / 'scan-source', MODULE.load(MODULE.REVIEW.POLICY_PATH))
            self.write(deps / 'source.reviewed.cdx.json', reviewed)
            delivery = out.parent / 'source-delivery'
            with self.context(files), patch.object(MODULE, 'git_info', return_value={'sourceCommit': 'a' * 40, 'workingTreeDirty': True}):
                MODULE.produce(repo, scan, deps, tools, out)
                private_scan = MODULE.load(out / 'reports/secrets.json')
                private_scan['upstreamParagraph'] = marker
                self.write(out / 'reports/secrets.json', private_scan)
                parent = MODULE.load(out / 'candidate-manifest.json')
                for row in parent['artifacts']:
                    if row['path'] == 'reports/secrets.json':
                        row['sha256'] = MODULE.sha(out / row['path'])
                        row['bytes'] = (out / row['path']).stat().st_size
                MODULE.write_manifest(out, parent)
                result = MODULE.export_delivery(repo, out, delivery)
                self.assertEqual(MODULE.verify_delivery(repo, out, delivery), result)
            self.assertEqual(result['distributionMaterialGate'], 'VERIFIED')
            self.assertEqual(result['releaseDecision'], 'NO_GO')
            self.assertFalse(result['productReady'])
            self.assertEqual({p.name for p in delivery.iterdir()}, {
                'controlled-source.zip', 'source.sbom.cdx.json', 'evidence-summary.json', 'delivery-manifest.json', 'checksums.sha256'})
            self.assertEqual(MODULE.sha(delivery / 'controlled-source.zip'), MODULE.sha(out / 'controlled-source.zip'))
            self.assertIn(marker, (out / 'reports/source.reviewed.cdx.json').read_text())
            for name in ('source.sbom.cdx.json', 'evidence-summary.json', 'delivery-manifest.json'):
                text = (delivery / name).read_text(encoding='utf-8')
                self.assertNotIn(marker, text)
                self.assertNotIn(str(deps), text)
            public_bom = MODULE.load(delivery / 'source.sbom.cdx.json')
            self.assertEqual(public_bom['components'][0]['name'], bom['components'][0]['name'])
            self.assertEqual(public_bom['components'][0]['licenses'], bom['components'][0]['licenses'])

    def test_delivery_rejects_extra_raw_report_and_rehashed_summary_tamper(self):
        for failure in ('raw_report', 'summary'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                delivery = out.parent / 'source-delivery'
                with self.context(files), patch.object(MODULE, 'git_info', return_value={'sourceCommit': 'a' * 40, 'workingTreeDirty': True}):
                    MODULE.produce(repo, scan, deps, tools, out)
                    MODULE.export_delivery(repo, out, delivery)
                    if failure == 'raw_report':
                        shutil.copyfile(out / 'reports/dependencies.json', delivery / 'native.json')
                    else:
                        summary = MODULE.load(delivery / 'evidence-summary.json')
                        summary['releaseDecision'] = 'GO'
                        self.write(delivery / 'evidence-summary.json', summary)
                        manifest = MODULE.load(delivery / 'delivery-manifest.json')
                        for row in manifest['artifacts']:
                            if row['path'] == 'evidence-summary.json':
                                row['sha256'] = MODULE.sha(delivery / row['path'])
                                row['bytes'] = (delivery / row['path']).stat().st_size
                        self.write(delivery / 'delivery-manifest.json', manifest)
                    with self.assertRaisesRegex(ValueError, 'DELIVERY_'):
                        MODULE.verify_delivery(repo, out, delivery)

    def test_rehashed_local_dependency_report_cannot_bypass_native_recomputation(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            with self.context(files), patch.object(MODULE, 'git_info', return_value={'sourceCommit': 'a' * 40, 'workingTreeDirty': True}):
                MODULE.produce(repo, scan, deps, tools, out)
                report = MODULE.load(out / 'reports/dependency-result.json')
                report['scannerExitCode'] = 1
                self.write(out / 'reports/dependency-result.json', report)
                parent = MODULE.load(out / 'candidate-manifest.json')
                for row in parent['artifacts']:
                    if row['path'] == 'reports/dependency-result.json':
                        row['sha256'] = MODULE.sha(out / row['path'])
                        row['bytes'] = (out / row['path']).stat().st_size
                MODULE.write_manifest(out, parent)
                with self.assertRaisesRegex(ValueError, 'ARTIFACT_DEPENDENCY_'):
                    MODULE.verify(repo, out)

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

    def test_bundled_font_has_exact_source_bytes_and_its_own_license(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
            result = MODULE.source_license_materials(scan / 'scan-source', MODULE.archive_files(files))
            self.assertEqual(len(result['fontMaterials']), 1)
            font = result['fontMaterials'][0]
            self.assertEqual(font['name'], 'Noto Sans SC')
            self.assertEqual(font['license'], 'OFL-1.1')
            self.assertEqual(font['sha256'], '450625c8d46ab3df97b7904ded955ec2746d17ec76740cb1e91d1ba63a0f89af')
            self.assertEqual(font['licenseOriginal'], 'apps/quality-case-portal/src/agent/assets/OFL.txt')
            self.assertEqual(font['licenseSha256'], '1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9')

    def test_missing_font_license_changed_font_or_unknown_font_blocks(self):
        for failure in ('missing_license', 'changed_font', 'unknown_font'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                repo, scan, deps, tools, out, files = self.fixture(Path(temporary))
                source = scan / 'scan-source'
                if failure == 'missing_license':
                    files.remove('apps/quality-case-portal/src/agent/assets/OFL.txt')
                elif failure == 'changed_font':
                    (source / 'apps/quality-case-portal/src/agent/assets/NotoSansSC-Regular.ttf').write_bytes(b'synthetic changed font')
                else:
                    name = 'unreviewed-font.ttf'
                    (source / name).write_bytes(b'synthetic unreviewed font')
                    files = sorted([*files, name])
                with self.assertRaisesRegex(ValueError, 'FONT_|LICENSE_MATERIAL'):
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


class PostgresArtifactReviewTest(unittest.TestCase):
    def fixture(self, root):
        policy = MODULE.load(MODULE.FOUNDATIONS.POLICY)
        review_policy = policy['postgresReview']
        inspection = {'Id': review_policy['imageId'], 'Architecture': 'amd64', 'Os': 'linux'}
        features = {name: 'ABSENT' for name in review_policy['absentPaths']}
        features.update({'chfnProvider': 'passwd', 'chshProvider': 'passwd'})
        findings = [{'name': row['name'], 'version': row['version'], 'ecosystem': row['ecosystem'],
                     'id': advisory, 'severity': ['original-native']} for row in review_policy['dispositions']
                    for advisory in row['advisories']]
        findings.append({'name': 'glibc', 'version': '2.41-12+deb13u4', 'ecosystem': 'Debian:13',
                         'id': 'DEBIAN-CVE-2026-18374', 'severity': ['original-native']})
        paths = {name: root / (name + '.json') for name in ('bom', 'nativeReport', 'review')}
        paths['bom'].write_text(json.dumps({'components': [{'name': 'postgresql-18', 'version': '18.6-1.pgdg13+1'}]}))
        paths['nativeReport'].write_text(json.dumps({'scope': 'unit-only public-image native fixture'}))
        record = {'name': 'postgres', 'imageId': inspection['Id'], 'nativeScannerExitCode': 1,
                  'nativeReportSha256': MODULE.sha(paths['nativeReport']), 'bomSha256': MODULE.sha(paths['bom']),
                  'featureFacts': features, 'riskReview': MODULE.FOUNDATIONS.postgres_review(findings, inspection, features, review_policy)}
        receipt = {'scope': policy['scope'], 'policySha256': MODULE.REVIEW.digest(MODULE.FOUNDATIONS.POLICY), 'subjects': [record]}
        paths['review'].write_text(json.dumps(receipt))
        return paths, inspection, findings, features, receipt

    def test_postgres_candidate_consumes_partial_review_without_promoting_other_native_risks(self):
        with tempfile.TemporaryDirectory() as temporary:
            paths, inspection, findings, features, _ = self.fixture(Path(temporary))
            with patch.object(MODULE.FOUNDATIONS.subprocess, 'run') as run:
                run.return_value.stdout = ''.join(f'{key}={value}\n' for key, value in features.items())
                result = MODULE.image_security(ROOT, 'bank-channel-postgres', {'nativeExit': 1}, paths, inspection, findings)
            self.assertEqual(result['status'], 'BLOCKED')
            self.assertEqual(result['reviewedAdvisories'], 14)
            self.assertEqual(result['blockingAdvisories'], 1)
            self.assertEqual(result['vendorGate']['status'], 'PASSED')

    def test_fresh_tool_presence_rejects_the_previous_absent_tool_receipt(self):
        for present in ('/usr/bin/sqlite3', '/usr/local/bin/sqlite3', '/usr/bin/apt-key', '/usr/sbin/apt-key',
                        '/usr/lib/systemd/systemd-oomd', '/usr/bin/systemd-oomd',
                        '/usr/lib/x86_64-linux-gnu/sqlite3/zipfile.so', '/usr/lib/sqlite3/zipfile.so',
                        '/usr/bin/bzip2recover', '/bin/bzip2recover',
                        '/usr/lib/gnupg/tpm2daemon', '/usr/lib/gnupg2/tpm2daemon'):
            with self.subTest(path=present), tempfile.TemporaryDirectory() as temporary:
                paths, inspection, findings, features, _ = self.fixture(Path(temporary))
                features[present] = 'PRESENT'
                with patch.object(MODULE.FOUNDATIONS.subprocess, 'run') as run:
                    run.return_value.stdout = ''.join(f'{key}={value}\n' for key, value in features.items())
                    with self.assertRaisesRegex(ValueError, 'POSTGRES_REVIEW_FEATURE_PROOF_DRIFT'):
                        MODULE.image_security(ROOT, 'bank-channel-postgres', {'nativeExit': 1}, paths, inspection, findings)

    def test_manually_rehashed_promoted_review_or_false_feature_fact_is_rejected(self):
        for failure in ('promotion', 'feature', 'native', 'policy', 'duplicate', 'missing'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                paths, inspection, findings, features, receipt = self.fixture(Path(temporary))
                record = receipt['subjects'][0]
                if failure == 'promotion':
                    record['riskReview']['status'] = 'REVIEWED'
                    record['riskReview']['blockingAdvisories'] = 0
                elif failure == 'feature':
                    record['featureFacts'] = {}
                elif failure == 'native':
                    record['nativeScannerExitCode'] = 0
                elif failure == 'policy':
                    receipt['policySha256'] = '0' * 64
                elif failure == 'duplicate':
                    receipt['subjects'].append(dict(record))
                else:
                    receipt['subjects'] = []
                paths['review'].write_text(json.dumps(receipt))
                with patch.object(MODULE.FOUNDATIONS.subprocess, 'run') as run:
                    run.return_value.stdout = ''.join(f'{key}={value}\n' for key, value in features.items())
                    with self.assertRaisesRegex(ValueError, 'ARTIFACT_POSTGRES_REVIEW_DRIFT'):
                        MODULE.image_security(ROOT, 'bank-channel-postgres', {'nativeExit': 1}, paths, inspection, findings)


class ActivemqCandidateEvidenceTest(unittest.TestCase):
    def fixture(self, root):
        policy = MODULE.load(MODULE.FOUNDATIONS.POLICY)
        review_policy = policy['activemqReview']
        image = {'Id': review_policy['imageId'], 'Architecture': 'amd64', 'Os': 'linux'}
        facts = {path: 'ABSENT' for path in review_policy['absentPaths']}
        findings = [{'name': row['name'], 'version': row['version'], 'ecosystem': row['ecosystem'],
                     'id': advisory, 'severity': ['native-severity']} for row in review_policy['dispositions']
                    for advisory in row['advisories']]
        findings.append({'name': 'gnupg2', 'version': '2.4.4-2ubuntu17.6', 'ecosystem': 'Ubuntu:24.04',
                         'id': 'UBUNTU-CVE-2026-105712', 'severity': ['native-severity']})
        paths = {name: root / (name + '.json') for name in ('bom', 'nativeReport', 'review')}
        for name in ('bom', 'nativeReport'):
            paths[name].write_text(json.dumps({'unitOnly': name}))
        record = {'name': 'activemq', 'imageId': image['Id'], 'nativeScannerExitCode': 1,
                  'nativeReportSha256': MODULE.sha(paths['nativeReport']), 'bomSha256': MODULE.sha(paths['bom']),
                  'featureFacts': facts,
                  'riskReview': MODULE.FOUNDATIONS.activemq_review(findings, image, facts, review_policy)}
        receipt = {'scope': policy['scope'], 'policySha256': MODULE.REVIEW.digest(MODULE.FOUNDATIONS.POLICY), 'subjects': [record]}
        paths['review'].write_text(json.dumps(receipt))
        return paths, image, findings, facts, receipt

    def test_actual_consumer_accepts_partial_mq_review_without_promoting_remaining_risk(self):
        with tempfile.TemporaryDirectory() as temporary:
            paths, image, findings, facts, _ = self.fixture(Path(temporary))
            with patch.object(MODULE.FOUNDATIONS, 'activemq_features', return_value=facts):
                result = MODULE.image_security(ROOT, 'activemq', {'nativeExit': 1}, paths, image, findings)
            self.assertEqual(result['status'], 'BLOCKED')
            self.assertEqual(result['reviewedAdvisories'], 2)
            self.assertEqual(result['blockingAdvisories'], 1)

    def test_missing_exact_review_does_not_reduce_mq_risk(self):
        with tempfile.TemporaryDirectory() as temporary:
            paths, image, findings, _, _ = self.fixture(Path(temporary))
            paths.pop('review')
            result = MODULE.image_security(ROOT, 'activemq', {'nativeExit': 1}, paths, image, findings)
            self.assertEqual(result['status'], 'BLOCKED')
            self.assertEqual(result['blockingAdvisories'], 3)

    def test_old_policy_false_counts_or_forged_material_receipts_are_rejected(self):
        for failure in ('promotion', 'feature', 'native', 'policy', 'duplicate', 'missing', 'bom', 'report', 'old-record'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temporary:
                paths, image, findings, facts, receipt = self.fixture(Path(temporary))
                record = receipt['subjects'][0]
                if failure == 'promotion':
                    record['riskReview']['status'] = 'REVIEWED'
                    record['riskReview']['blockingAdvisories'] = 0
                elif failure == 'feature':
                    record['featureFacts'] = {}
                elif failure == 'native':
                    record['nativeScannerExitCode'] = 0
                elif failure == 'policy':
                    receipt['policySha256'] = '0' * 64
                elif failure == 'duplicate':
                    receipt['subjects'].append(dict(record))
                elif failure == 'missing':
                    receipt['subjects'] = []
                elif failure in ('bom', 'report'):
                    paths['bom' if failure == 'bom' else 'nativeReport'].write_text('{"changed":true}')
                else:
                    record.pop('riskReview')
                paths['review'].write_text(json.dumps(receipt))
                with patch.object(MODULE.FOUNDATIONS, 'activemq_features', return_value=facts):
                    with self.assertRaisesRegex(ValueError, 'ARTIFACT_ACTIVEMQ_REVIEW_DRIFT'):
                        MODULE.image_security(ROOT, 'activemq', {'nativeExit': 1}, paths, image, findings)

    def test_current_feature_change_rejects_previously_valid_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            paths, image, findings, facts, _ = self.fixture(Path(temporary))
            for path in facts:
                with self.subTest(path=path), patch.object(MODULE.FOUNDATIONS, 'activemq_features',
                        return_value={**facts, path: 'PRESENT'}):
                    with self.assertRaisesRegex(ValueError, 'ACTIVEMQ_REVIEW_FEATURE_PROOF_DRIFT'):
                        MODULE.image_security(ROOT, 'activemq', {'nativeExit': 1}, paths, image, findings)


if __name__ == '__main__':
    unittest.main()
