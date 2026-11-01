"""Source CI does not require local runs; ordinary source and evidence stay required."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import yaml

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('refactoring_scope', ROOT / 'scripts/architecture/validate_refactoring.py')
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)
BASELINE = yaml.safe_load((ROOT / 'docs/architecture/refactoring/batches/RF-065/batch.yaml').read_text(encoding='utf-8'))


class SourceScopeTest(unittest.TestCase):
    def check_contract(self, evidence, include, source_only):
        data = copy.deepcopy(BASELINE)
        data['scope']['includePaths'] = [include]
        data['verification']['requiredCommands'][0]['evidence'] = evidence
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            batch = root / 'RF-065/batch.yaml'
            batch.parent.mkdir()
            for name in VALIDATOR.REQUIRED_ARTIFACTS:
                (batch.parent / name).touch()
            required = [data['baseline']['dirtyTreeManifest'], data['architecture']['publicContract'], data['architecture']['dependencyManifest'], data['verification']['requiredCommands'][1]['evidence']]
            for name in required:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.touch()
            errors = []
            with patch.object(VALIDATOR, 'ROOT', root), patch.object(VALIDATOR, 'load_yaml', return_value=data):
                VALIDATOR.validate_batch(batch, set(data['architecture']['allowedModules']) | set(data['architecture']['forbiddenModules']), errors, source_only=source_only)
            return errors

    def test_strict_default_requires_local_runs(self):
        errors = self.check_contract('agent/runs/test/result.json', 'agent/runs/test', False)
        self.assertEqual(len(errors), 2)
        self.assertTrue(any('evidence: file missing' in error for error in errors))
        self.assertTrue(any('includePaths: missing path' in error for error in errors))

    def test_source_scope_exempts_only_local_runs(self):
        self.assertEqual(self.check_contract('agent/runs/test/result.json', 'agent/runs/test', True), [])

    def test_source_scope_rejects_missing_ordinary_sources_and_evidence(self):
        errors = self.check_contract('docs/missing.json', 'services/missing', True)
        self.assertEqual(len(errors), 2)

    def test_traversal_is_not_a_local_output_exemption(self):
        errors = self.check_contract('agent/runs/../../docs/missing.json', 'agent/runs/../../services/missing', True)
        self.assertTrue(any('unsafe or over-broad path' in error for error in errors))
        self.assertTrue(any('evidence: file missing' in error for error in errors))
        self.assertTrue(any('includePaths: missing path' in error for error in errors))


if __name__ == '__main__':
    unittest.main()
