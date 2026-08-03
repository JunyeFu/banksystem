"""Validate canonical documentation metadata, links, paths, and execution order."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
DOCUMENTS = ROOT / "documents"
REQUIRED_KEYS = {"id", "title", "document_type", "domain", "status", "authority", "version", "effective_date", "owner"}
SKIP_METADATA = ("docs/evidence/agent-reports/",)
STALE_ACTIVE_PATHS = (
    "docs/architecture/current-capability-matrix.md",
    "docs/architecture/v5.4-reference/",
    "docs/rag-governance.md",
    "agent/file-ownership.yaml",
    "agent/execution-state.yaml",
    "agent/v54-implementation-batches.md",
    "agent/v54-decision-register.md",
)
ORDER_AUTHORITY = ROOT / "agent" / "plans" / "active" / "v54-implementation-batches.md"
ORDER_AUTHORITY_MARKER = "IMPLEMENTATION_ORDER_AUTHORITY: v54-implementation-batches"
ORDER_REFERENCE = "agent/plans/active/v54-implementation-batches.md"
ORDER_REFERENCE_FILES = (ROOT / "AGENTS.md", ROOT / "agent" / "README.md", ROOT / "docs" / "README.md")
PROHIBITED_ORDER_PATTERNS = (
    (re.compile(r"FE-DEFECT-001\s*必须先完成"), "frontend parent task cannot be a global Coze start gate"),
    (re.compile(r"未达到[^\n]{0,120}不开始\s*Coze", re.IGNORECASE), "global frontend-before-Coze gate is obsolete"),
    (re.compile(r"前端稳定后[^\n]{0,120}(?:启动|开始|完成)\s*Coze", re.IGNORECASE), "serial frontend-before-Coze order is obsolete"),
    (re.compile(r"dependsOn:\s*\[\s*FE-DEFECT-001\s*\]"), "Coze core must not depend on the full frontend parent task"),
)


def frontmatter_keys(text: str) -> set[str]:
    if not text.startswith("---\n"):
        return set()
    end = text.find("\n---\n", 4)
    if end < 0:
        return set()
    keys = set()
    for line in text[4:end].splitlines():
        if ":" in line and not line.startswith((" ", "\t")):
            keys.add(line.split(":", 1)[0].strip())
    return keys


def validate_metadata(errors: list[str]) -> int:
    checked = 0
    paths = list(DOCS.rglob("*.md"))
    if DOCUMENTS.is_dir():
        paths.extend(DOCUMENTS.rglob("*.md"))
    for path in sorted(paths):
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith(SKIP_METADATA):
            continue
        checked += 1
        keys = frontmatter_keys(path.read_text(encoding="utf-8"))
        missing = REQUIRED_KEYS - keys
        if missing:
            errors.append(f"metadata {rel}: missing {sorted(missing)}")
    return checked


def validate_links(errors: list[str]) -> int:
    checked = 0
    pattern = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    paths = list(DOCS.rglob("*.md"))
    if DOCUMENTS.is_dir():
        paths.extend(DOCUMENTS.rglob("*.md"))
    for path in sorted(paths):
        text = path.read_text(encoding="utf-8")
        for raw_target in pattern.findall(text):
            target = raw_target.strip().strip("<>").split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:", "/")):
                continue
            if any(char in target for char in "{}*"):
                continue
            checked += 1
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                errors.append(f"link {path.relative_to(ROOT).as_posix()}: {raw_target}")
    return checked


def validate_stale_paths(errors: list[str]) -> int:
    checked = 0
    roots = [ROOT / "README.md", ROOT / "AGENTS.md", ROOT / "docs", ROOT / "agent" / "plans"]
    files = []
    for root in roots:
        files.extend([root] if root.is_file() else root.rglob("*.md"))
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        for stale in STALE_ACTIVE_PATHS:
            checked += 1
            if stale in text:
                errors.append(f"stale path {rel}: {stale}")
    return checked


def active_order_files() -> list[Path]:
    """Return active control documents; archives, evidence, research, and references are non-authoritative."""
    files = [ROOT / "AGENTS.md", ROOT / "README.md", ROOT / "agent" / "README.md", ROOT / "agent" / "backlog.yaml"]
    files.extend((ROOT / "agent" / "plans" / "active").glob("*.md"))
    for path in DOCS.rglob("*.md"):
        rel = path.relative_to(DOCS).as_posix()
        if rel.startswith(("archive/", "evidence/", "reference/", "research/")):
            continue
        files.append(path)
    return sorted({path.resolve() for path in files if path.is_file()})


def validate_implementation_order(errors: list[str]) -> int:
    """Enforce one implementation-order authority and reject superseded global gates."""
    if not ORDER_AUTHORITY.is_file():
        errors.append(f"implementation order authority missing: {ORDER_REFERENCE}")
        return 0

    authority_text = ORDER_AUTHORITY.read_text(encoding="utf-8")
    if ORDER_AUTHORITY_MARKER not in authority_text:
        errors.append(f"implementation order authority marker missing: {ORDER_REFERENCE}")

    for path in ORDER_REFERENCE_FILES:
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        if ORDER_REFERENCE not in text:
            errors.append(f"implementation order reference missing: {path.relative_to(ROOT).as_posix()}")

    checked = 0
    marker_files: list[str] = []
    for path in active_order_files():
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        checked += 1
        if ORDER_AUTHORITY_MARKER in text:
            marker_files.append(rel)
        for pattern, message in PROHIBITED_ORDER_PATTERNS:
            if pattern.search(text):
                errors.append(f"implementation order conflict {rel}: {message}")

    if marker_files != [ORDER_REFERENCE]:
        errors.append(f"implementation order authority must be unique: found={marker_files}")
    return checked


def validate_generated_ignored(errors: list[str]) -> None:
    process = subprocess.run(
        ["git", "check-ignore", "--no-index", "rag/index/manifest.json", "agent/runs/example.json", "knowledge-sources/raw/example.pdf", "deliverables/example.pdf", "platform/hengzhun-regression-system/.data/example.json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    ignored = set(process.stdout.replace("\\", "/").splitlines())
    expected = {"rag/index/manifest.json", "agent/runs/example.json", "knowledge-sources/raw/example.pdf", "deliverables/example.pdf", "platform/hengzhun-regression-system/.data/example.json"}
    if ignored != expected:
        errors.append(f"ignore rules incomplete: expected={sorted(expected)} actual={sorted(ignored)}")


def validate_refactoring_governance(errors: list[str]) -> bool:
    validator = ROOT / "scripts" / "architecture" / "validate_refactoring.py"
    if not validator.is_file():
        errors.append("refactoring governance validator missing")
        return False
    process = subprocess.run(
        [sys.executable, str(validator)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if process.returncode != 0:
        details = (process.stdout + process.stderr).strip().replace("\n", " | ")
        errors.append(f"refactoring governance invalid: {details}")
        return False
    return "REFACTOR_VALIDATION=PASS" in process.stdout


def main() -> None:
    errors: list[str] = []
    metadata_count = validate_metadata(errors)
    link_count = validate_links(errors)
    stale_count = validate_stale_paths(errors)
    order_count = validate_implementation_order(errors)
    validate_generated_ignored(errors)
    refactoring_valid = validate_refactoring_governance(errors)
    if (ROOT / "agent" / "execution-state.yaml").exists():
        errors.append("agent/execution-state.yaml must not exist outside archive")
    if errors:
        print("DOC_VALIDATION=FAIL")
        for error in errors:
            print(error)
        raise SystemExit(1)
    print(
        f"DOC_VALIDATION=PASS metadata={metadata_count} links={link_count} "
        f"stale_checks={stale_count} order_files={order_count} refactoring={refactoring_valid}"
    )


if __name__ == "__main__":
    main()
