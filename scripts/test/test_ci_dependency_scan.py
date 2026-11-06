import importlib.util
import copy
import hashlib
import io
import json
import re
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('dependency_scan', Path(__file__).resolve().parents[1] / 'deploy/scan-ci-dependencies.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
REVIEW_SPEC = importlib.util.spec_from_file_location('dependency_review', Path(__file__).resolve().parents[1] / 'deploy/verify-ci-dependency-review.py')
REVIEW = importlib.util.module_from_spec(REVIEW_SPEC)
REVIEW_SPEC.loader.exec_module(REVIEW)
IMAGE_SPEC = importlib.util.spec_from_file_location('image_review', Path(__file__).resolve().parents[1] / 'deploy/verify-ci-image-review.py')
IMAGE = importlib.util.module_from_spec(IMAGE_SPEC)
IMAGE_SPEC.loader.exec_module(IMAGE)
NGINX_SPEC = importlib.util.spec_from_file_location('nginx_review', Path(__file__).resolve().parents[1] / 'deploy/verify-ci-nginx-review.py')
NGINX = importlib.util.module_from_spec(NGINX_SPEC)
NGINX_SPEC.loader.exec_module(NGINX)
FINERACT_SPEC = importlib.util.spec_from_file_location('fineract_patch', Path(__file__).resolve().parents[1] / 'deploy/prepare-fineract-dependency-patch.py')
FINERACT = importlib.util.module_from_spec(FINERACT_SPEC)
FINERACT_SPEC.loader.exec_module(FINERACT)
FOUNDATIONS_SPEC = importlib.util.spec_from_file_location('foundations', Path(__file__).resolve().parents[1] / 'deploy/inspect-ci-foundations.py')
FOUNDATIONS = importlib.util.module_from_spec(FOUNDATIONS_SPEC)
FOUNDATIONS_SPEC.loader.exec_module(FOUNDATIONS)
FOUNDATION_PATCH_SPEC = importlib.util.spec_from_file_location('foundation_patch', Path(__file__).resolve().parents[1] / 'deploy/prepare-ci-foundation-patches.py')
FOUNDATION_PATCH = importlib.util.module_from_spec(FOUNDATION_PATCH_SPEC)
FOUNDATION_PATCH_SPEC.loader.exec_module(FOUNDATION_PATCH)
GOSU_SPEC = importlib.util.spec_from_file_location('gosu_symbols', Path(__file__).resolve().parents[1] / 'deploy/inspect-gosu-symbols.py')
GOSU = importlib.util.module_from_spec(GOSU_SPEC)
GOSU_SPEC.loader.exec_module(GOSU)
GOSU_PATCH_SPEC = importlib.util.spec_from_file_location('gosu_patch', Path(__file__).resolve().parents[1] / 'deploy/prepare-gosu-dependency-patch.py')
GOSU_PATCH = importlib.util.module_from_spec(GOSU_PATCH_SPEC)
GOSU_PATCH_SPEC.loader.exec_module(GOSU_PATCH)


class DependencyResultTest(unittest.TestCase):
    def fixture(self, directory, vulnerable=False):
        lock = 'app/package-lock.json'
        path = directory / 'product-dependencies' / lock
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({'packages': {'': {'devDependencies': {'test-pool': '1.0.0'}}, 'node_modules/test-pool': {'version': '1.0.0', 'dev': True}}}))
        package = {'package': {'name': 'test-pool', 'version': '1.0.0'}, 'vulnerabilities': []}
        if vulnerable:
            package['vulnerabilities'] = [{'id': 'SYNTHETIC-TEST', 'database_specific': {'severity': 'CRITICAL'}}]
        return {'locks': [lock]}, {'results': [{'source': {'path': str(path)}, 'packages': [package]}]}

    def test_success_requires_complete_clean_actual_result(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            coverage, report = self.fixture(directory)
            result = MODULE.inventory(report, coverage, directory, 0)
            self.assertEqual(result['status'], 'PASSED')
            self.assertFalse(result['installedRuntimeProven'])

    def test_findings_preserve_failure_and_development_scope(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            coverage, report = self.fixture(directory, True)
            result = MODULE.inventory(report, coverage, directory, 1)
            self.assertEqual(result['status'], 'FAILED')
            self.assertEqual(result['scannerExitCode'], 1)
            self.assertEqual(result['uniqueAdvisories'], 1)
            self.assertEqual(result['findings'][0]['declarationScopes'], ['DEVELOPMENT'])

    def test_missing_coverage_is_not_zero_vulnerabilities(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            coverage, _ = self.fixture(directory)
            result = MODULE.inventory({'results': []}, coverage, directory, 0)
            self.assertEqual(result['status'], 'ERROR')

    def test_canonical_paths_match_the_same_lock_through_a_real_directory_alias(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            coverage, report = self.fixture(directory)
            lock = Path(report['results'][0]['source']['path'])
            (lock.parent / 'alias').mkdir()
            report['results'][0]['source']['path'] = str(lock.parent / 'alias' / '..' / lock.name)
            result = MODULE.inventory(report, coverage, directory, 0)
            self.assertEqual(result['status'], 'PASSED')
            self.assertEqual(result['coveredLocks'], coverage['locks'])

    def test_duplicate_canonical_lock_results_are_not_complete_coverage(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            coverage, report = self.fixture(directory)
            report['results'][0]['source']['path'] = str(Path(report['results'][0]['source']['path']).resolve())
            report['results'].append(copy.deepcopy(report['results'][0]))
            result = MODULE.inventory(report, coverage, directory, 0)
            self.assertEqual(result['status'], 'ERROR')
            self.assertFalse(result['coverageComplete'])

    def test_native_error_or_exit_findings_mismatch_is_not_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            coverage, report = self.fixture(directory, True)
            self.assertEqual(MODULE.inventory(report, coverage, directory, 0)['status'], 'ERROR')
            self.assertEqual(MODULE.inventory(report, coverage, directory, 127)['status'], 'ERROR')


class LocalPatchReviewTest(unittest.TestCase):
    def fixture(self, source):
        policy = copy.deepcopy(json.loads(REVIEW.POLICY_PATH.read_text()))
        root = REVIEW.ROOT
        for relative in policy['zipPatch']['files']:
            target = source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((root / relative).read_bytes())
        relative = policy['zipPatch']['lockfile']
        for name in ('package.json', 'package-lock.json'):
            target = source / Path(relative).parent / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((root / Path(relative).parent / name).read_bytes())
        inventory = {'status': 'FAILED', 'scannerExitCode': 1, 'coverageComplete': True,
                     'findings': [{'lockfile': relative, 'name': 'extract-zip', 'version': '2.0.1',
                                   'advisories': [{'id': value} for value in policy['zipPatch']['advisories']]}]}
        return policy, inventory

    def test_only_precise_patch_is_reviewed_without_changing_raw_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            policy, inventory = self.fixture(source)
            before = copy.deepcopy(inventory)
            self.assertEqual(REVIEW.review_findings(inventory, source, policy), 'LOCAL_PATCH_REVIEWED')
            self.assertEqual(inventory, before)

    def test_changed_patch_or_unknown_advisory_blocks_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            policy, inventory = self.fixture(source)
            inventory['findings'][0]['advisories'].append({'id': 'NEW-UNREVIEWED'})
            with self.assertRaisesRegex(ValueError, 'UNHANDLED_FINDINGS'):
                REVIEW.review_findings(inventory, source, policy)
            inventory['findings'][0]['advisories'].pop()
            (source / next(iter(policy['zipPatch']['files']))).write_text('changed')
            with self.assertRaisesRegex(ValueError, 'PATCH_DRIFT'):
                REVIEW.review_findings(inventory, source, policy)

    def test_native_error_or_registry_binding_is_not_patch_acceptance(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            policy, inventory = self.fixture(source)
            inventory['status'] = 'ERROR'
            with self.assertRaisesRegex(ValueError, 'SCAN_ERROR'):
                REVIEW.review_findings(inventory, source, policy)
            inventory['status'] = 'FAILED'
            lockfile = source / policy['zipPatch']['lockfile']
            lock = json.loads(lockfile.read_text())
            lock['packages']['node_modules/extract-zip']['resolved'] = 'https://registry.npmjs.org/extract-zip/-/extract-zip-2.0.1.tgz'
            lockfile.write_text(json.dumps(lock))
            with self.assertRaisesRegex(ValueError, 'BINDING_MISMATCH'):
                REVIEW.review_findings(inventory, source, policy)

    def test_unreviewed_license_never_becomes_project_mpl(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            policy, _ = self.fixture(source)
            for package in REVIEW.DEPENDENCIES.PACKAGES:
                target = source / package / 'package.json'
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((REVIEW.ROOT / package / 'package.json').read_bytes())
            for row in policy['thirdPartyLicenses']:
                target = source / row['evidence']
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((REVIEW.ROOT / row['evidence']).read_bytes())
            bom = {'components': [{'type': 'library', 'name': 'unknown-third-party', 'version': '1.0.0'}]}
            reviewed, report = REVIEW.review_licenses(bom, source, policy)
            self.assertEqual(report['status'], 'FAILED')
            self.assertNotIn('licenses', reviewed['components'][0])
            self.assertFalse(report['obligationsReviewedForCandidate'])


class ImageReviewTest(unittest.TestCase):
    def test_changed_image_identity_cannot_reuse_same_filesystem_and_jar_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / 'banksystem-rf065'
            home.mkdir()
            policy = {'reviewedImageId': 'sha256:' + 'a' * 64,
                      'baseLayers': ['base'], 'jarPayloadDigest': 'same-payload'}
            bom = {'metadata': {'component': {'version': 'b' * 64}}}
            for filename, value in (('policy.json', policy), ('bom.json', bom), ('native.json', {})):
                (home / filename).write_text(json.dumps(value))
            inspection = {'Id': 'sha256:' + 'b' * 64, 'RootFS': {'Layers': ['base', 'app']},
                          'Config': {'Entrypoint': ['java', '-jar', '/app/app.jar'], 'User': '10001'},
                          'Architecture': 'amd64'}
            args = ['verify-ci-image-review.py', '--source', str(home), '--bom', str(home / 'bom.json'),
                    '--native-report', str(home / 'native.json'), '--native-exit', '1',
                    '--image', inspection['Id'], '--jar', str(home / 'app.jar'),
                    '--materials', str(home), '--output', str(home / 'out')]
            with patch.object(IMAGE, 'POLICY_PATH', home / 'policy.json'), \
                    patch.object(IMAGE.subprocess, 'run', return_value=unittest.mock.Mock(stdout=json.dumps([inspection]))), \
                    patch.object(IMAGE, 'jar_payload_digest', return_value='same-payload'), patch('sys.argv', args):
                with self.assertRaisesRegex(ValueError, 'IMAGE_REVIEW_IMAGE_DRIFT'):
                    IMAGE.main()

    def fixture(self):
        row = {'name': 'reviewed-package', 'version': '1.0.0', 'ecosystem': 'Maven', 'id': 'KNOWN'}
        policy = {'sourceDigest': 'reviewed-source', 'dispositions': [
            {**{k: row[k] for k in ('name', 'version', 'ecosystem')}, 'advisories': ['KNOWN'],
             'status': 'NOT_AFFECTED', 'reason': 'Required vulnerable feature absent in reviewed product.',
             'evidence': ['exact-reviewed-source'], 'limits': 'This source and artifact only.'}]}
        return row, policy

    def test_exact_evidence_review_preserves_native_finding(self):
        row, policy = self.fixture()
        before = copy.deepcopy(row)
        result = IMAGE.review([row], policy, 'reviewed-source')
        self.assertEqual(result['status'], 'REVIEWED')
        self.assertEqual(result['reviewedAdvisories'], 1)
        self.assertEqual(row, before)

    def test_new_advisory_and_package_still_block(self):
        row, policy = self.fixture()
        for changed in ({**row, 'id': 'NEW'}, {**row, 'name': 'new-package'}, {**row, 'version': '2.0.0'}):
            result = IMAGE.review([row, changed], policy, 'reviewed-source')
            self.assertEqual(result['status'], 'FAILED')
            self.assertEqual(len(result['blocking']), 1)

    def test_missing_current_findings_or_empty_report_cannot_be_reviewed(self):
        row, policy = self.fixture()
        result = IMAGE.review([], policy, 'reviewed-source')
        self.assertEqual(result['status'], 'FAILED')
        self.assertEqual(result['missingExpectedAdvisories'], 1)
        self.assertEqual(result['blockingAdvisories'], 1)
        self.assertEqual(result['missing'][0]['id'], 'KNOWN')
        policy['dispositions'][0]['advisories'].append('SECOND-CURRENT')
        result = IMAGE.review([row], policy, 'reviewed-source')
        self.assertEqual(result['status'], 'FAILED')
        self.assertEqual(result['reviewedAdvisories'], 1)
        self.assertEqual(result['missing'][0]['id'], 'SECOND-CURRENT')

    def test_source_drift_or_no_evidence_cannot_be_waived(self):
        row, policy = self.fixture()
        with self.assertRaisesRegex(ValueError, 'SOURCE_DRIFT'):
            IMAGE.review([row], policy, 'new-source')
        policy['dispositions'][0]['evidence'] = []
        self.assertEqual(IMAGE.review([row], policy, 'reviewed-source')['status'], 'FAILED')

    def test_native_scan_error_is_not_reachability_acceptance(self):
        with self.assertRaisesRegex(ValueError, 'NATIVE_SCAN_ERROR'):
            IMAGE.findings({'results': []}, 1)
        report = {'image_metadata': {'layer_metadata': []}, 'results': [{'packages': []}]}
        with self.assertRaisesRegex(ValueError, 'NATIVE_EXIT_MISMATCH'):
            IMAGE.findings(report, 1)

    def test_unknown_image_license_never_becomes_project_license(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            bom = {'components': [{'name': 'unknown', 'version': '1.0', 'type': 'library'}]}
            reviewed, result = IMAGE.license_materials(bom, path, path / 'missing.jar', path / 'LICENSE')
            self.assertEqual(result['status'], 'INCOMPLETE')
            self.assertNotIn('licenses', reviewed['components'][0])
            self.assertFalse(result['binaryRedistributionObligationsCompleted'])

    def test_copyright_hash_is_not_a_license_grant(self):
        component = {'licenses': [{'license': {'name': 'sha256:' + 'a' * 64}}]}
        self.assertFalse(IMAGE.has_license_terms(component))
        self.assertTrue(IMAGE.has_license_terms({'licenses': [{'license': {'id': 'Apache-2.0'}}]}))

    def test_nginx_source_and_route_drift_changes_review_binding(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            for name in ('.dockerignore', 'infra/frontend/Dockerfile', 'compose.channel.yaml',
                         'contracts/openapi/quality-platform-api.yaml'):
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('unit fixture', encoding='utf-8')
            route = source / 'infra/gateway/customer-portal-nginx.conf'
            route.parent.mkdir(parents=True)
            route.write_text('location /portal/ {}\n', encoding='utf-8')
            before = NGINX.source_digest(source)
            route.write_text('location /portal/ { image_filter resize 10 10; }\n', encoding='utf-8')
            self.assertNotEqual(before, NGINX.source_digest(source))
            script = source / 'apps/customer-portal/src/page.tsx'
            script.parent.mkdir(parents=True)
            script.write_text('changed asset source', encoding='utf-8')
            self.assertNotEqual(before, NGINX.source_digest(source))

    def test_nginx_all_copied_build_inputs_affect_binding_but_runtime_state_does_not(self):
        names = ('.dockerignore', 'infra/frontend/Dockerfile', 'compose.channel.yaml',
                 'contracts/openapi/quality-platform-api.yaml', 'apps/customer-portal/index.html',
                 'apps/customer-portal/vite.config.ts', 'apps/operations-console/tsconfig.json',
                 'apps/quality-case-portal/public/favicon.svg', 'packages/bank-domain-types/src/index.ts')
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary)
            for name in names:
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('original fixture', encoding='utf-8')
            before = NGINX.source_digest(source)
            for name in names:
                with self.subTest(name=name):
                    path = source / name
                    path.write_text('changed fixture', encoding='utf-8')
                    self.assertNotEqual(before, NGINX.source_digest(source))
                    path.write_text('original fixture', encoding='utf-8')
            for name in ('apps/customer-portal/.env.local', 'apps/customer-portal/node_modules/fixture.js',
                         'apps/customer-portal/dist/index.html'):
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('excluded fixture', encoding='utf-8')
            self.assertEqual(before, NGINX.source_digest(source))


class FineractPatchTest(unittest.TestCase):
    def test_actual_tomcat_el_bundle_name_is_not_maven_artifact_name(self):
        with tempfile.TemporaryDirectory() as temporary:
            jar = Path(temporary) / 'el.jar'
            with zipfile.ZipFile(jar, 'w') as archive:
                archive.writestr('META-INF/MANIFEST.MF', 'Bundle-Name: tomcat-embed-jasper-el\nBundle-Version: 10.1.61\n')
            with zipfile.ZipFile(jar) as archive:
                result = FINERACT.coordinates(archive, 'tomcat-embed-el', '10.1.61')
                self.assertEqual(result['groupId'], 'org.apache.tomcat.embed')
                with self.assertRaisesRegex(ValueError, 'FINERACT_TOMCAT_MANIFEST_MISMATCH'):
                    FINERACT.coordinates(archive, 'tomcat-embed-el', '10.1.55')

    def test_business_and_migration_bytes_must_be_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary)
            migration = app / 'resources/db/changelog.xml'
            migration.parent.mkdir(parents=True)
            migration.write_text('original accounting schema')
            manifest = {'preserved': {'resources/db/changelog.xml': FINERACT.sha(migration)}, 'replacements': []}
            (app / 'jib-classpath-file').write_text('/app/resources:/app/classes')
            (app / 'rf065-dependency-patch-manifest.json').write_text('{}')
            self.assertEqual(FINERACT.verify(app, manifest)['status'], 'PRESERVED')
            migration.write_text('changed accounting schema')
            with self.assertRaisesRegex(ValueError, 'FINERACT_BUSINESS_PAYLOAD_CHANGED'):
                FINERACT.verify(app, manifest)

    def test_old_dependency_must_not_remain(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary)
            (app / 'libs').mkdir()
            (app / 'jib-classpath-file').write_text('/app/libs/old.jar')
            (app / 'libs/new.jar').write_bytes(b'new')
            (app / 'rf065-dependency-patch-manifest.json').write_text('{}')
            manifest = {'preserved': {}, 'replacements': [{'original': 'old.jar', 'target': 'new.jar', 'targetSha256': FINERACT.sha(app / 'libs/new.jar')}]}
            with self.assertRaisesRegex(ValueError, 'FINERACT_OLD_DEPENDENCY_RETAINED'):
                FINERACT.verify(app, manifest)

    def test_unknown_application_file_cannot_hide_behind_preservation_count(self):
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary)
            (app / 'unregistered-business.jar').write_bytes(b'changed business')
            with self.assertRaisesRegex(ValueError, 'FINERACT_APP_FILE_SET_CHANGED'):
                FINERACT.verify(app, {'preserved': {}, 'replacements': []})


class PostgresAptPatchTest(unittest.TestCase):
    def module(self):
        spec = importlib.util.spec_from_file_location('postgres_apt_patch', Path(__file__).resolve().parents[1] / 'deploy/prepare-postgres-apt-patch.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_modified_debian_package_rejected_before_build_output(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'banksystem-rf065'
            downloads = root / 'downloads'
            downloads.mkdir(parents=True)
            (downloads / 'apt_3.0.4_amd64.deb').write_bytes(b'not the official Debian package')
            with self.assertRaisesRegex(ValueError, 'APT_PUBLISHER_PACKAGE_MISMATCH'):
                module.prepare(root / 'gosu-context', downloads, root / 'output')
            self.assertFalse((root / 'output').exists())

    def test_unowned_output_is_rejected_without_reading_inputs(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(ValueError, 'APT_OWNED_OUTPUT_REQUIRED'):
                module.prepare(root / 'missing-context', root / 'missing-packages', root / 'output')
            self.assertFalse((root / 'output').exists())

    def test_same_size_package_tampering_still_rejected(self):
        module = self.module()
        # SHA256("abc") is the independent fixed publisher-fixture value.
        publisher = {'package.deb': {'size': 3, 'sha256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'}}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'banksystem-rf065'
            downloads = root / 'downloads'
            downloads.mkdir(parents=True)
            (downloads / 'package.deb').write_bytes(b'abd')
            with patch.object(module, 'PACKAGES', publisher):
                with self.assertRaisesRegex(ValueError, 'APT_PUBLISHER_PACKAGE_MISMATCH'):
                    module.prepare(root / 'missing-context', downloads, root / 'output')
            self.assertFalse((root / 'output').exists())


class GosuPatchTest(unittest.TestCase):
    def test_compiler_preflight_uses_controlled_environment_and_rejects_wrong_version(self):
        for version in ('1.26.8', '1.26.9'):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary) / 'banksystem-rf065'
                with patch.object(GOSU_PATCH.subprocess, 'run') as command:
                    command.return_value.stdout = 'go version go' + version + ' windows/amd64'
                    with self.assertRaisesRegex(ValueError, 'GOSU_COMPILER_VERSION_CHANGED'):
                        GOSU_PATCH.prepare(root / 'archive', Path('go'), root / 'output')
                    env = command.call_args.kwargs['env']
                    self.assertEqual(env['GOENV'], 'off')
                    self.assertEqual(env['GOTOOLCHAIN'], 'local')
                    self.assertEqual(env['GOWORK'], 'off')
                    self.assertEqual(env['GOAMD64'], 'v1')
                self.assertFalse((root / 'output').exists())

    def test_changed_public_archive_rejected_before_creating_build_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'source.tar.gz'
            archive.write_bytes(b'not the pinned public source')
            with self.assertRaisesRegex(ValueError, 'GOSU_PUBLIC_SOURCE_CHECKSUM_MISMATCH'):
                GOSU_PATCH.prepare_source(archive, root / 'output')
            self.assertFalse((root / 'output').exists())

    def test_patch_version_is_explicit_without_altering_user_switch_code(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            (home / 'version.go').write_text('package main\nconst Version = "1.19"\n')
            (home / 'setup-user.go').write_text('preserved user-switch fixture')
            original = {'setup-user.go': GOSU_PATCH.sha(home / 'setup-user.go')}
            GOSU_PATCH.patch_version(home)
            self.assertIn(GOSU_PATCH.PATCH_VERSION, (home / 'version.go').read_text())
            GOSU_PATCH.verify_preserved(home, original)
            (home / 'setup-user.go').write_text('changed user switching')
            with self.assertRaisesRegex(ValueError, 'GOSU_PROGRAM_SOURCE_CHANGED'):
                GOSU_PATCH.verify_preserved(home, original)


class GosuSymbolTest(unittest.TestCase):
    def record(self, **fields):
        return {'id': 'GO-SYNTHETIC', 'affected': [{'package': {'name': 'stdlib'},
                'ecosystem_specific': {'imports': [{'path': 'os', **fields}]}}]}

    def assess(self, records, findings=()):
        return GOSU.assess({'id': 'GO-SYNTHETIC'}, {'name': 'stdlib'}, records, findings,
                           {'goos': 'linux', 'goarch': 'amd64', 'pkgSymbols': ['fixture.symbol']})

    def test_missing_database_coverage_never_means_uncalled(self):
        self.assertEqual(self.assess([])['status'], 'UNDER_INVESTIGATION')

    def test_absent_affected_symbols_can_be_reviewed_but_symbol_hits_block(self):
        records = [self.record(symbols=['Root.Mkdir'])]
        self.assertEqual(self.assess(records)['reasonCode'], 'VULNERABLE_SYMBOLS_NOT_PRESENT')
        hit = {'osv': 'GO-SYNTHETIC', 'trace': [{'function': 'Root.Mkdir'}]}
        self.assertEqual(self.assess(records, [hit])['status'], 'AFFECTED')

    def test_module_only_advisory_without_symbol_metadata_stays_unreviewed(self):
        self.assertEqual(self.assess([self.record()])['status'], 'UNDER_INVESTIGATION')

    def test_identical_stream_records_are_one_advisory_but_conflicts_block(self):
        record = self.record(symbols=['Root.Mkdir'])
        self.assertEqual(self.assess([record, copy.deepcopy(record)])['status'], 'NOT_AFFECTED')
        conflict = self.record(symbols=['DifferentFunction'])
        self.assertEqual(self.assess([record, conflict])['reasonCode'], 'GO_DATABASE_COVERAGE_CONFLICT')

    def test_windows_only_advisory_is_not_a_linux_symbol_finding(self):
        self.assertEqual(self.assess([self.record(goos=['windows'], symbols=['Root.Mkdir'])])['reasonCode'],
                         'TARGET_PLATFORM_NOT_AFFECTED')

    def test_changed_binary_or_target_platform_cannot_be_reviewed(self):
        with self.assertRaisesRegex(ValueError, 'GOSU_BINARY_IDENTITY_CHANGED'):
            GOSU.validate([], [], '0' * 64)
        extracted = [{'name': 'govulncheck-extract', 'version': '0.1.0'},
                     {'path': 'github.com/tianon/gosu', 'goVersion': 'go1.24.6',
                      'goos': 'windows', 'goarch': 'amd64', 'pkgSymbols': []}]
        with self.assertRaisesRegex(ValueError, 'GOSU_TARGET_OR_SYMBOL_COVERAGE_CHANGED'):
            GOSU.validate([], extracted, GOSU.GOSU_SHA256)

    def patched_fixture(self):
        target = {'path': 'github.com/tianon/gosu', 'goVersion': 'go1.26.9',
                  'goos': 'linux', 'goarch': 'amd64', 'pkgSymbols': ['main.main']}
        extracted = [{'name': 'govulncheck-extract', 'version': '0.1.0'}, target]
        config = {'scanner_name': 'govulncheck', 'scanner_version': 'v1.9.0',
                  'scan_mode': 'binary', 'scan_level': 'symbol', 'db': 'https://vuln.go.dev'}
        sbom = {'go_version': 'go1.26.9', 'modules': [
            {'path': name, 'version': version} for name, version in GOSU.PROFILES[GOSU.PATCH_SHA256].items()]}
        return [{'config': config}, {'SBOM': sbom}], extracted

    def test_patched_binary_uses_its_exact_module_profile_not_the_old_profile(self):
        messages, extracted = self.patched_fixture()
        target, modules, _ = GOSU.validate(messages, extracted, GOSU.PATCH_SHA256)
        self.assertEqual(target['goVersion'], 'go1.26.9')
        self.assertEqual(modules['github.com/moby/sys/user'], '0.4.1')
        with self.assertRaisesRegex(ValueError, 'GOSU_TARGET_OR_SYMBOL_COVERAGE_CHANGED'):
            GOSU.validate(messages, extracted, GOSU.GOSU_SHA256)
        messages[1]['SBOM']['modules'][1]['version'] = '0.1.0'
        with self.assertRaisesRegex(ValueError, 'GOSU_ANALYSIS_MODULES_CHANGED'):
            GOSU.validate(messages, extracted, GOSU.PATCH_SHA256)

    def test_stripped_binary_cannot_claim_absent_symbols_but_can_prove_platform_exclusion(self):
        messages, extracted = self.patched_fixture()
        extracted[1]['pkgSymbols'] = []
        del extracted[1]['pkgSymbols']
        target, _, _ = GOSU.validate(messages, extracted, GOSU.PATCH_SHA256)
        def assess(record):
            return GOSU.assess({'id': 'GO-SYNTHETIC'}, {'name': 'stdlib'}, [record], [], target)
        self.assertEqual(assess(self.record(symbols=['Root.Mkdir']))['reasonCode'], 'GO_SYMBOL_COVERAGE_INCOMPLETE')
        self.assertEqual(assess(self.record(goos=['windows'], symbols=['Root.Mkdir']))['reasonCode'],
                         'TARGET_PLATFORM_NOT_AFFECTED')
        messages, extracted = self.patched_fixture()
        messages[0]['config']['scan_level'] = 'module'
        with self.assertRaisesRegex(ValueError, 'GOSU_ANALYSIS_MODE_CHANGED'):
            GOSU.validate(messages, extracted, GOSU.PATCH_SHA256)


class PostgresExactReachabilityTest(unittest.TestCase):
    def policy(self):
        return json.loads(FOUNDATIONS.POLICY.read_text(encoding='utf-8'))['postgresReview']

    def rows(self):
        ids = [('glibc', '2.41-12+deb13u4', 'Debian:13', 'DEBIAN-CVE-2026-97399'),
               ('glibc', '2.41-12+deb13u4', 'Debian:13', 'DEBIAN-CVE-2026-89092'),
               ('libxml2', '2.12.7+dfsg+really2.9.14-2.1+deb13u3', 'Debian:13', 'DEBIAN-CVE-2026-11979'),
               ('systemd', '257.13-1~deb13u1', 'Debian:13', 'DEBIAN-CVE-2026-40228'),
               ('systemd', '257.13-1~deb13u1', 'Debian:13', 'DEBIAN-CVE-2026-16742'),
               ('apt', '3.0.4', 'Debian:13', 'DEBIAN-CVE-2011-3374'),
               ('systemd', '257.13-1~deb13u1', 'Debian:13', 'DEBIAN-CVE-2026-15059'),
               ('sqlite3', '3.46.1-7+deb13u2', 'Debian:13', 'DEBIAN-CVE-2026-119586'),
               ('sqlite3', '3.46.1-7+deb13u2', 'Debian:13', 'DEBIAN-CVE-2026-39113'),
               ('sqlite3', '3.46.1-7+deb13u2', 'Debian:13', 'DEBIAN-CVE-2025-70873'),
               ('util-linux', '1:2.41.5-0+deb13u1', 'Debian:13', 'DEBIAN-CVE-2022-0563'),
               ('util-linux', '2.41.5-0+deb13u1', 'Debian:13', 'DEBIAN-CVE-2022-0563'),
               ('util-linux', '1:4.16.0-2+really2.41.5-0+deb13u1', 'Debian:13', 'DEBIAN-CVE-2022-0563'),
               ('bzip2', '1.0.8-6', 'Debian:13', 'DEBIAN-CVE-2026-42250'),
               ('gnupg2', '2.4.7-21+deb13u1', 'Debian:13', 'DEBIAN-CVE-2026-24882'),
               ('gnupg2', '2.4.7-21+deb13u1+b5', 'Debian:13', 'DEBIAN-CVE-2026-24882'),
               ('golang.org/x/sys', '0.1.0', 'Go', 'GO-2026-5024')]
        return [dict(zip(('name', 'version', 'ecosystem', 'id'), values), severity=[{'type': 'fixture', 'score': 'HIGH'}]) for values in ids]

    def facts(self):
        return {path: 'ABSENT' for path in ('/usr/sbin/nscd', '/usr/bin/xmlcatalog',
                '/usr/lib/systemd/systemd-journald', '/usr/lib/systemd/systemd-homed',
                '/usr/bin/sqlite3', '/usr/local/bin/sqlite3', '/usr/bin/apt-key', '/usr/sbin/apt-key',
                '/usr/lib/systemd/systemd-oomd', '/usr/bin/systemd-oomd',
                '/usr/lib/x86_64-linux-gnu/sqlite3/zipfile.so', '/usr/lib/sqlite3/zipfile.so',
                '/usr/bin/bzip2recover', '/bin/bzip2recover',
                '/usr/lib/gnupg/tpm2daemon', '/usr/lib/gnupg2/tpm2daemon')} | {
                    'chfnProvider': 'passwd', 'chshProvider': 'passwd'}

    def image(self):
        return {'Id': self.policy()['imageId'],
                'Architecture': 'amd64', 'Os': 'linux'}

    def test_fourteen_exact_conditions_preserve_native_severity_and_leave_other_findings_blocking(self):
        rows = self.rows() + [{'name': 'glibc', 'version': '2.41-12+deb13u4', 'ecosystem': 'Debian:13',
                               'id': 'DEBIAN-CVE-2026-18374', 'severity': ['native-original']}]
        result = FOUNDATIONS.postgres_review(rows, self.image(), self.facts(), self.policy())
        self.assertEqual(result['reviewedAdvisories'], 14)
        self.assertEqual(result['blockingAdvisories'], 1)
        self.assertEqual(result['status'], 'FAILED')
        self.assertEqual(result['blocking'][0]['severity'], ['native-original'])

    def test_absent_sqlite_shell_does_not_exclude_sqlite_library_or_disputed_zlib_findings(self):
        unreviewed = [
            {'name': 'sqlite3', 'version': '3.46.1-7+deb13u2', 'ecosystem': 'Debian:13',
             'id': 'DEBIAN-CVE-2026-119371', 'severity': ['native-sqlite']},
            {'name': 'zlib', 'version': '1:1.3.dfsg+really1.3.1-1+b1', 'ecosystem': 'Debian:13',
             'id': 'DEBIAN-CVE-2026-85091', 'severity': ['native-zlib']}]
        result = FOUNDATIONS.postgres_review(self.rows() + unreviewed, self.image(), self.facts(), self.policy())
        self.assertEqual((result['reviewedAdvisories'], result['blockingAdvisories']), (14, 2))
        self.assertEqual({row['id'] for row in result['blocking']}, {row['id'] for row in unreviewed})

    def test_wrong_image_architecture_or_missing_probe_cannot_reuse_the_review(self):
        for field, value in (('Id', 'sha256:' + 'a' * 64), ('Architecture', 'arm64'), ('Os', 'windows')):
            image = {**self.image(), field: value}
            with self.subTest(field=field), self.assertRaises(ValueError):
                FOUNDATIONS.postgres_review(self.rows(), image, self.facts(), self.policy())
        for changed in [{}, *({**self.facts(), path: 'PRESENT'} for path in self.facts())]:
            with self.assertRaises(ValueError):
                FOUNDATIONS.postgres_review(self.rows(), self.image(), changed, self.policy())

    def test_missing_expected_advisory_or_changed_package_version_does_not_get_full_review(self):
        for rows in (self.rows()[:-1], [{**row, 'version': 'unexpected'} for row in self.rows()]):
            result = FOUNDATIONS.postgres_review(rows, self.image(), self.facts(), self.policy())
            self.assertEqual(result['status'], 'FAILED')
            self.assertGreater(result['blockingAdvisories'], 0)

    def test_feature_probe_is_readonly_offline_and_uses_tmpfs_instead_of_a_persistent_database(self):
        with patch.object(FOUNDATIONS.subprocess, 'run') as run:
            run.return_value.stdout = ''.join(f'{key}={value}\n' for key, value in self.facts().items())
            facts = FOUNDATIONS.postgres_features(self.image()['Id'])
        self.assertEqual(facts, self.facts())
        command = run.call_args.args[0]
        self.assertEqual(command[:6], ['docker', 'run', '--rm', '--read-only', '--network=none', '--tmpfs'])
        self.assertIn('/var/lib/postgresql', command)
        self.assertIn(self.image()['Id'], command)
        self.assertEqual(command[-2], '-c')
        for expected_path in self.facts():
            self.assertIn(expected_path, command[-1])
        self.assertNotIn('pg_ctl', command[-1])
        self.assertNotIn('/etc/passwd', command[-1])
        self.assertNotIn('/etc/shadow', command[-1])

    def test_absent_oomd_does_not_exclude_shared_journal_or_other_systemd_findings(self):
        unreviewed = [{'name': 'systemd', 'version': '257.13-1~deb13u1', 'ecosystem': 'Debian:13',
                       'id': 'DEBIAN-' + cve, 'severity': ['original-native']}
                      for cve in ('CVE-2013-4392', 'CVE-2023-31437', 'CVE-2023-31438', 'CVE-2023-31439')]
        result = FOUNDATIONS.postgres_review(self.rows() + unreviewed, self.image(), self.facts(), self.policy())
        self.assertEqual((result['reviewedAdvisories'], result['blockingAdvisories']), (14, 4))
        self.assertEqual({row['id'] for row in result['blocking']}, {row['id'] for row in unreviewed})

    def test_sqlite_source_scope_does_not_transfer_to_another_package_version_or_ecosystem(self):
        targets = {'DEBIAN-CVE-2026-39113', 'DEBIAN-CVE-2025-70873'}
        for field, value in (('version', '3.53.0-1'), ('ecosystem', 'Debian:14')):
            rows = [{**row, field: value} if row['id'] in targets else row for row in self.rows()]
            result = FOUNDATIONS.postgres_review(rows, self.image(), self.facts(), self.policy())
            self.assertEqual(result['status'], 'FAILED')
            self.assertEqual(result['reviewedAdvisories'], 12)
            self.assertEqual({row['id'] for row in result['blocking']}, targets)
            self.assertEqual({row['id'] for row in result['missing']}, targets)

    def test_unbuilt_zipfile_does_not_exclude_other_sqlite_api_findings(self):
        ids = {'DEBIAN-CVE-2026-119377', 'DEBIAN-CVE-2026-119378', 'DEBIAN-CVE-2021-45346'}
        rows = self.rows() + [{'name': 'sqlite3', 'version': '3.46.1-7+deb13u2', 'ecosystem': 'Debian:13',
                              'id': advisory, 'severity': ['original-api-risk']} for advisory in ids]
        result = FOUNDATIONS.postgres_review(rows, self.image(), self.facts(), self.policy())
        self.assertEqual((result['reviewedAdvisories'], result['blockingAdvisories']), (14, 3))
        self.assertEqual({row['id'] for row in result['blocking']}, ids)
        self.assertTrue(all(row['severity'] == ['original-api-risk'] for row in result['blocking']))

    def test_passwd_provider_does_not_exclude_login_mount_or_nsenter_findings(self):
        ids = {'DEBIAN-' + cve for cve in ('CVE-2026-3184', 'CVE-2026-76642',
               'CVE-2026-78408', 'CVE-2026-78409', 'CVE-2026-78410')}
        rows = self.rows() + [{'name': 'util-linux', 'version': '2.41.5-0+deb13u1',
                              'ecosystem': 'Debian:13', 'id': advisory,
                              'severity': ['original-util-linux-risk']} for advisory in ids]
        result = FOUNDATIONS.postgres_review(rows, self.image(), self.facts(), self.policy())
        self.assertEqual((result['reviewedAdvisories'], result['blockingAdvisories']), (14, 5))
        self.assertEqual({row['id'] for row in result['blocking']}, ids)
        self.assertTrue(all(row['severity'] == ['original-util-linux-risk'] for row in result['blocking']))

    def test_provider_evidence_and_exact_util_linux_mapping_cannot_be_transferred(self):
        for key in ('chfnProvider', 'chshProvider'):
            for facts in ({name: value for name, value in self.facts().items() if name != key},
                          {**self.facts(), key: 'util-linux'}):
                with self.subTest(key=key, facts=facts), self.assertRaisesRegex(ValueError, 'FEATURE_PROOF_DRIFT'):
                    FOUNDATIONS.postgres_review(self.rows(), self.image(), facts, self.policy())
        for field, value in (('version', '2.42.4-1'), ('ecosystem', 'Debian:14')):
            rows = [{**row, field: value} if row['name'] == 'util-linux' else row for row in self.rows()]
            result = FOUNDATIONS.postgres_review(rows, self.image(), self.facts(), self.policy())
            self.assertEqual(result['reviewedAdvisories'], 13)
            self.assertEqual({row['id'] for row in result['blocking']}, {'DEBIAN-CVE-2022-0563'})
            self.assertEqual({row['id'] for row in result['missing']}, {'DEBIAN-CVE-2022-0563'})

    def test_absent_tpm_daemon_does_not_exclude_other_gnupg_or_changed_tool_versions(self):
        others = {'DEBIAN-CVE-2022-3219', 'DEBIAN-CVE-2025-68972',
                  'DEBIAN-CVE-2026-105712', 'DEBIAN-CVE-2026-57062'}
        rows = self.rows() + [{'name': 'gnupg2', 'version': '2.4.7-21+deb13u1',
                              'ecosystem': 'Debian:13', 'id': advisory,
                              'severity': ['original-gnupg-risk']} for advisory in others]
        result = FOUNDATIONS.postgres_review(rows, self.image(), self.facts(), self.policy())
        self.assertEqual((result['reviewedAdvisories'], result['blockingAdvisories']), (14, 4))
        self.assertEqual({row['id'] for row in result['blocking']}, others)
        self.assertTrue(all(row['severity'] == ['original-gnupg-risk'] for row in result['blocking']))
        targets = {'DEBIAN-CVE-2026-42250', 'DEBIAN-CVE-2026-24882'}
        for field, value in (('version', 'unexpected'), ('ecosystem', 'Debian:14')):
            changed = [{**row, field: value} if row['id'] in targets else row for row in self.rows()]
            result = FOUNDATIONS.postgres_review(changed, self.image(), self.facts(), self.policy())
            self.assertEqual(result['reviewedAdvisories'], 12)
            self.assertEqual({row['id'] for row in result['blocking']}, targets)
            self.assertEqual({row['id'] for row in result['missing']}, targets)


class FoundationRuntimeScopeTest(unittest.TestCase):
    def test_default_images_are_not_limited_to_bank_smoke_and_extends_is_inherited(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'postgresql').mkdir()
            (root / 'scripts/deploy').mkdir(parents=True)
            pinned = '@sha256:' + 'a' * 64
            core = {'services': {'postgresql': {'image': 'postgres:18' + pinned},
                                 'web-app': {'image': 'web:1' + pinned, 'profiles': ['admin-tools']}}}
            channel = {'services': {
                'bank-channel-service': {'image': 'local/bank:fixture', 'build': {'context': '.'}},
                'test-support-service': {'extends': {'file': 'compose.channel.yaml', 'service': 'bank-channel-service'}},
                'grafana': {'image': 'grafana/grafana:12.1.0'},
                'mock-clearing-service': {'image': 'local/mock:fixture', 'profiles': ['mock-clearing']}}}
            (root / 'postgresql/docker-compose.isolated.yml').write_text(FOUNDATIONS.yaml.safe_dump(core))
            compose = root / 'compose.channel.yaml'
            compose.write_text(FOUNDATIONS.yaml.safe_dump(channel))
            (root / 'scripts/deploy/prepare-ci-bank.py').write_text(
                "CORE = ('postgresql',)\nCHANNEL = ('bank-channel-service', 'test-support-service')\n")
            result = FOUNDATIONS.runtime_scope(root)
            self.assertEqual((result['defaultServiceCount'], result['defaultImageCount'], result['bankSmokeServiceCount']), (4, 3, 3))
            self.assertEqual(set(result['outsideBankSmoke']), {'grafana'})
            optional = {row['service']: row for row in result['optionalServices']}
            self.assertEqual(set(optional), {'web-app', 'mock-clearing-service'})
            self.assertEqual(optional['web-app']['profiles'], ['admin-tools'])
            self.assertEqual(result['mutableThirdPartyTags'], ['grafana'])
            support = next(row for row in result['services'] if row['service'] == 'test-support-service')
            self.assertTrue(support['builtFromSource'])
            channel['services']['grafana']['image'] += pinned
            compose.write_text(FOUNDATIONS.yaml.safe_dump(channel))
            self.assertEqual(FOUNDATIONS.runtime_scope(root)['mutableThirdPartyTags'], [])

    def test_product_admin_tool_is_opt_in_and_not_a_default_readiness_dependency(self):
        root = Path(__file__).resolve().parents[2]
        scope = FOUNDATIONS.runtime_scope(root)
        self.assertEqual((scope['defaultServiceCount'], scope['defaultImageCount'], scope['bankSmokeServiceCount']), (14, 12, 10))
        self.assertNotIn('web-app', {row['service'] for row in scope['services']})
        web = next(row for row in scope['optionalServices'] if row['service'] == 'web-app')
        self.assertEqual(web['profiles'], ['admin-tools'])
        self.assertFalse(web['inBankSmoke'])
        demo = (root / 'demo.ps1').read_text(encoding='utf-8')
        expected = next(line.strip() for line in demo.splitlines() if line.strip().startswith('$coreExpected ='))
        self.assertEqual(expected, "$coreExpected = @('postgresql', 'activemq', 'fineract-server')")
        restart = (root / 'scripts/demo/verify-rf056-controlled-restart.ps1').read_text(encoding='utf-8')
        self.assertNotIn('mifos-isolated-web-app-1', restart)
        for filename in ('postgresql/docker-compose.isolated.yml', 'compose.channel.yaml'):
            for service in FOUNDATIONS.yaml.safe_load((root / filename).read_text(encoding='utf-8'))['services'].values():
                self.assertNotIn('web-app', service.get('depends_on', {}))

    def test_debian_details_survive_when_summary_is_not_provided(self):
        native = {'results': [{'packages': [{'package': {'name': 'glibc', 'version': '2.41', 'ecosystem': 'Debian:13'},
                   'vulnerabilities': [{'id': 'DEBIAN-SYNTHETIC', 'details': 'specific affected code condition', 'affected': []}]}]}]}
        advisory = FOUNDATIONS.package_inventory(native)[0]['advisories'][0]
        self.assertIsNone(advisory['summary'])
        self.assertEqual(advisory['details'], 'specific affected code condition')


class FoundationVendorTest(unittest.TestCase):
    def nginx_requirement(self):
        return {'major': 1, 'minor': 31, 'minimumPatch': 7,
                'advisories': ['CVE-2026-15176'], 'sources': ['https://nginx.org/en/security_advisories.html']}

    def test_native_zero_does_not_satisfy_the_old_upstream_nginx_vendor_version(self):
        result = FOUNDATIONS.webapp_nginx_gate(['1.31.1-r1'], self.nginx_requirement())
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertEqual(result['reasonCode'], 'NGINX_OSV_VENDOR_COVERAGE_GAP')

    def test_nginx_same_branch_minimum_security_patch_meets_only_vendor_version_gate(self):
        self.assertEqual(FOUNDATIONS.webapp_nginx_gate(['1.31.7-r1'], self.nginx_requirement())['status'], 'PASSED')

    def test_nginx_branch_change_or_missing_version_cannot_satisfy_fixed_subject_gate(self):
        with self.assertRaisesRegex(ValueError, 'WEBAPP_NGINX_BRANCH_CHANGE_REQUIRES_REVIEW'):
            FOUNDATIONS.webapp_nginx_gate(['1.30.6-r1'], self.nginx_requirement())
        with self.assertRaisesRegex(ValueError, 'WEBAPP_NGINX_VERSION_NOT_UNIQUE'):
            FOUNDATIONS.webapp_nginx_gate([], self.nginx_requirement())

    def test_native_review_does_not_override_a_blocked_or_unreviewed_publisher(self):
        for publisher in ('BLOCKED', 'UNDER_INVESTIGATION', 'REVIEWED'):
            with patch.object(NGINX.IMAGE, 'review', return_value={'status': 'REVIEWED'}):
                result = NGINX.review([], {'officialNginxReview': {'status': publisher}}, 'fixture')
            self.assertEqual(result['status'], 'REVIEWED' if publisher == 'REVIEWED' else 'BLOCKED')

    def test_webapp_patch_preserves_fixed_app_and_installs_only_five_signed_local_packages(self):
        text = (Path(__file__).resolve().parents[1] / 'deploy/webapp-foundation.Dockerfile').read_text()
        self.assertTrue(text.startswith('FROM openmf/web-app:dev@sha256:d071bea02ba0b83b0a9958f8ea651b7cc50aa86dd18f71ab304955e76bbd4b03\n'))
        self.assertIn('RUN --network=none', text)
        self.assertIn('sha256sum -c -', text)
        self.assertIn('apk add --no-network --upgrade', text)
        self.assertIn('ENV NGINX_VERSION=1.31.7', text)
        self.assertIn('COPY --from=openmf/web-app:dev@sha256:d071bea02ba0b83b0a9958f8ea651b7cc50aa86dd18f71ab304955e76bbd4b03 /usr/share/nginx/html/ /usr/share/nginx/html/', text)
        for filename in ('libcrypto3-3.5.9-r0.apk', 'libssl3-3.5.9-r0.apk', 'pcre2-10.49-r0.apk', 'zlib-1.3.2-r1.apk', 'nginx-1.31.7-r1.apk'):
            self.assertEqual(text.count(filename), 2)
        for forbidden in ('allow-untrusted', 'apk upgrade', 'ENTRYPOINT', 'CMD', 'apk update'):
            self.assertNotIn(forbidden, text)

    def test_frontend_runtime_pin_uses_the_same_stable_security_branch(self):
        text = (Path(__file__).resolve().parents[2] / 'infra/frontend/Dockerfile').read_text()
        self.assertIn('FROM nginx:1.30.6-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5\n', text)
        self.assertIn('FROM node:20.20.2-alpine3.23@sha256:', text)

    def test_supported_archive_preserves_required_upstream_and_excludes_only_optional_shiro(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'broker.tar.gz'
            payloads = {'lib/activemq-broker-6.3.3.jar': b'fixture broker',
                        'lib/jackson-core-2.22.4.jar': b'fixture upstream dependency',
                        'conf/jetty-spring.properties': b'jetty.http.host=127.0.0.1\n',
                        'LICENSE': b'fixture license', 'NOTICE': b'fixture notice',
                        'lib/activemq-jaas-6.3.3.jar': b'required JAAS authentication',
                        'lib/optional/activemq-shiro-6.3.3.jar': b'optional vulnerable plugin',
                        'lib/optional/shiro-core-2.2.1.jar': b'optional vulnerable core',
                        'lib/optional/shiro-spring-2.2.1.jar': b'optional integration',
                        'lib/optional/not-shiro-test.jar': b'unrelated optional module'}
            with tarfile.open(archive, 'w:gz') as bundle:
                for name, payload in payloads.items():
                    item = tarfile.TarInfo('apache-activemq-6.3.3/' + name)
                    item.size = len(payload)
                    bundle.addfile(item, io.BytesIO(payload))
            entrypoint = root / 'entrypoint.sh'
            entrypoint.write_bytes(b'#!/bin/bash\nexec "$@"\n')
            with patch.object(FOUNDATION_PATCH, 'MQ_SHA512', hashlib.sha512(archive.read_bytes()).hexdigest()), \
                 patch.object(FOUNDATION_PATCH, 'verify_noble_packages', return_value=[]):
                FOUNDATION_PATCH.prepare(archive, entrypoint, root / 'context', root)
            result = json.loads((root / 'context/foundation-patch-manifest.json').read_text())
            self.assertEqual(result['dependencyPatches'], [])
            self.assertEqual(result['excludedRuntimePackages'], ['gnupg', 'gpg', 'keyboxd', 'libsqlite3-0'])
            self.assertIn('/6.3.3/apache-activemq-6.3.3-bin.tar.gz', result['archiveSource'])
            excluded = {'lib/optional/activemq-shiro-6.3.3.jar', 'lib/optional/shiro-core-2.2.1.jar',
                        'lib/optional/shiro-spring-2.2.1.jar'}
            self.assertEqual({row['path'] for row in result['excludedOptionalArtifacts']}, excluded)
            for name, payload in payloads.items():
                target = root / 'context/activemq/apache-activemq-6.3.3' / name
                if name in excluded:
                    self.assertFalse(target.exists())
                    row = next(r for r in result['excludedOptionalArtifacts'] if r['path'] == name)
                    self.assertEqual(row['sha256'], hashlib.sha256(payload).hexdigest())
                else:
                    self.assertEqual(target.read_bytes(), payload)
            self.assertEqual(result['releaseDecision'], 'NO_GO')

    def test_supported_candidate_never_uses_the_inactive_line_or_old_jackson_patch(self):
        text = (Path(__file__).resolve().parents[1] / 'deploy/prepare-ci-foundation-patches.py').read_text()
        dockerfile = (Path(__file__).resolve().parents[1] / 'deploy/activemq-foundation.Dockerfile').read_text()
        self.assertIn('COPY apache-activemq-6.3.3/', dockerfile)
        self.assertNotIn('apache-activemq-6.2.10/', dockerfile)
        self.assertNotIn('patch_jackson', text)
        self.assertNotIn('--jackson-downloads', text)
        self.assertEqual(FOUNDATION_PATCH.MQ_SHA512, '0dda456dfc6b0701f61f66076011c6197863697a952c3b3128b0d3809f746b49e1a04c44e14d7ae89055ed4cec35a84fd24561d496452625540bab634f26b182')

    def test_altered_broker_archive_rejected_before_extract_or_context_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'broker.tar.gz'
            archive.write_bytes(b'not the approved Apache archive')
            with self.assertRaisesRegex(ValueError, 'ACTIVEMQ_PUBLISHER_ARCHIVE_CHECKSUM_MISMATCH'):
                FOUNDATION_PATCH.prepare(archive, root / 'entrypoint.sh', root / 'context', root / 'noble')
            self.assertFalse((root / 'context').exists())

    def test_mq_noble_packages_require_the_two_exact_publisher_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            packages = {}
            for filename, expected in FOUNDATION_PATCH.NOBLE_PACKAGES.items():
                payload = ('CI-only package ' + filename).encode()
                (root / filename).write_bytes(payload)
                packages[filename] = {**expected, 'size': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
            with patch.dict(FOUNDATION_PATCH.NOBLE_PACKAGES, packages, clear=True):
                rows = FOUNDATION_PATCH.verify_noble_packages(root)
            self.assertEqual({row['filename'] for row in rows}, set(packages))
            self.assertTrue(all(row['url'].startswith('https://security.ubuntu.com/ubuntu/pool/main/') for row in rows))

    def test_mq_noble_corruption_or_missing_input_cannot_be_used(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for filename, expected in FOUNDATION_PATCH.NOBLE_PACKAGES.items():
                (root / filename).write_bytes(b'x' * expected['size'])
            with self.assertRaisesRegex(ValueError, 'MQ_NOBLE_PUBLISHER_PACKAGE_MISMATCH'):
                FOUNDATION_PATCH.verify_noble_packages(root)
            (root / next(iter(FOUNDATION_PATCH.NOBLE_PACKAGES))).unlink()
            with self.assertRaises(FileNotFoundError):
                FOUNDATION_PATCH.verify_noble_packages(root)

    def test_mq_noble_manifest_and_offline_dockerfile_cover_the_observed_security_updates(self):
        text = (Path(__file__).resolve().parents[1] / 'deploy/activemq-foundation.Dockerfile').read_text()
        expected = {
            'libfreetype6_2.13.2+dfsg-1ubuntu0.2_amd64.deb',
            'libpng16-16t64_1.6.43-5ubuntu0.7_amd64.deb',
            'apt_2.8.4ubuntu0.1_amd64.deb', 'libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb',
            'ca-certificates_20260816ubuntu0.24.04.2_all.deb',
            'curl_8.5.0-2ubuntu10.16_amd64.deb', 'libcurl4t64_8.5.0-2ubuntu10.16_amd64.deb',
            'libbrotli1_1.1.0-2ubuntu0.1_amd64.deb',
            'liblzma5_5.6.1+really5.4.5-1ubuntu0.4_amd64.deb',
            'libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb', 'zlib1g_1.3.dfsg-3.1ubuntu2.3_amd64.deb',
        }
        self.assertEqual(set(FOUNDATION_PATCH.NOBLE_PACKAGES), expected)
        runtime = {'apt_2.8.4ubuntu0.1_amd64.deb', 'libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb',
                   'libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb',
                   'ca-certificates_20260816ubuntu0.24.04.2_all.deb'}
        self.assertEqual(set(re.findall(r'^COPY packages/(\S+) /tmp/rf065-mq-packages/$', text, re.M)), runtime)
        for filename in runtime:
            self.assertIn('/tmp/rf065-mq-packages/' + filename, text)
        for filename in expected - runtime:
            self.assertNotIn(filename, text)
        self.assertIn('FROM eclipse-temurin:21.0.13_9-jre-noble@sha256:0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f', text)
        self.assertIn('RUN --network=none', text)
        self.assertIn('DEBIAN_FRONTEND=noninteractive dpkg -i', text)
        self.assertIn('test ! -d /run/systemd/system', text)
        self.assertNotIn('keytool -delete', text)
        self.assertNotIn('keytool -import', text)
        self.assertIn('dpkg --audit', text)
        self.assertNotIn('apt-get', text)
        self.assertNotRegex(text, r'(?:^RUN\s+|&&\s+)curl\s')

    def test_ca_jks_resync_uses_the_exact_publisher_patch_without_adding_java_ca_packages(self):
        filename = 'ca-certificates_20260816ubuntu0.24.04.2_all.deb'
        self.assertEqual(FOUNDATION_PATCH.NOBLE_PACKAGES[filename], {
            'size': 140064,
            'sha256': 'f9fbacd417b515450b831032cc39d18059e9874e67525679a43c16071dabf9a0',
            'path': 'c/ca-certificates/', 'advisory': 'USN-9001-1'})
        self.assertNotIn('ca-certificates_20260816ubuntu0.24.04.1_all.deb', FOUNDATION_PATCH.NOBLE_PACKAGES)
        self.assertFalse(any(name.startswith('ca-certificates-java_') for name in FOUNDATION_PATCH.NOBLE_PACKAGES))

    def test_mq_removes_only_the_four_observed_unused_sqlite_consumers(self):
        text = (Path(__file__).resolve().parents[1] / 'deploy/activemq-foundation.Dockerfile').read_text()
        commands = re.findall(r'&& dpkg --remove ([^\\\n]+)', text)
        self.assertEqual(len(commands), 1)
        self.assertEqual(commands[0].split(), ['gnupg', 'gpg', 'keyboxd', 'libsqlite3-0'])
        self.assertNotIn('--force', text)
        self.assertNotIn('--purge', text)
        self.assertNotIn('autoremove', text)
        self.assertNotRegex(text, r'(?:rm|unlink)\s')
        self.assertIn('&& dpkg --audit', text)
        self.assertIn('RUN --network=none', text)

    def test_channel_client_fixes_observed_openwire_allocation_advisories(self):
        root = Path(__file__).resolve().parents[2]
        pom = (root / 'services/bank-channel-service/pom.xml').read_text()
        self.assertIn('<activemq.version>6.2.10</activemq.version>', pom)
        self.assertIn('<java.version>21</java.version>', pom)
        self.assertNotIn('<artifactId>activemq-all</artifactId>', pom)

    def test_channel_build_fetches_exact_reviewed_noble_packages_without_host_preparation(self):
        root = Path(__file__).resolve().parents[2]
        text = (root / 'services/bank-channel-service/Dockerfile').read_text()
        rows = re.findall(r'^ADD --checksum=sha256:([0-9a-f]{64}) (https://\S+) (/tmp/rf065-channel-packages/\S+)$', text, re.M)
        still_needed = {'apt_2.8.4ubuntu0.1_amd64.deb', 'libapt-pkg6.0t64_2.8.4ubuntu0.1_amd64.deb',
                        'libpcre2-8-0_10.42-4ubuntu2.2_amd64.deb'}
        expected = {filename: (item['sha256'], 'https://security.ubuntu.com/ubuntu/pool/main/' + item['path'] + filename)
                    for filename, item in FOUNDATION_PATCH.NOBLE_PACKAGES.items() if filename in still_needed}
        expected['ca-certificates_20260816ubuntu0.24.04.2_all.deb'] = (
            'f9fbacd417b515450b831032cc39d18059e9874e67525679a43c16071dabf9a0',
            'https://archive.ubuntu.com/ubuntu/pool/main/c/ca-certificates/ca-certificates_20260816ubuntu0.24.04.2_all.deb')
        self.assertEqual({Path(target).name: (checksum, url) for checksum, url, target in rows}, expected)
        self.assertEqual(len(rows), len(expected))
        self.assertIn('RUN --network=none test ! -d /run/systemd/system', text)
        for filename in expected:
            self.assertIn('/tmp/rf065-channel-packages/' + filename, text)
        self.assertIn('FROM eclipse-temurin:21.0.13_9-jdk-noble@sha256:114cabb73033ca4ce7ceec3deb62396bc1b716282bae051ed3c1d82e38fcab2d AS dependencies', text)
        self.assertIn('FROM eclipse-temurin:21.0.13_9-jre-noble@sha256:0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f', text)
        self.assertIn('COPY --from=maven-tools /usr/share/maven /usr/share/maven', text)
        self.assertEqual(text.count('--mount=type=cache,id=banksystem-channel-maven-seeded,target=/root/.m2'), 2)
        self.assertNotIn('keytool -import', text)
        self.assertNotIn('apt-get', text)
        self.assertIn('USER 10001\n', text)
        compose = (root / 'compose.channel.yaml').read_text()
        self.assertIn('context: ./services/bank-channel-service', compose)
        self.assertNotIn('COPY packages/', text)

    def requirement(self):
        return {'major': 18, 'minimumMinor': 6, 'advisories': ['CVE-2026-16239'], 'sources': ['https://www.postgresql.org/docs/release/18.6/']}

    def test_missing_osv_kernel_advisory_does_not_allow_old_pgdg_server(self):
        result = FOUNDATIONS.postgres_vendor_gate(['18.3-1.pgdg13+1'], self.requirement())
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertEqual(result['reasonCode'], 'PGDG_OSV_VENDOR_COVERAGE_GAP')

    def test_same_major_security_patch_meets_vendor_minimum(self):
        self.assertEqual(FOUNDATIONS.postgres_vendor_gate(['18.6-1.pgdg13+1'], self.requirement())['status'], 'PASSED')

    def test_major_change_or_missing_server_version_needs_review(self):
        with self.assertRaisesRegex(ValueError, 'POSTGRES_MAJOR_CHANGE_REQUIRES_REVIEW'):
            FOUNDATIONS.postgres_vendor_gate(['19.0-1.pgdg13+1'], self.requirement())
        with self.assertRaisesRegex(ValueError, 'POSTGRES_SERVER_VERSION_NOT_UNIQUE'):
            FOUNDATIONS.postgres_vendor_gate([], self.requirement())


class ActivemqFeatureReviewTest(unittest.TestCase):
    def policy(self):
        return json.loads(FOUNDATIONS.POLICY.read_text(encoding='utf-8'))['activemqReview']

    def image(self):
        return {'Id': self.policy()['imageId'], 'Architecture': 'amd64', 'Os': 'linux'}

    def facts(self):
        return {path: 'ABSENT' for path in self.policy()['absentPaths']}

    def rows(self):
        return [{'name': row['name'], 'version': row['version'], 'ecosystem': row['ecosystem'], 'id': advisory}
                for row in self.policy()['dispositions'] for advisory in row['advisories']]

    def test_exact_platform_and_missing_features_review_only_two_advisories(self):
        result = FOUNDATIONS.activemq_review(self.rows(), self.image(), self.facts(), self.policy())
        self.assertEqual(result['status'], 'REVIEWED')
        self.assertEqual(result['reviewedAdvisories'], 2)
        self.assertEqual(result['blockingAdvisories'], 0)

    def test_other_gnupg_risks_remain_blocked_and_original_severity_is_retained(self):
        extra = {'name': 'gnupg2', 'version': '2.4.4-2ubuntu17.6', 'ecosystem': 'Ubuntu:24.04',
                 'id': 'UBUNTU-CVE-2026-105712', 'severity': ['original-critical']}
        result = FOUNDATIONS.activemq_review(self.rows() + [extra], self.image(), self.facts(), self.policy())
        self.assertEqual(result['reviewedAdvisories'], 2)
        self.assertEqual(result['blockingAdvisories'], 1)
        self.assertEqual(result['blocking'][0]['severity'], ['original-critical'])

    def test_image_and_platform_drift_cannot_use_linux_dispositions(self):
        for field, value in [('Id', 'sha256:' + '0' * 64), ('Os', 'windows'), ('Architecture', 'arm64')]:
            image = {**self.image(), field: value}
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'ACTIVEMQ_REVIEW_(PLATFORM|IMAGE)_DRIFT'):
                FOUNDATIONS.activemq_review(self.rows(), image, self.facts(), self.policy())

    def test_feature_presence_or_missing_proof_reject_review(self):
        for key in self.facts():
            for action in ('present', 'missing'):
                facts = self.facts()
                if action == 'missing':
                    facts.pop(key)
                else:
                    facts[key] = 'PRESENT'
                with self.subTest(key=key, action=action), self.assertRaisesRegex(ValueError, 'ACTIVEMQ_REVIEW_FEATURE_PROOF_DRIFT'):
                    FOUNDATIONS.activemq_review(self.rows(), self.image(), facts, self.policy())

    def test_version_ecosystem_and_missing_advisory_cannot_be_promoted(self):
        for field, value in [('version', 'other'), ('ecosystem', 'Debian:13')]:
            rows = [{**row, field: value} for row in self.rows()]
            result = FOUNDATIONS.activemq_review(rows, self.image(), self.facts(), self.policy())
            self.assertEqual(result['status'], 'FAILED')
            self.assertEqual(result['reviewedAdvisories'], 0)
            self.assertEqual(result['missingExpectedAdvisories'], 2)

    def test_observed_shadow_mapping_and_gpgtar_are_not_disposed_by_platform_review(self):
        extra = [{'name': 'shadow', 'version': '1:4.13+dfsg1-4ubuntu3.2', 'ecosystem': 'Ubuntu:24.04',
                  'id': 'UBUNTU-CVE-2024-56433'},
                 {'name': 'gnupg2', 'version': '2.4.4-2ubuntu17.6', 'ecosystem': 'Ubuntu:24.04',
                  'id': 'UBUNTU-CVE-2026-105712'}]
        result = FOUNDATIONS.activemq_review(self.rows() + extra, self.image(), self.facts(), self.policy())
        self.assertEqual(result['reviewedAdvisories'], 2)
        self.assertEqual(result['blockingAdvisories'], 2)
        self.assertEqual({row['id'] for row in result['blocking']}, {row['id'] for row in extra})
        result = FOUNDATIONS.activemq_review(self.rows()[1:], self.image(), self.facts(), self.policy())
        self.assertEqual(result['missingExpectedAdvisories'], 1)

    def test_feature_inspector_uses_only_the_exact_readonly_image_and_detects_links(self):
        with patch.object(FOUNDATIONS.subprocess, 'run') as run:
            run.return_value.stdout = ''.join(f'{key}={value}\n' for key, value in self.facts().items())
            result = FOUNDATIONS.activemq_features(self.image()['Id'])
        self.assertEqual(result, self.facts())
        command = run.call_args.args[0]
        self.assertIn('--read-only', command)
        self.assertIn('--network=none', command)
        self.assertIn(self.image()['Id'], command)
        self.assertIn('[ -L "$p" ]', command[-1])
        self.assertNotIn('--mount', command)


if __name__ == '__main__':
    unittest.main()
