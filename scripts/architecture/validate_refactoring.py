"""Validate refactoring governance assets without touching business code or runtime state."""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
REFACTOR_ROOT = ROOT / "docs" / "architecture" / "refactoring"
BATCH_ROOT = REFACTOR_ROOT / "batches"
MODULE_MANIFEST = REFACTOR_ROOT / "module-boundaries-v1.yaml"
SCHEMA_PATH = ROOT / "contracts" / "schemas" / "governance" / "refactor-batch-v1.schema.json"
ORDER_AUTHORITY = "agent/plans/active/v54-implementation-batches.md"
REQUIRED_ARTIFACTS = {
    "baseline.md",
    "target-design.md",
    "contract-delta.md",
    "verification-plan.md",
    "cutover-runbook.md",
    "rollback-runbook.md",
    "evidence-index.md",
    "decision-log.md",
}
STATUSES = {
    "PROPOSED", "BASELINE_FROZEN", "CONTRACT_APPROVED", "IMPLEMENTING",
    "SHADOW_VERIFIED", "CUTOVER_READY", "CUTOVER", "OBSERVING", "ACCEPTED",
    "CLEANUP_ELIGIBLE", "CLOSED", "BLOCKED", "ROLLED_BACK", "SUPERSEDED", "ABORTED",
}
MODULE_STATUSES = {"ACTIVE", "SHADOW", "LEGACY_REQUIRED", "LEGACY_UNENCAPSULATED", "DEAD_CANDIDATE", "UNKNOWN"}
FACT_STATUSES = {"CONFIRMED", "INFERRED", "UNKNOWN", "NONE"}
FORBIDDEN_WIDE_PATHS = {"", ".", "./", "*", "**", "D:/", "C:/"}
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
BATCH_RE = re.compile(r"^RF-[0-9]{3}$")


def load_yaml(path: Path) -> dict:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.relative_to(ROOT).as_posix()} must contain a mapping")
    return value


def repo_path(raw: str) -> Path:
    return (ROOT / raw).resolve()


def validate_path(raw: object, label: str, errors: list[str]) -> None:
    if not isinstance(raw, str) or not raw.strip():
        errors.append(f"{label}: path must be a non-empty string")
        return
    normalized = raw.replace("\\", "/").strip()
    if normalized in FORBIDDEN_WIDE_PATHS or Path(normalized).is_absolute() or ".." in Path(normalized).parts:
        errors.append(f"{label}: unsafe or over-broad path {raw!r}")


def require_mapping(data: dict, key: str, label: str, errors: list[str]) -> dict:
    value = data.get(key)
    if not isinstance(value, dict):
        errors.append(f"{label}.{key}: required mapping")
        return {}
    return value


def require_list(data: dict, key: str, label: str, errors: list[str], minimum: int = 1) -> list:
    value = data.get(key)
    if not isinstance(value, list) or len(value) < minimum:
        errors.append(f"{label}.{key}: list requires at least {minimum} item(s)")
        return []
    return value


def validate_modules(errors: list[str]) -> set[str]:
    if not MODULE_MANIFEST.is_file():
        errors.append("module boundary manifest missing")
        return set()
    manifest = load_yaml(MODULE_MANIFEST)
    if manifest.get("schemaVersion") != 1:
        errors.append("module boundary manifest schemaVersion must be 1")
    deployables = manifest.get("deployables")
    if not isinstance(deployables, list) or not deployables:
        errors.append("module boundary manifest requires deployables")
        return set()
    module_ids: set[str] = set()
    dependency_refs: list[tuple[str, object]] = []
    deployable_ids: set[str] = set()
    for index, deployable in enumerate(deployables):
        label = f"deployables[{index}]"
        if not isinstance(deployable, dict):
            errors.append(f"{label}: must be a mapping")
            continue
        deployable_id = deployable.get("id")
        if not isinstance(deployable_id, str) or deployable_id in deployable_ids:
            errors.append(f"{label}.id: missing or duplicate")
        else:
            deployable_ids.add(deployable_id)
        root = deployable.get("root")
        validate_path(root, f"{label}.root", errors)
        if isinstance(root, str) and not repo_path(root).exists():
            errors.append(f"{label}.root: missing path {root}")
        modules = deployable.get("modules")
        if not isinstance(modules, list) or not modules:
            errors.append(f"{label}.modules: requires at least one module")
            continue
        for module_index, module in enumerate(modules):
            module_label = f"{label}.modules[{module_index}]"
            if not isinstance(module, dict):
                errors.append(f"{module_label}: must be a mapping")
                continue
            module_id = module.get("id")
            if not isinstance(module_id, str) or module_id in module_ids:
                errors.append(f"{module_label}.id: missing or duplicate")
            else:
                module_ids.add(module_id)
            module_root = module.get("root")
            validate_path(module_root, f"{module_label}.root", errors)
            if isinstance(module_root, str) and not repo_path(module_root).exists():
                errors.append(f"{module_label}.root: missing path {module_root}")
            if module.get("status") not in MODULE_STATUSES:
                errors.append(f"{module_label}.status: invalid status {module.get('status')!r}")
            for key in ("publicSurface", "dataOwnership", "allowedDependencies"):
                if not isinstance(module.get(key), list):
                    errors.append(f"{module_label}.{key}: required list")
            if isinstance(module.get("allowedDependencies"), list):
                for dependency in module["allowedDependencies"]:
                    dependency_refs.append((f"{module_label}.allowedDependencies", dependency))
            for key in ("publicSurfaceStatus", "dataOwnershipStatus"):
                if module.get(key) not in FACT_STATUSES:
                    errors.append(f"{module_label}.{key}: invalid fact status {module.get(key)!r}")
    for label, dependency in dependency_refs:
        if not isinstance(dependency, str) or dependency not in module_ids:
            errors.append(f"{label}: unknown module reference {dependency!r}")
    return module_ids


def is_local_run_output(raw: str) -> bool:
    normalized = raw.replace('\\', '/')
    return normalized.startswith('agent/runs/') and '..' not in normalized.split('/')


def validate_batch(path: Path, module_ids: set[str], errors: list[str], source_only: bool = False) -> None:
    label = path.parent.name
    data = load_yaml(path)
    allowed_top = {
        "schemaVersion", "id", "title", "status", "owner", "authorizedBy", "scope",
        "budgets", "baseline", "architecture", "mustPreserve", "verification", "rollback", "exceptions",
    }
    unknown_top = set(data) - allowed_top
    if unknown_top:
        errors.append(f"{label}: unknown top-level fields {sorted(unknown_top)}")
    batch_id = data.get("id")
    if batch_id != label or not isinstance(batch_id, str) or not BATCH_RE.fullmatch(batch_id):
        errors.append(f"{label}: id must match directory and RF-NNN pattern")
    if data.get("schemaVersion") != 1:
        errors.append(f"{label}.schemaVersion: must be 1")
    if data.get("status") not in STATUSES:
        errors.append(f"{label}.status: invalid {data.get('status')!r}")
    if data.get("authorizedBy") != ORDER_AUTHORITY:
        errors.append(f"{label}.authorizedBy: must reference unique implementation-order authority")
    for key in ("title", "owner"):
        if not isinstance(data.get(key), str) or not data[key].strip():
            errors.append(f"{label}.{key}: required non-empty string")

    scope = require_mapping(data, "scope", label, errors)
    if set(scope) - {"includePaths", "excludePaths"}:
        errors.append(f"{label}.scope: unknown fields {sorted(set(scope) - {'includePaths', 'excludePaths'})}")
    includes = require_list(scope, "includePaths", f"{label}.scope", errors)
    excludes = require_list(scope, "excludePaths", f"{label}.scope", errors)
    for kind, values in (("includePaths", includes), ("excludePaths", excludes)):
        if len(values) != len(set(values)):
            errors.append(f"{label}.scope.{kind}: duplicate paths")
        for index, raw in enumerate(values):
            validate_path(raw, f"{label}.scope.{kind}[{index}]", errors)
    overlap = set(includes) & set(excludes)
    if overlap:
        errors.append(f"{label}.scope: include/exclude overlap {sorted(overlap)}")
    # Closed batches retain their original write scope as historical evidence;
    # later batches may deliberately remove those implementation files.
    if data.get("status") not in {"CLOSED", "ACCEPTED", "SUPERSEDED"}:
        for raw in includes:
            if isinstance(raw, str) and not repo_path(raw).exists() and not (source_only and is_local_run_output(raw)):
                errors.append(f"{label}.scope.includePaths: missing path {raw}")

    budgets = require_mapping(data, "budgets", label, errors)
    budget_rules = {
        "maxChangedFiles": (1, None), "maxNewFiles": (0, None), "maxChangedLines": (1, None),
        "maxContractsChanged": (0, None), "maxMigrationsAdded": (0, None), "maxOpenModules": (1, None),
    }
    for key, (minimum, maximum) in budget_rules.items():
        value = budgets.get(key)
        if not isinstance(value, int) or value < minimum or (maximum is not None and value > maximum):
            errors.append(f"{label}.budgets.{key}: invalid budget {value!r}")
    if set(budgets) - set(budget_rules):
        errors.append(f"{label}.budgets: unknown fields {sorted(set(budgets) - set(budget_rules))}")

    baseline = require_mapping(data, "baseline", label, errors)
    baseline_fields = {"gitCommit", "dirtyTreeManifest", "releaseIdentity", "capturedAt"}
    if set(baseline) - baseline_fields:
        errors.append(f"{label}.baseline: unknown fields {sorted(set(baseline) - baseline_fields)}")
    if not isinstance(baseline.get("gitCommit"), str) or not COMMIT_RE.fullmatch(baseline["gitCommit"]):
        errors.append(f"{label}.baseline.gitCommit: requires 40 lowercase hex characters")
    for key in ("dirtyTreeManifest", "releaseIdentity", "capturedAt"):
        if not isinstance(baseline.get(key), str) or not baseline[key].strip():
            errors.append(f"{label}.baseline.{key}: required non-empty string")
    captured_at = baseline.get("capturedAt")
    if isinstance(captured_at, str):
        try:
            datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        except ValueError:
            errors.append(f"{label}.baseline.capturedAt: invalid ISO-8601 timestamp")
    dirty_manifest = baseline.get("dirtyTreeManifest")
    if isinstance(dirty_manifest, str) and not repo_path(dirty_manifest).is_file():
        errors.append(f"{label}.baseline.dirtyTreeManifest: file missing {dirty_manifest}")

    architecture = require_mapping(data, "architecture", label, errors)
    architecture_fields = {"businessCapability", "publicContract", "dependencyManifest", "allowedModules", "forbiddenModules"}
    if set(architecture) - architecture_fields:
        errors.append(f"{label}.architecture: unknown fields {sorted(set(architecture) - architecture_fields)}")
    for key in ("businessCapability", "publicContract", "dependencyManifest"):
        if not isinstance(architecture.get(key), str) or not architecture[key].strip():
            errors.append(f"{label}.architecture.{key}: required non-empty string")
    for key in ("publicContract", "dependencyManifest"):
        value = architecture.get(key)
        if isinstance(value, str) and not repo_path(value).is_file():
            errors.append(f"{label}.architecture.{key}: file missing {value}")
    allowed_modules = require_list(architecture, "allowedModules", f"{label}.architecture", errors)
    forbidden_modules = architecture.get("forbiddenModules", [])
    if not isinstance(forbidden_modules, list):
        errors.append(f"{label}.architecture.forbiddenModules: must be a list")
        forbidden_modules = []
    unknown_modules = (set(allowed_modules) | set(forbidden_modules)) - module_ids
    if unknown_modules:
        errors.append(f"{label}.architecture: unknown modules {sorted(unknown_modules)}")
    if set(allowed_modules) & set(forbidden_modules):
        errors.append(f"{label}.architecture: module cannot be both allowed and forbidden")
    max_open = budgets.get("maxOpenModules")
    if isinstance(max_open, int) and len(allowed_modules) > max_open:
        errors.append(f"{label}: allowedModules exceeds maxOpenModules")

    require_list(data, "mustPreserve", label, errors)
    verification = require_mapping(data, "verification", label, errors)
    if set(verification) - {"requiredCommands"}:
        errors.append(f"{label}.verification: unknown fields {sorted(set(verification) - {'requiredCommands'})}")
    commands = require_list(verification, "requiredCommands", f"{label}.verification", errors, minimum=2)
    command_names: set[str] = set()
    for index, command in enumerate(commands):
        command_label = f"{label}.verification.requiredCommands[{index}]"
        if not isinstance(command, dict):
            errors.append(f"{command_label}: must be a mapping")
            continue
        command_fields = {"name", "command", "expectedExitCode", "evidence", "blocking"}
        if set(command) - command_fields:
            errors.append(f"{command_label}: unknown fields {sorted(set(command) - command_fields)}")
        for key in ("name", "command", "evidence"):
            if not isinstance(command.get(key), str) or not command[key].strip():
                errors.append(f"{command_label}.{key}: required non-empty string")
        name = command.get("name")
        if isinstance(name, str):
            if name in command_names:
                errors.append(f"{command_label}.name: duplicate {name}")
            command_names.add(name)
        if not isinstance(command.get("expectedExitCode"), int):
            errors.append(f"{command_label}.expectedExitCode: required integer")
        if command.get("blocking") is not True:
            errors.append(f"{command_label}.blocking: governance commands must block")
        evidence = command.get("evidence")
        if isinstance(evidence, str) and not repo_path(evidence).is_file() and not (source_only and is_local_run_output(evidence)):
            errors.append(f"{command_label}.evidence: file missing {evidence}")

    rollback = require_mapping(data, "rollback", label, errors)
    rollback_fields = {"triggerConditions", "recoveryPoint", "maxRtoMinutes", "maxRpoMinutes"}
    if set(rollback) - rollback_fields:
        errors.append(f"{label}.rollback: unknown fields {sorted(set(rollback) - rollback_fields)}")
    require_list(rollback, "triggerConditions", f"{label}.rollback", errors)
    if not isinstance(rollback.get("recoveryPoint"), str) or not rollback["recoveryPoint"].strip():
        errors.append(f"{label}.rollback.recoveryPoint: required")
    if not isinstance(rollback.get("maxRtoMinutes"), int) or rollback["maxRtoMinutes"] < 1:
        errors.append(f"{label}.rollback.maxRtoMinutes: positive integer required")
    if not isinstance(rollback.get("maxRpoMinutes"), int) or rollback["maxRpoMinutes"] < 0:
        errors.append(f"{label}.rollback.maxRpoMinutes: non-negative integer required")

    missing_artifacts = sorted(name for name in REQUIRED_ARTIFACTS if not (path.parent / name).is_file())
    if missing_artifacts:
        errors.append(f"{label}: missing batch artifacts {missing_artifacts}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", help="Validate only one RF-NNN batch")
    parser.add_argument("--source-only", action="store_true", help="Validate source contracts without requiring machine-local agent/runs outputs; not runtime acceptance")
    args = parser.parse_args()
    errors: list[str] = []

    if not SCHEMA_PATH.is_file():
        errors.append("refactor batch JSON Schema missing")
    else:
        try:
            schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
            if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
                errors.append("refactor batch JSON Schema draft must be 2020-12")
        except json.JSONDecodeError as exc:
            errors.append(f"refactor batch JSON Schema invalid JSON: {exc}")

    try:
        module_ids = validate_modules(errors)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        errors.append(f"module boundary manifest unreadable: {exc}")
        module_ids = set()

    batch_files = sorted(BATCH_ROOT.glob("RF-*/batch.yaml")) if BATCH_ROOT.is_dir() else []
    if args.batch:
        batch_files = [path for path in batch_files if path.parent.name == args.batch]
        if not batch_files:
            errors.append(f"requested batch not found: {args.batch}")
    if not batch_files:
        errors.append("no refactoring batch contracts found")
    for batch_file in batch_files:
        try:
            validate_batch(batch_file, module_ids, errors, source_only=args.source_only)
        except (OSError, ValueError, yaml.YAMLError) as exc:
            errors.append(f"{batch_file.parent.name}: unreadable batch contract: {exc}")

    if errors:
        print("REFACTOR_VALIDATION=FAIL")
        for error in errors:
            print(error)
        raise SystemExit(1)
    print(f"REFACTOR_VALIDATION=PASS batches={len(batch_files)} modules={len(module_ids)} scope={'SOURCE_ONLY' if args.source_only else 'LOCAL_EVIDENCE'}")


if __name__ == "__main__":
    main()
