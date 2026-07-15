"""Build a reproducible, metadata-aware local RAG index from reviewed sources."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
RAG_ROOT = ROOT / "rag"
OUT = RAG_ROOT / "index"
CONFIG = RAG_ROOT / "config"
SOURCES_FILE = OUT / "sources.jsonl"
MANIFEST_FILE = OUT / "manifest.json"
SHARDS = OUT / "shards"


def load_config(name: str) -> dict:
    # JSON is valid YAML. Keeping configuration in this subset avoids a runtime
    # dependency while preserving the requested .yaml interface.
    return json.loads((CONFIG / name).read_text(encoding="utf-8"))


SOURCE_CONFIG = load_config("sources.yaml")
AUTHORITY_CONFIG = load_config("authority.yaml")


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def is_excluded(path: Path) -> bool:
    rel = relative(path)
    parts = set(path.relative_to(ROOT).parts)
    if any(part in parts for part in SOURCE_CONFIG["exclude_parts"]):
        return True
    if path.name in SOURCE_CONFIG["exclude_names"]:
        return True
    return any(rel.startswith(prefix) for prefix in SOURCE_CONFIG["exclude_prefixes"])


def is_included(path: Path) -> bool:
    if not path.is_file() or is_excluded(path):
        return False
    rel = relative(path)
    if path.name in SOURCE_CONFIG["include_names"]:
        return True
    if path.suffix.lower() not in SOURCE_CONFIG["include_extensions"]:
        return False
    return any(rel == root or rel.startswith(root.rstrip("/") + "/") for root in SOURCE_CONFIG["include_roots"])


def parse_scalar(value: str):
    value = value.strip()
    if not value:
        return ""
    if value.startswith("[") and value.endswith("]"):
        try:
            return json.loads(value.replace("'", '"'))
        except json.JSONDecodeError:
            return [item.strip() for item in value[1:-1].split(",") if item.strip()]
    return value.strip("'\"")


def split_frontmatter(text: str) -> tuple[dict, str, int]:
    normalized = text.replace("\r\n", "\n")
    if not normalized.startswith("---\n"):
        return {}, normalized, 1
    end = normalized.find("\n---\n", 4)
    if end < 0:
        return {}, normalized, 1
    metadata: dict = {}
    for line in normalized[4:end].splitlines():
        if ":" not in line or line.startswith((" ", "\t")):
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = parse_scalar(value)
    body_start = end + 5
    return metadata, normalized[body_start:], normalized[:body_start].count("\n") + 1


def classify(path: Path, metadata: dict) -> dict:
    rel = relative(path)
    if rel.startswith("contracts/"):
        source_class, retrieval_domain, domain = "contract", "current", "contract"
    elif rel.startswith("tests/") or "/src/test/" in rel:
        source_class, retrieval_domain, domain = "test", "current", "testing"
    elif rel.startswith("docs/current-state/") or rel.startswith("docs/baseline/") or rel.startswith("docs/evidence/"):
        source_class, retrieval_domain, domain = "evidence", "current", metadata.get("domain", "current-state")
    elif rel.startswith("docs/architecture/adr/") or rel.startswith("docs/architecture/decision-log/") or rel.startswith("docs/architecture/overview/"):
        source_class, retrieval_domain, domain = "architecture", "normative", "architecture"
    elif rel.startswith("docs/architecture/"):
        source_class, retrieval_domain, domain = "architecture", "normative", "architecture"
    elif rel.startswith("docs/design/"):
        source_class, retrieval_domain, domain = "design", "normative", metadata.get("domain", "design")
    elif rel.startswith("docs/workflows/"):
        source_class, retrieval_domain, domain = "workflow", "normative", metadata.get("domain", "workflow")
    elif rel.startswith("docs/operations/"):
        source_class, retrieval_domain, domain = "operations", "normative", "operations"
    elif rel.startswith("docs/archive/") or rel.startswith("agent/archive/"):
        source_class, retrieval_domain, domain = "historical", "reference", "history"
    elif rel.startswith("docs/research/"):
        source_class, retrieval_domain, domain = "research", "reference", "research"
    elif rel.startswith("knowledge-sources/imported/"):
        source_class, retrieval_domain, domain = "external_reference", "reference", "external"
    elif rel.startswith("agent/plans/") or rel == "agent/backlog.yaml" or rel.startswith("agent/work-items/"):
        source_class, retrieval_domain, domain = "planning", "planning", "planning"
    elif rel.endswith("AGENTS.md") or rel == "agent/ownership.yaml" or rel == "agent/README.md":
        source_class, retrieval_domain, domain = "instruction", "normative", "governance"
    elif rel.startswith("docs/"):
        source_class, retrieval_domain, domain = "documentation", "normative", metadata.get("domain", "documentation")
    else:
        source_class, retrieval_domain, domain = "source", "current", "implementation"

    default_status = {
        "current": "implemented",
        "normative": "accepted",
        "planning": "proposed",
        "reference": "historical" if source_class == "historical" else "accepted",
    }[retrieval_domain]
    status = str(metadata.get("status", default_status)).lower()
    authority = float(AUTHORITY_CONFIG["source_class_weights"].get(source_class, 0.5))
    return {
        "source_class": source_class,
        "retrieval_domain": retrieval_domain,
        "domain": str(metadata.get("domain", domain)),
        "status": status,
        "authority_weight": authority,
        "document_id": metadata.get("id"),
        "document_type": metadata.get("document_type"),
        "version": metadata.get("version"),
        "effective_date": metadata.get("effective_date"),
    }


def chunk_text(text: str, max_chars: int = 3000, overlap: int = 240) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]
    paragraphs = re.split(r"\n\s*\n", text)
    result: list[str] = []
    current = ""
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(current) + len(paragraph) + 2 <= max_chars:
            current = f"{current}\n\n{paragraph}".strip()
            continue
        if current:
            result.append(current)
            prefix = current[-overlap:] if overlap else ""
            current = f"{prefix}\n\n{paragraph}".strip()
        else:
            for start in range(0, len(paragraph), max_chars - overlap):
                result.append(paragraph[start : start + max_chars])
            current = ""
    if current:
        result.append(current)
    return result


def markdown_chunks(text: str, base_line: int) -> list[dict]:
    lines = text.splitlines()
    heading_stack: list[str] = []
    sections: list[tuple[str, int, list[str]]] = []
    current_lines: list[str] = []
    current_start = base_line
    current_section = "Document"

    def flush() -> None:
        nonlocal current_lines
        body = "\n".join(current_lines).strip()
        if body:
            sections.append((current_section, current_start, current_lines[:]))
        current_lines = []

    for offset, line in enumerate(lines):
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if match:
            flush()
            level = len(match.group(1))
            heading_stack[:] = heading_stack[: level - 1]
            heading_stack.append(match.group(2).strip())
            current_section = " > ".join(heading_stack)
            current_start = base_line + offset
        current_lines.append(line)
    flush()

    output: list[dict] = []
    for section, start_line, section_lines in sections:
        body = "\n".join(section_lines)
        for index, piece in enumerate(chunk_text(body)):
            output.append({
                "section_path": section,
                "chunk_type": "markdown-section",
                "start_line": start_line,
                "end_line": start_line + len(section_lines) - 1,
                "text": piece,
                "part": index + 1,
            })
    return output


def openapi_chunks(text: str) -> list[dict]:
    matches = list(re.finditer(r"(?m)^  (/[^\n]+):\s*$", text))
    if not matches:
        return generic_chunks(text, "yaml")
    output = []
    preamble = text[: matches[0].start()].strip()
    if preamble:
        output.extend(generic_chunks(preamble, "openapi-preamble"))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start() : end].strip()
        operations = re.findall(r"(?m)^\s{4}(get|post|put|patch|delete):\s*$", block, re.I)
        operation_ids = re.findall(r"(?m)^\s+operationId:\s*([^\s#]+)", block)
        output.append({
            "section_path": match.group(1),
            "chunk_type": "openapi-operation",
            "start_line": text[: match.start()].count("\n") + 1,
            "end_line": text[:end].count("\n") + 1,
            "operation_id": operation_ids,
            "http_methods": [method.upper() for method in operations],
            "text": block,
            "part": 1,
        })
    return output


def json_chunks(text: str) -> list[dict]:
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return generic_chunks(text, "json")
    output: list[dict] = []
    if isinstance(value, dict):
        for key in ("$defs", "definitions"):
            if isinstance(value.get(key), dict):
                for name, definition in value[key].items():
                    rendered = json.dumps({name: definition}, ensure_ascii=False, indent=2)
                    output.append({"section_path": f"{key}.{name}", "chunk_type": "json-definition", "start_line": 1, "end_line": 1, "text": rendered, "part": 1})
        if output:
            header = {key: val for key, val in value.items() if key not in {"$defs", "definitions"}}
            output.insert(0, {"section_path": "root", "chunk_type": "json-root", "start_line": 1, "end_line": 1, "text": json.dumps(header, ensure_ascii=False, indent=2), "part": 1})
            return output
    return generic_chunks(json.dumps(value, ensure_ascii=False, indent=2), "json")


def code_chunks(text: str, language: str) -> list[dict]:
    lines = text.splitlines()
    output = []
    block_size = 100
    overlap = 10
    start = 0
    while start < len(lines):
        end = min(len(lines), start + block_size)
        body = "\n".join(lines[start:end]).strip()
        if body:
            symbols = re.findall(r"(?m)^\s*(?:public|private|protected|export|async|static|final|abstract|def|class|interface|record|function|const|let|var)[^\n{;]*", body)
            output.append({
                "section_path": symbols[0].strip()[:160] if symbols else f"lines-{start + 1}-{end}",
                "chunk_type": f"code-{language}",
                "start_line": start + 1,
                "end_line": end,
                "symbols": symbols[:8],
                "text": body,
                "part": 1,
            })
        if end == len(lines):
            break
        start = end - overlap
    return output


def generic_chunks(text: str, chunk_type: str) -> list[dict]:
    return [
        {"section_path": "document", "chunk_type": chunk_type, "start_line": 1, "end_line": text.count("\n") + 1, "text": piece, "part": index + 1}
        for index, piece in enumerate(chunk_text(text))
    ]


def make_chunks(path: Path, text: str, base_line: int) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".md" or path.name == "AGENTS.md":
        return markdown_chunks(text, base_line)
    if suffix in {".yaml", ".yml"} and "openapi" in path.parts:
        return openapi_chunks(text)
    if suffix == ".json":
        return json_chunks(text)
    if suffix in {".java", ".ts", ".tsx", ".js", ".mjs", ".py", ".ps1", ".sql"}:
        return code_chunks(text, suffix.lstrip("."))
    return generic_chunks(text, suffix.lstrip(".") or "text")


def iter_files() -> Iterable[Path]:
    for path in sorted(ROOT.rglob("*")):
        if is_included(path):
            yield path


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    SHARDS.mkdir(parents=True, exist_ok=True)

    sources = []
    records = []
    for path in iter_files():
        try:
            raw = path.read_bytes()
            text = raw.decode("utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        metadata, body, base_line = split_frontmatter(text)
        classification = classify(path, metadata)
        digest = sha256_bytes(raw)
        title = str(metadata.get("title") or path.stem)
        chunks = make_chunks(path, body, base_line)
        source_record = {
            "source": relative(path),
            "sha256": digest,
            "bytes": len(raw),
            "title": title,
            **classification,
            "chunks": len(chunks),
        }
        sources.append(source_record)
        for number, chunk in enumerate(chunks, start=1):
            chunk_id = sha256_bytes(f"{relative(path)}:{digest}:{number}:{chunk['text']}".encode("utf-8"))[:24]
            records.append({
                "id": chunk_id,
                "source": relative(path),
                "source_sha256": digest,
                "title": title,
                "chunk": number,
                **classification,
                **chunk,
            })

    buckets: dict[tuple[str, str], list[dict]] = {}
    for record in records:
        key = (record["retrieval_domain"], record["source_sha256"][0])
        buckets.setdefault(key, []).append(record)
    shards = []
    for (domain, bucket), items in sorted(buckets.items()):
        target = SHARDS / domain / f"{bucket}.jsonl"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(json.dumps(item, ensure_ascii=False, sort_keys=True) for item in items) + "\n", encoding="utf-8")
        shards.append({"path": target.relative_to(OUT).as_posix(), "retrieval_domain": domain, "chunks": len(items)})

    SOURCES_FILE.write_text("\n".join(json.dumps(item, ensure_ascii=False, sort_keys=True) for item in sources) + "\n", encoding="utf-8")
    manifest = {
        "schema_version": 3,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(ROOT),
        "source_of_truth": ["current code", "contracts", "tests", "runtime evidence", "reviewed docs"],
        "source_count": len(sources),
        "chunk_count": len(records),
        "domains": {domain: sum(1 for item in records if item["retrieval_domain"] == domain) for domain in sorted({item["retrieval_domain"] for item in records})},
        "classes": {kind: sum(1 for item in records if item["source_class"] == kind) for kind in sorted({item["source_class"] for item in records})},
        "shards": shards,
        "excluded": SOURCE_CONFIG["exclude_parts"] + SOURCE_CONFIG["exclude_names"] + SOURCE_CONFIG["exclude_prefixes"],
    }
    MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"sources={len(sources)} chunks={len(records)} shards={len(shards)}")


if __name__ == "__main__":
    main()
