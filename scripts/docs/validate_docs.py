"""Validate canonical documentation metadata, local links, and stale paths."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
REQUIRED_KEYS = {"id", "title", "document_type", "domain", "status", "authority", "version", "effective_date", "owner"}
SKIP_METADATA = ("docs/archive/", "docs/evidence/agent-reports/")
STALE_ACTIVE_PATHS = (
    "docs/architecture/current-capability-matrix.md",
    "docs/architecture/v5.4-reference/",
    "docs/rag-governance.md",
    "agent/file-ownership.yaml",
    "agent/execution-state.yaml",
    "agent/v54-implementation-batches.md",
    "agent/v54-decision-register.md",
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
    for path in sorted(DOCS.rglob("*.md")):
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
    for path in sorted(DOCS.rglob("*.md")):
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
        if rel.startswith("docs/archive/"):
            continue
        text = path.read_text(encoding="utf-8")
        for stale in STALE_ACTIVE_PATHS:
            checked += 1
            if stale in text:
                errors.append(f"stale path {rel}: {stale}")
    return checked


def validate_generated_ignored(errors: list[str]) -> None:
    process = subprocess.run(
        ["git", "check-ignore", "--no-index", "rag/index/manifest.json", "agent/runs/example.json", "knowledge-sources/raw/example.pdf"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    ignored = set(process.stdout.replace("\\", "/").splitlines())
    expected = {"rag/index/manifest.json", "agent/runs/example.json", "knowledge-sources/raw/example.pdf"}
    if ignored != expected:
        errors.append(f"ignore rules incomplete: expected={sorted(expected)} actual={sorted(ignored)}")


def main() -> None:
    errors: list[str] = []
    metadata_count = validate_metadata(errors)
    link_count = validate_links(errors)
    stale_count = validate_stale_paths(errors)
    validate_generated_ignored(errors)
    if (ROOT / "agent" / "execution-state.yaml").exists():
        errors.append("agent/execution-state.yaml must not exist outside archive")
    if errors:
        print("DOC_VALIDATION=FAIL")
        for error in errors:
            print(error)
        raise SystemExit(1)
    print(f"DOC_VALIDATION=PASS metadata={metadata_count} links={link_count} stale_checks={stale_count}")


if __name__ == "__main__":
    main()
