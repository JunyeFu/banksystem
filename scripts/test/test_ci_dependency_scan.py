import importlib.util
import copy
import hashlib
import json
from pathlib import Path
import tempfile
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


class GosuPatchTest(unittest.TestCase):
    def test_compiler_preflight_uses_controlled_environment_and_rejects_wrong_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'banksystem-rf065'
            with patch.object(GOSU_PATCH.subprocess, 'run') as command:
                command.return_value.stdout = 'go version go1.26.8 windows/amd64'
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

    def jackson_fixture(self, root):
        home, downloads = root / 'home', root / 'downloads'
        (home / 'lib').mkdir(parents=True)
        downloads.mkdir()
        for artifact in ('jackson-core', 'jackson-databind'):
            (home / 'lib' / (artifact + '-2.22.1.jar')).write_bytes(b'original fixture')
            target = downloads / (artifact + '-2.22.3.jar')
            with zipfile.ZipFile(target, 'w') as jar:
                jar.writestr('META-INF/maven/com.fasterxml.jackson.core/' + artifact + '/pom.properties',
                             'groupId=com.fasterxml.jackson.core\nartifactId=' + artifact + '\nversion=2.22.3\n')
            (downloads / (target.name + '.sha512')).write_text(hashlib.sha512(target.read_bytes()).hexdigest())
        (home / 'lib/jackson-annotations-2.22.jar').write_bytes(b'unchanged annotations')
        return home, downloads

    def test_jackson_same_branch_patch_replaces_both_old_jars_without_changing_annotations(self):
        with tempfile.TemporaryDirectory() as temporary:
            home, downloads = self.jackson_fixture(Path(temporary))
            rows = FOUNDATION_PATCH.patch_jackson(home, downloads)
            self.assertEqual(len(rows), 2)
            self.assertFalse(list((home / 'lib').glob('*-2.22.1.jar')))
            self.assertEqual((home / 'lib/jackson-annotations-2.22.jar').read_bytes(), b'unchanged annotations')

    def test_jackson_invalid_checksum_keeps_original_unpublished_context(self):
        with tempfile.TemporaryDirectory() as temporary:
            home, downloads = self.jackson_fixture(Path(temporary))
            (downloads / 'jackson-core-2.22.3.jar.sha512').write_text('0' * 128)
            with self.assertRaisesRegex(ValueError, 'MQ_JACKSON_PUBLISHER_CHECKSUM_MISMATCH'):
                FOUNDATION_PATCH.patch_jackson(home, downloads)
            self.assertTrue((home / 'lib/jackson-core-2.22.1.jar').is_file())

    def test_altered_broker_archive_rejected_before_extract_or_context_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / 'broker.tar.gz'
            archive.write_bytes(b'not the approved Apache archive')
            with self.assertRaisesRegex(ValueError, 'ACTIVEMQ_PUBLISHER_ARCHIVE_CHECKSUM_MISMATCH'):
                FOUNDATION_PATCH.prepare(archive, root / 'entrypoint.sh', root / 'context', root / 'downloads')
            self.assertFalse((root / 'context').exists())

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


if __name__ == '__main__':
    unittest.main()
