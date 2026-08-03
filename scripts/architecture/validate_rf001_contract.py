#!/usr/bin/env python3
"""Validate the RF-001-B2 review contract without touching runtime state."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "docs/architecture/refactoring/batches/RF-001/mcp-boundary-contract-v1.json"
ACTIVE = ROOT / "platform/hengzhun-regression-system/contracts/mcp/hengzhun-i8.json"
ERROR_FIELDS = {
    "errorCode", "category", "status", "retryable", "userActionRequired",
    "safeMessage", "fieldErrors", "correlationRef",
}
SIDE_EFFECTS = {"READ_ONLY", "MUTATING", "CONDITIONAL_MUTATION"}
RESPONSE_MODES = {"PASS_THROUGH", "COMPACT_JOURNEY", "COMPOSITE"}


def load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    errors: list[str] = []
    try:
        review = load(REVIEW)
        active = load(ACTIVE)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"RF001_CONTRACT_VALIDATION=FAIL load={exc}")
        return 1

    if review.get("schemaVersion") != "rf001-mcp-boundary-contract-v1":
        errors.append("schemaVersion")
    if review.get("status") != "CONTRACT_APPROVED":
        errors.append("status")
    if review.get("implementationPhase") != "RF-001-B3_SHADOW_ONLY":
        errors.append("implementationPhase")

    active_names = [item.get("name") for item in active.get("tools", [])]
    tools = review.get("tools", [])
    review_names = [item.get("name") for item in tools]
    if len(active_names) != 33 or len(set(active_names)) != 33:
        errors.append("active MCP inventory must contain 33 unique tools")
    if review.get("toolCount") != 33 or len(tools) != 33:
        errors.append("review contract must contain 33 tools")
    if active_names != review_names:
        errors.append("tool names/order differ from active MCP contract")

    profile_ids = {item.get("id") for item in review.get("globalCompatibility", [])}
    for tool in tools:
        name = tool.get("name", "<missing>")
        required = {
            "name", "canonicalRequest", "acceptedAliases", "adapterProfiles",
            "harnessEndpoints", "canonicalResponse", "sideEffect", "idempotency",
        }
        missing = sorted(required - set(tool))
        if missing:
            errors.append(f"{name}: missing {missing}")
            continue
        fields = tool["canonicalRequest"]
        if not isinstance(fields, list) or not all(isinstance(v, str) and v for v in fields):
            errors.append(f"{name}: invalid canonicalRequest")
        elif len(fields) != len(set(fields)):
            errors.append(f"{name}: duplicate canonical request fields")
        aliases = tool["acceptedAliases"]
        if not isinstance(aliases, list):
            errors.append(f"{name}: acceptedAliases must be a list")
        elif any(not isinstance(v, dict) or not {"alias", "canonical", "until"} <= set(v) for v in aliases):
            errors.append(f"{name}: malformed accepted alias")
        unknown_profiles = set(tool["adapterProfiles"]) - profile_ids
        if unknown_profiles:
            errors.append(f"{name}: unknown adapter profiles {sorted(unknown_profiles)}")
        if not tool["harnessEndpoints"] or not all(str(v).startswith("/") for v in tool["harnessEndpoints"]):
            errors.append(f"{name}: invalid Harness endpoint list")
        response = tool["canonicalResponse"]
        if response.get("mode") not in RESPONSE_MODES or response.get("maxBytes") not in {8192, 16384}:
            errors.append(f"{name}: invalid canonical response")
        if tool["sideEffect"] not in SIDE_EFFECTS:
            errors.append(f"{name}: invalid sideEffect")
        if tool["sideEffect"] == "CONDITIONAL_MUTATION" and not tool.get("mutationTriggers"):
            errors.append(f"{name}: conditional mutation lacks triggers")

    envelope = review.get("canonicalErrorEnvelope", {})
    if set(envelope.get("fields", [])) != ERROR_FIELDS:
        errors.append("canonical error envelope fields")
    if not {"errorCode", "category", "status", "retryable", "userActionRequired"} <= set(envelope.get("required", [])):
        errors.append("canonical error envelope required fields")
    if review.get("activeRuntimeContract") != ACTIVE.relative_to(ROOT).as_posix():
        errors.append("activeRuntimeContract pointer")
    if review.get("implementationAuthorized") is not True:
        errors.append("implementation authorization")

    if errors:
        print("RF001_CONTRACT_VALIDATION=FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    alias_count = sum(len(item["acceptedAliases"]) for item in tools)
    conditional = sum(item["sideEffect"] == "CONDITIONAL_MUTATION" for item in tools)
    print(
        "RF001_CONTRACT_VALIDATION=PASS "
        f"tools={len(tools)} aliases={alias_count} conditional_mutations={conditional} "
        f"error_fields={len(ERROR_FIELDS)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
