"""Evaluate temporal and cross-level governance without mutating source files.

S1 introduced the report-only inventory. S2 adds lifecycle/cross-level predicates and
fixture support while deliberately keeping repository enforcement disabled for S3.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[2]
BATCH_ROOT = ROOT / "docs" / "architecture" / "refactoring" / "batches"
BACKLOG = ROOT / "agent" / "backlog.yaml"
ORDER = ROOT / "agent" / "plans" / "active" / "v54-implementation-batches.md"
BATCH_RE = re.compile(r"^RF-[0-9]{3}$")
BODY_STATUS_RE = re.compile(r"(?im)^Status:\s*`?([^`\r\n]+)`?")
DATE_RE = re.compile(r"\b20\d{2}-\d{2}-\d{2}\b")
STATUS_WORD_RE = re.compile(
    r"\b(?:DRAFT|PROPOSED|APPROVED|IMPLEMENTING|VERIFYING|COMPLETED|CLOSED|"
    r"BLOCKED|ROLLED_BACK|ABORTED|DONE|REVIEW|ACCEPTED|HISTORICAL|SUPERSEDED)\b",
    re.IGNORECASE,
)
TERMINAL_SLICE_STATUSES = {"COMPLETED", "ROLLED_BACK", "ABORTED"}
ALLOWED_TRANSITIONS = {
    "DRAFT": {"PROPOSED", "ABORTED"},
    "PROPOSED": {"APPROVED", "BLOCKED", "ABORTED"},
    "APPROVED": {"IMPLEMENTING", "BLOCKED", "ROLLED_BACK", "ABORTED"},
    "IMPLEMENTING": {"VERIFYING", "BLOCKED", "ROLLED_BACK", "ABORTED"},
    "VERIFYING": {"CLOSED", "BLOCKED", "ROLLED_BACK", "ABORTED"},
    "BLOCKED": {"APPROVED", "IMPLEMENTING", "ABORTED"},
    "CLOSED": set(),
    "ROLLED_BACK": set(),
    "ABORTED": set(),
}


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def load_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{relative(path)} must contain a mapping")
    return data


def markdown_metadata(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end < 0:
        return {}, text
    metadata = yaml.safe_load(text[4:end]) or {}
    return metadata if isinstance(metadata, dict) else {}, text[end + 5 :]


def clean_status(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    cleaned = value.strip().strip("`").split("—", 1)[0].strip()
    match = re.match(r"[A-Za-z0-9_-]+", cleaned)
    return match.group(0).upper() if match else cleaned.upper()


def backlog_records() -> dict[str, dict[str, Any]]:
    data = load_yaml(BACKLOG)
    found: dict[str, dict[str, Any]] = {}

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            item_id = value.get("id")
            if isinstance(item_id, str):
                match = re.search(r"RF-([0-9]{3})", item_id)
                if match:
                    batch_id = f"RF-{match.group(1)}"
                    found[batch_id] = {
                        "id": item_id,
                        "status": clean_status(value.get("status")),
                        "source": relative(BACKLOG),
                    }
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(data)
    return found


def order_records() -> dict[str, dict[str, Any]]:
    """Read only the authoritative current-status table, never historical RF tables."""
    records: dict[str, dict[str, Any]] = {}
    in_current_table = False
    for line in ORDER.read_text(encoding="utf-8").splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells[:2] == ["批次", "当前状态"]:
            in_current_table = True
            continue
        if not in_current_table:
            continue
        if not line.lstrip().startswith("|"):
            break
        if not cells or cells[0] in {"---", ""}:
            continue
        batch_id = cells[0]
        if BATCH_RE.fullmatch(batch_id) and len(cells) >= 2:
            records[batch_id] = {
                "status": clean_status(cells[1]),
                "rawStatus": cells[1],
                "source": relative(ORDER),
            }
    return records


def historical_statements(batch_dir: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for name in ("decision-log.md", "evidence-index.md"):
        path = batch_dir / name
        if not path.is_file():
            continue
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip()
            if not stripped or not STATUS_WORD_RE.search(stripped):
                continue
            dated = bool(DATE_RE.search(stripped))
            marked_historical = "historical" in stripped.lower()
            if not (dated or marked_historical):
                continue
            records.append(
                {
                    "source": relative(path),
                    "line": line_number,
                    "classification": "DATED_HISTORICAL" if dated else "MARKED_HISTORICAL",
                    "sha256": hashlib.sha256(stripped.encode("utf-8")).hexdigest(),
                    "excerpt": stripped[:320],
                }
            )
    return records


def issue(
    batch_id: str,
    code: str,
    source: str,
    field: str,
    observed: Any,
    expected_relation: str,
) -> dict[str, Any]:
    record = {
        "batchId": batch_id,
        "code": code,
        "classification": "CURRENT_CONTRADICTION",
        "source": source,
        "field": field,
        "observed": observed,
        "expectedRelation": expected_relation,
    }
    fingerprint_payload = {
        key: record[key]
        for key in ("batchId", "code", "source", "field", "observed", "expectedRelation")
    }
    record["fingerprint"] = hashlib.sha256(
        json.dumps(
            fingerprint_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return record


def partition_contradictions(
    contradictions: list[dict[str, Any]],
    grandfathered_fingerprints: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    current: list[dict[str, Any]] = []
    grandfathered: list[dict[str, Any]] = []
    for contradiction in contradictions:
        if contradiction["fingerprint"] in grandfathered_fingerprints:
            grandfathered.append({**contradiction, "classification": "GRANDFATHERED_CURRENT_PROJECTION"})
        else:
            current.append(contradiction)
    return current, grandfathered


def build_fixture_inventory(fixture: dict[str, Any], *, enforce: bool = False) -> dict[str, Any]:
    """Evaluate a synthetic cross-level projection through the public CLI seam."""
    batch_id = str(fixture.get("batchId") or "RF-FIXTURE")
    batch_status = clean_status(fixture.get("batchStatus"))
    slices = {
        str(key): clean_status(value)
        for key, value in (fixture.get("sliceStatuses") or {}).items()
    }
    tasks = {
        str(key): clean_status(value)
        for key, value in (fixture.get("taskStatuses") or {}).items()
    }
    contradictions: list[dict[str, Any]] = []
    nonterminal_slices = sorted(
        slice_id for slice_id, status in slices.items() if status not in TERMINAL_SLICE_STATUSES
    )
    if batch_status == "CLOSED" and nonterminal_slices:
        contradictions.append(
            issue(
                batch_id,
                "BATCH_CLOSED_WITH_NONTERMINAL_SLICE",
                "fixture.json",
                "batchStatus",
                {"batch": batch_status, "nonterminalSlices": nonterminal_slices},
                "batch CLOSED requires every required slice to be terminal",
            )
        )
    backlog_status = clean_status(fixture.get("backlogStatus"))
    if backlog_status == "DONE" and batch_status != "CLOSED":
        contradictions.append(
            issue(
                batch_id,
                "BACKLOG_DONE_BATCH_NOT_CLOSED",
                "fixture.json",
                "backlogStatus",
                backlog_status,
                "backlog DONE requires batch CLOSED",
            )
        )
    order_status = clean_status(fixture.get("orderStatus"))
    if order_status == "CLOSED" and batch_status != "CLOSED":
        contradictions.append(
            issue(
                batch_id,
                "ORDER_CLOSED_BATCH_NOT_CLOSED",
                "fixture.json",
                "orderStatus",
                order_status,
                "order CLOSED requires batch CLOSED",
            )
        )
    for task_id, task_status in tasks.items():
        slice_status = slices.get(task_id)
        if task_status == "COMPLETED" and slice_status != "COMPLETED":
            contradictions.append(
                issue(
                    batch_id,
                    "TASK_COMPLETED_SLICE_NOT_COMPLETED",
                    "fixture.json",
                    task_id,
                    {"task": task_status, "slice": slice_status},
                    "task COMPLETED requires matching slice COMPLETED",
                )
            )
    transition = fixture.get("transition") or {}
    transition_from = clean_status(transition.get("from"))
    transition_to = clean_status(transition.get("to"))
    if transition_from and transition_to and transition_to not in ALLOWED_TRANSITIONS.get(transition_from, set()):
        contradictions.append(
            issue(
                batch_id,
                "INVALID_LIFECYCLE_TRANSITION",
                "fixture.json",
                str(transition.get("level") or "unknown"),
                {"from": transition_from, "to": transition_to},
                "transition must follow the governed lifecycle graph",
            )
        )
    for index, claim in enumerate(fixture.get("runtimeClaims") or []):
        if clean_status(claim.get("status")) != "PASSED":
            continue
        release_identity = str(claim.get("releaseIdentity") or "").strip()
        evidence_class = clean_status(claim.get("evidenceClass"))
        if not release_identity or evidence_class != "LIVE_E2E":
            contradictions.append(
                issue(
                    batch_id,
                    "UNSUPPORTED_RUNTIME_ACCEPTANCE_CLAIM",
                    "fixture.json",
                    f"runtimeClaims[{index}]",
                    {
                        "status": "PASSED",
                        "hasReleaseIdentity": bool(release_identity),
                        "evidenceClass": evidence_class,
                    },
                    "runtime PASSED requires a ReleaseIdentity and LIVE_E2E evidence",
                )
            )
    contradictions.sort(key=lambda item: item["code"])
    current, grandfathered = partition_contradictions(
        contradictions,
        {str(value) for value in fixture.get("grandfatheredIssueFingerprints") or []},
    )
    return {
        "schemaVersion": "rf008-temporal-fixture-result-v1",
        "mode": "REPORT_ONLY",
        "summary": {
            "currentContradictionCount": len(current),
            "grandfatheredContradictionCount": len(grandfathered),
            "enforcementEnabled": enforce,
        },
        "currentContradictions": current,
        "grandfatheredContradictions": grandfathered,
    }


def build_inventory(*, enforce: bool = False) -> dict[str, Any]:
    backlog = backlog_records()
    order = order_records()
    batches: list[dict[str, Any]] = []
    contradictions: list[dict[str, Any]] = []
    historical: list[dict[str, Any]] = []

    for batch_file in sorted(BATCH_ROOT.glob("RF-*/batch.yaml")):
        batch_id = batch_file.parent.name
        if not BATCH_RE.fullmatch(batch_id):
            continue
        batch_data = load_yaml(batch_file)
        batch_status = clean_status(batch_data.get("status"))
        slices: dict[str, dict[str, Any]] = {}
        tasks: dict[str, dict[str, Any]] = {}
        evidence_path = batch_file.parent / "evidence-index.md"
        evidence_meta, evidence_body = markdown_metadata(evidence_path)
        evidence_body_match = BODY_STATUS_RE.search(evidence_body)

        for slice_path in sorted((batch_file.parent / "slices").glob("*.yaml")):
            slice_data = load_yaml(slice_path)
            slice_id = str(slice_data.get("id") or slice_path.stem)
            slices[slice_id] = {
                "status": clean_status(slice_data.get("status")),
                "source": relative(slice_path),
            }

        for task_path in sorted((batch_file.parent / "tasks").glob("*.md")):
            task_meta, task_body = markdown_metadata(task_path)
            body_match = BODY_STATUS_RE.search(task_body)
            task_id = str(task_meta.get("id") or task_path.stem)
            tasks[task_id] = {
                "metadataStatus": clean_status(task_meta.get("status")),
                "bodyStatus": clean_status(body_match.group(1)) if body_match else None,
                "source": relative(task_path),
            }

        batch_record = {
            "batchId": batch_id,
            "batch": {"status": batch_status, "source": relative(batch_file)},
            "backlog": backlog.get(batch_id),
            "order": order.get(batch_id),
            "slices": slices,
            "tasks": tasks,
            "evidenceIndex": {
                "metadataStatus": clean_status(evidence_meta.get("status")),
                "bodyStatus": clean_status(evidence_body_match.group(1)) if evidence_body_match else None,
                "source": relative(evidence_path),
            },
        }
        batches.append(batch_record)
        historical.extend(historical_statements(batch_file.parent))

        slice_statuses = [item["status"] for item in slices.values()]
        nonterminal_slices = sorted(
            slice_id
            for slice_id, item in slices.items()
            if item["status"] not in TERMINAL_SLICE_STATUSES
        )
        if batch_status == "CLOSED" and nonterminal_slices:
            contradictions.append(
                issue(
                    batch_id,
                    "BATCH_CLOSED_WITH_NONTERMINAL_SLICE",
                    relative(batch_file),
                    "status",
                    {"batch": batch_status, "nonterminalSlices": nonterminal_slices},
                    "batch CLOSED requires every required slice to be terminal",
                )
            )
        if slice_statuses and all(status == "COMPLETED" for status in slice_statuses) and batch_status != "CLOSED":
            contradictions.append(
                issue(
                    batch_id,
                    "ALL_SLICES_COMPLETED_BATCH_NOT_CLOSED",
                    relative(batch_file),
                    "status",
                    batch_status,
                    "all slices COMPLETED requires batch CLOSED",
                )
            )
        backlog_status = (backlog.get(batch_id) or {}).get("status")
        if backlog_status == "DONE" and batch_status != "CLOSED":
            contradictions.append(
                issue(
                    batch_id,
                    "BACKLOG_DONE_BATCH_NOT_CLOSED",
                    (backlog.get(batch_id) or {}).get("source", relative(BACKLOG)),
                    "status",
                    backlog_status,
                    "backlog DONE requires batch CLOSED",
                )
            )
        order_status = (order.get(batch_id) or {}).get("status")
        if order_status == "CLOSED" and batch_status != "CLOSED":
            contradictions.append(
                issue(
                    batch_id,
                    "ORDER_CLOSED_BATCH_NOT_CLOSED",
                    (order.get(batch_id) or {}).get("source", relative(ORDER)),
                    "status",
                    order_status,
                    "order CLOSED requires batch CLOSED",
                )
            )

        for task_id, task in tasks.items():
            body_status = task["bodyStatus"]
            metadata_status = task["metadataStatus"]
            if body_status and metadata_status and body_status != metadata_status:
                contradictions.append(
                    issue(
                        batch_id,
                        "TASK_METADATA_BODY_STATUS_MISMATCH",
                        task["source"],
                        task_id,
                        {"metadata": metadata_status, "body": body_status},
                        "task metadata and current body Status must agree",
                    )
                )
            slice_suffix = task_id.rsplit("-", 1)[-1]
            matching_slice = next((value for key, value in slices.items() if key.endswith(f"-{slice_suffix}")), None)
            if body_status == "COMPLETED" and matching_slice and matching_slice["status"] != "COMPLETED":
                contradictions.append(
                    issue(
                        batch_id,
                        "TASK_COMPLETED_SLICE_NOT_COMPLETED",
                        task["source"],
                        task_id,
                        {"task": body_status, "slice": matching_slice["status"]},
                        "task COMPLETED requires matching slice COMPLETED",
                    )
                )

    contradictions.sort(key=lambda item: (item["batchId"], item["code"], item["source"]))
    historical.sort(key=lambda item: (item["source"], item["line"]))
    rf008 = load_yaml(BATCH_ROOT / "RF-008" / "batch.yaml")
    registered = {
        str(entry.get("fingerprint"))
        for entry in (rf008.get("exceptions") or {}).get("temporalGrandfathered", [])
        if isinstance(entry, dict) and entry.get("fingerprint")
    }
    current, grandfathered = partition_contradictions(contradictions, registered)
    return {
        "schemaVersion": "rf008-temporal-contradiction-inventory-v1",
        "mode": "REPORT_ONLY",
        "scope": "RF-000..RF-008",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sources": {
            "orderAuthority": relative(ORDER),
            "backlog": relative(BACKLOG),
            "batchRoot": relative(BATCH_ROOT),
        },
        "summary": {
            "batchCount": len(batches),
            "currentContradictionCount": len(current),
            "grandfatheredContradictionCount": len(grandfathered),
            "historicalStatementCount": len(historical),
            "enforcementEnabled": enforce,
        },
        "batches": batches,
        "currentContradictions": current,
        "grandfatheredContradictions": grandfathered,
        "historicalStatements": historical,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, help="Write the report-only inventory to this path")
    parser.add_argument("--fixture", type=Path, help="Evaluate one synthetic lifecycle fixture")
    parser.add_argument("--json", action="store_true", help="Print the complete JSON result")
    parser.add_argument("--compact", action="store_true", help="Print compact JSON")
    parser.add_argument("--enforce", action="store_true", help="Fail on non-grandfathered contradictions")
    args = parser.parse_args()
    inventory = (
        build_fixture_inventory(load_yaml(args.fixture), enforce=args.enforce)
        if args.fixture
        else build_inventory(enforce=args.enforce)
    )
    rendered = json.dumps(inventory, ensure_ascii=False, indent=None if args.compact else 2)
    if args.output:
        output = args.output if args.output.is_absolute() else ROOT / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8", newline="\n")
    if args.json:
        print(rendered)
    elif args.fixture:
        print(
            "TEMPORAL_FIXTURE=EVALUATED "
            f"current_contradictions={inventory['summary']['currentContradictionCount']} "
            f"grandfathered_contradictions={inventory['summary']['grandfatheredContradictionCount']} "
            f"mode={'ENFORCE' if args.enforce else 'REPORT_ONLY'}"
        )
    else:
        print(
            "TEMPORAL_INVENTORY=RECORDED "
            f"batches={inventory['summary']['batchCount']} "
            f"current_contradictions={inventory['summary']['currentContradictionCount']} "
            f"grandfathered_contradictions={inventory['summary']['grandfatheredContradictionCount']} "
            f"historical_statements={inventory['summary']['historicalStatementCount']} "
            f"mode={'ENFORCE' if args.enforce else 'REPORT_ONLY'}"
        )
    if args.enforce and inventory["currentContradictions"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
