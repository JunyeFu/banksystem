"""Public-CLI contract tests for RF-008 temporal governance."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("validate_refactoring_temporal.py")


class TemporalValidatorCliTests(unittest.TestCase):
    def run_fixture_process(self, fixture: dict, *, enforce: bool = False) -> subprocess.CompletedProcess:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "fixture.json"
            path.write_text(json.dumps(fixture), encoding="utf-8")
            command = [sys.executable, str(SCRIPT), "--fixture", str(path), "--json"]
            if enforce:
                command.append("--enforce")
            process = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                env={**os.environ, "PYTHONUTF8": "1"},
            )
        return process

    def run_fixture(self, fixture: dict) -> dict:
        process = self.run_fixture_process(fixture)
        self.assertEqual(process.returncode, 0, process.stderr)
        return json.loads(process.stdout)

    def run_repository(self) -> dict:
        process = subprocess.run(
            [sys.executable, str(SCRIPT), "--json"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        return json.loads(process.stdout)

    def test_completed_task_requires_completed_slice(self) -> None:
        result = self.run_fixture(
            {
                "batchId": "RF-900",
                "batchStatus": "IMPLEMENTING",
                "sliceStatuses": {"S1": "PROPOSED"},
                "taskStatuses": {"S1": "COMPLETED"},
                "backlogStatus": "REVIEW",
                "orderStatus": "IMPLEMENTING",
                "runtimeClaims": [],
            }
        )
        self.assertEqual(
            [item["code"] for item in result["currentContradictions"]],
            ["TASK_COMPLETED_SLICE_NOT_COMPLETED"],
        )

    def test_closed_batch_requires_every_slice_to_be_terminal(self) -> None:
        result = self.run_fixture(
            {
                "batchId": "RF-900",
                "batchStatus": "CLOSED",
                "sliceStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                "taskStatuses": {"S1": "COMPLETED", "S2": "DRAFT"},
                "backlogStatus": "DONE",
                "orderStatus": "CLOSED",
                "runtimeClaims": [],
            }
        )
        self.assertEqual(
            [item["code"] for item in result["currentContradictions"]],
            ["BATCH_CLOSED_WITH_NONTERMINAL_SLICE"],
        )

    def test_backlog_and_order_terminal_claims_require_closed_batch(self) -> None:
        result = self.run_fixture(
            {
                "batchId": "RF-900",
                "batchStatus": "IMPLEMENTING",
                "sliceStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                "taskStatuses": {"S1": "COMPLETED", "S2": "DRAFT"},
                "backlogStatus": "DONE",
                "orderStatus": "CLOSED",
                "runtimeClaims": [],
            }
        )
        self.assertEqual(
            [item["code"] for item in result["currentContradictions"]],
            ["BACKLOG_DONE_BATCH_NOT_CLOSED", "ORDER_CLOSED_BATCH_NOT_CLOSED"],
        )

    def test_lifecycle_transition_contract(self) -> None:
        allowed_transitions = {
            "DRAFT": ["PROPOSED", "ABORTED"],
            "PROPOSED": ["APPROVED", "BLOCKED", "ABORTED"],
            "APPROVED": ["IMPLEMENTING", "BLOCKED", "ROLLED_BACK", "ABORTED"],
            "IMPLEMENTING": ["VERIFYING", "BLOCKED", "ROLLED_BACK", "ABORTED"],
            "VERIFYING": ["CLOSED", "BLOCKED", "ROLLED_BACK", "ABORTED"],
            "BLOCKED": ["APPROVED", "IMPLEMENTING", "ABORTED"],
        }
        for source, targets in allowed_transitions.items():
            for target in targets:
                with self.subTest(source=source, target=target):
                    allowed = self.run_fixture(
                        {
                            "batchId": "RF-900",
                            "batchStatus": "IMPLEMENTING",
                            "sliceStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                            "taskStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                            "backlogStatus": "REVIEW",
                            "orderStatus": "IMPLEMENTING",
                            "transition": {"level": "batch", "from": source, "to": target},
                        }
                    )
                    self.assertEqual(allowed["currentContradictions"], [])

        rejected = self.run_fixture(
            {
                "batchId": "RF-900",
                "batchStatus": "IMPLEMENTING",
                "sliceStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                "taskStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                "backlogStatus": "REVIEW",
                "orderStatus": "IMPLEMENTING",
                "transition": {"level": "batch", "from": "CLOSED", "to": "IMPLEMENTING"},
            }
        )
        self.assertEqual(
            [item["code"] for item in rejected["currentContradictions"]],
            ["INVALID_LIFECYCLE_TRANSITION"],
        )

    def test_runtime_pass_requires_release_identity_and_live_e2e(self) -> None:
        result = self.run_fixture(
            {
                "batchId": "RF-900",
                "batchStatus": "IMPLEMENTING",
                "sliceStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                "taskStatuses": {"S1": "COMPLETED", "S2": "PROPOSED"},
                "backlogStatus": "REVIEW",
                "orderStatus": "IMPLEMENTING",
                "runtimeClaims": [
                    {
                        "status": "PASSED",
                        "releaseIdentity": "",
                        "evidenceClass": "STATIC",
                    }
                ],
            }
        )
        self.assertEqual(
            [item["code"] for item in result["currentContradictions"]],
            ["UNSUPPORTED_RUNTIME_ACCEPTANCE_CLAIM"],
        )

    def test_repository_reads_only_the_current_execution_order_table(self) -> None:
        result = self.run_repository()
        statuses = {
            batch["batchId"]: (batch["order"] or {}).get("status")
            for batch in result["batches"]
        }
        self.assertEqual(statuses["RF-006"], "CLOSED")
        self.assertEqual(statuses["RF-007"], "CLOSED")
        self.assertEqual(statuses["RF-008"], "CLOSED")
        self.assertIsNone(statuses["RF-001"])
        self.assertEqual(
            [
                issue
                for issue in result["currentContradictions"]
                if issue["batchId"] == "RF-008"
            ],
            [],
        )

    def test_enforcement_allows_only_exact_grandfathered_issue_fingerprint(self) -> None:
        fixture = {
            "batchId": "RF-900",
            "batchStatus": "IMPLEMENTING",
            "sliceStatuses": {"S1": "PROPOSED"},
            "taskStatuses": {"S1": "COMPLETED"},
            "backlogStatus": "REVIEW",
            "orderStatus": "IMPLEMENTING",
        }
        reported = self.run_fixture(fixture)
        fingerprint = reported["currentContradictions"][0]["fingerprint"]

        grandfathered = {
            **fixture,
            "grandfatheredIssueFingerprints": [fingerprint],
        }
        accepted = self.run_fixture_process(grandfathered, enforce=True)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        accepted_result = json.loads(accepted.stdout)
        self.assertEqual(accepted_result["currentContradictions"], [])
        self.assertEqual(len(accepted_result["grandfatheredContradictions"]), 1)

        drifted = {
            **grandfathered,
            "sliceStatuses": {"S1": "BLOCKED"},
        }
        rejected = self.run_fixture_process(drifted, enforce=True)
        self.assertEqual(rejected.returncode, 1)
        self.assertEqual(
            [item["code"] for item in json.loads(rejected.stdout)["currentContradictions"]],
            ["TASK_COMPLETED_SLICE_NOT_COMPLETED"],
        )

    def test_repository_enforcement_accepts_only_registered_legacy_conflicts(self) -> None:
        process = subprocess.run(
            [sys.executable, str(SCRIPT), "--json", "--enforce"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        result = json.loads(process.stdout)
        self.assertEqual(result["currentContradictions"], [])
        self.assertEqual(len(result["grandfatheredContradictions"]), 5)
        self.assertTrue(result["summary"]["enforcementEnabled"])


if __name__ == "__main__":
    unittest.main()
