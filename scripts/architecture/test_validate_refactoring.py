"""Regression checks for the explicitly declared, per-batch module budget."""
import copy
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("validate_refactoring.py")
SPEC = importlib.util.spec_from_file_location("refactoring_policy", SCRIPT)
policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(policy)


class ModuleBudgetPolicyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch_path = policy.BATCH_ROOT / "RF-066" / "batch.yaml"
        cls.baseline = policy.load_yaml(cls.batch_path)
        errors = []
        cls.modules = policy.validate_modules(errors)
        if errors:
            raise AssertionError(errors)

    def validate(self, budget, modules=None):
        batch = copy.deepcopy(self.baseline)
        batch["budgets"]["maxOpenModules"] = budget
        if modules is not None:
            batch["architecture"]["allowedModules"] = modules
        errors = []
        with patch.object(policy, "load_yaml", return_value=batch):
            policy.validate_batch(self.batch_path, self.modules, errors)
        return errors

    def test_declared_three_modules_are_valid(self):
        self.assertEqual(self.validate(3, ["hengzhun.agent-cli", "hengzhun.worker", "hengzhun.mcp"]), [])

    def test_declared_budget_still_limits_the_batch(self):
        self.assertTrue(any("exceeds maxOpenModules" in error for error in self.validate(1)))

    def test_zero_budget_and_unknown_module_remain_invalid(self):
        self.assertTrue(any("invalid budget" in error for error in self.validate(0)))
        self.assertTrue(self.validate(3, ["missing.module"]))


if __name__ == "__main__":
    unittest.main()
