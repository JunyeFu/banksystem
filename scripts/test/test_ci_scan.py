import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('ci_scan', ROOT / 'scripts/deploy/prepare-ci-scan.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ControlledScanTest(unittest.TestCase):
    def scan_fixture(self, output):
        (output / 'app.js').write_text('public source', encoding='utf-8')
        hashes = MODULE.file_hashes(output, ['app.js'])
        (output / 'source-manifest.json').write_text(json.dumps({
            'files': ['app.js'], 'fileHashes': hashes, 'sourceDigest': MODULE.source_digest(hashes)}))

    def test_public_source_filter_excludes_local_state(self):
        for name in ('.env.example', 'apps/customer-portal/src/App.tsx', 'services/bank-channel-service/pom.xml', f'{MODULE.PRODUCT}/runtime/package-lock.json'):
            self.assertTrue(MODULE.source_path(name), name)
        for name in ('.env', 'mariadb/.env', '.env.private', 'postgresql/fineract-db/docker/postgresql.env', '.data/state.json', 'agent/runs/evidence.json', 'node_modules/a.js', f'{MODULE.PRODUCT}/runtime/browsers/chrome.exe', f'{MODULE.PRODUCT}/config/i9.runtime.json'):
            self.assertFalse(MODULE.source_path(name), name)

    def test_tracked_env_is_rejected_before_copy_or_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository = root / 'repository'
            (repository / 'mariadb').mkdir(parents=True)
            (repository / 'mariadb/.env').touch()
            output = root / 'banksystem-rf065/scan'
            with patch.object(MODULE, 'git_paths', side_effect=[['mariadb/.env'], []]), patch.object(MODULE.shutil, 'copyfile') as copy:
                with self.assertRaisesRegex(MODULE.SourceBoundaryError, 'TRACKED_PRIVATE_PATH'):
                    MODULE.prepare(repository, output)
                copy.assert_not_called()
                self.assertFalse(output.exists())

    def test_current_source_is_copied_without_private_untracked_or_generated_content(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository = root / 'repository'
            repository.mkdir()
            (repository / 'app.js').write_text('public source', encoding='utf-8')
            (repository / '.env.example').write_text('PUBLIC_CONFIG=', encoding='utf-8')
            (repository / '.env').touch()
            output = root / 'banksystem-rf065/scan'
            with patch.object(MODULE, 'git_paths', side_effect=[['app.js', '.env.example'], ['.env', 'node_modules/private.js']]):
                source, count = MODULE.prepare(repository, output)
            self.assertEqual(count, 2)
            self.assertFalse((source / '.env').exists())
            self.assertFalse((source / '.git').exists())
            self.assertEqual((source / 'app.js').read_text(), 'public source')

    def test_named_env_is_excluded_before_copy_without_touching_the_original(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repository = root / 'repository'
            repository.mkdir()
            env = repository / 'postgresql.env'
            env.touch()
            (repository / 'app.js').write_text('public source', encoding='utf-8')
            output = root / 'banksystem-rf065/scan'
            copy_file = MODULE.shutil.copyfile
            with patch.object(MODULE, 'git_paths', side_effect=[['postgresql.env', 'app.js'], []]), \
                    patch.object(MODULE.shutil, 'copyfile', wraps=copy_file) as copy:
                source, count = MODULE.prepare(repository, output)
            self.assertEqual(count, 1)
            self.assertTrue(env.exists())
            self.assertFalse((source / 'postgresql.env').exists())
            self.assertEqual([call.args[0].name for call in copy.call_args_list], ['app.js'])

    def test_failed_scan_is_not_success_and_public_report_has_no_secret_or_match(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            self.scan_fixture(output)
            def failed(*args, **kwargs):
                (output / 'gitleaks-redacted.json').write_text(json.dumps([{'RuleID': 'test', 'File': 'app.js', 'StartLine': 1, 'Secret': 'synthetic', 'Match': 'synthetic excerpt'}]))
                self.assertIn('--redact=100', args[0])
                self.assertIn(f'--config={MODULE.POLICY}', args[0])
                self.assertIn(f'--gitleaks-ignore-path={MODULE.IGNORE}', args[0])
                self.assertIn('--ignore-gitleaks-allow', args[0])
                return subprocess.CompletedProcess(args[0], 1)
            with patch.object(MODULE.subprocess, 'run', side_effect=failed):
                code, report = MODULE.scan(output, output, Path('gitleaks'))
            self.assertEqual(code, 1)
            self.assertEqual(report['status'], 'FAILED')
            self.assertNotIn('synthetic', (output / 'secrets.json').read_text())
            self.assertNotIn('Secret', report['findings'][0])
            self.assertNotIn('Match', report['findings'][0])

    def test_scanner_error_does_not_become_zero_findings_pass(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            self.scan_fixture(output)
            with patch.object(MODULE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 2)):
                code, report = MODULE.scan(output, output, Path('gitleaks'))
            self.assertEqual(code, 2)
            self.assertEqual(report['status'], 'ERROR')

    def test_success_exit_with_findings_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            self.scan_fixture(output)
            (output / 'gitleaks-redacted.json').write_text('[{"RuleID":"test"}]')
            with patch.object(MODULE.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
                with self.assertRaisesRegex(MODULE.SourceBoundaryError, 'EXIT_MISMATCH'):
                    MODULE.scan(output, output, Path('gitleaks'))

    def test_source_change_before_scan_is_rejected_without_running_scanner(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            self.scan_fixture(output)
            (output / 'app.js').write_text('changed')
            with patch.object(MODULE.subprocess, 'run') as run:
                with self.assertRaisesRegex(MODULE.SourceBoundaryError, 'CHANGED_BEFORE_SCAN'):
                    MODULE.scan(output, output, Path('gitleaks'))
                run.assert_not_called()

    def test_source_change_during_scan_cannot_keep_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            self.scan_fixture(output)
            def mutate(*args, **kwargs):
                (output / 'app.js').write_text('changed')
                (output / 'gitleaks-redacted.json').write_text('[]')
                return subprocess.CompletedProcess(args[0], 0)
            with patch.object(MODULE.subprocess, 'run', side_effect=mutate):
                code, report = MODULE.scan(output, output, Path('gitleaks'))
            self.assertEqual(code, 2)
            self.assertEqual(report['scannerExitCode'], 0)
            self.assertEqual(report['status'], 'ERROR')
            self.assertEqual(report['errorCode'], 'CI_SCAN_SOURCE_CHANGED_DURING_SCAN')


if __name__ == '__main__':
    unittest.main()
