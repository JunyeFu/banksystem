"""Build a small, dependency-free project RAG index from trusted local sources."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PKG = ROOT / "background information" / "银行AI测试系统_官方文档分类下载包_v1"
OUT = ROOT / "rag" / "index"
INDEX_FILE = OUT / "chunks.jsonl"
SHARDS = OUT / "shards"
SOURCES_FILE = OUT / "sources.jsonl"
MANIFEST_FILE = OUT / "manifest.json"

TEXT_EXTS = {
    ".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".java", ".ts", ".tsx",
    ".js", ".mjs", ".py", ".ps1", ".sh", ".xml", ".sql", ".properties", ".html", ".url",
    ".css", ".svg", ".conf", ".cnf", ".init", ".opts", ".cmd", ".example",
    ".lst", ".map", ".tsbuildinfo", ".pid",
}
TEXT_NAMES = {".gitignore", ".agnixignore", "LICENSE", "Dockerfile", "Makefile", "Procfile"}
SKIP_PARTS = {".git", "node_modules", "secrets", "backups", "downloaded_official_docs", "data"}
SKIP_NAMES = {".env", ".env.local", ".env.production"}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def allowed(path: Path) -> bool:
    if not path.is_file() or path.name in SKIP_NAMES or "rag" in path.parts or any(part in SKIP_PARTS for part in path.parts):
        return False
    # Register every remaining project file. Text-like files are chunked; binary
    # files receive a provenance record with size and SHA-256 instead of binary noise.
    return True


def chunks(text: str, size: int = 1800) -> list[str]:
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return []
    pieces = re.split(r"\n\s*\n", text)
    out: list[str] = []
    current = ""
    for piece in pieces:
        if len(current) + len(piece) + 2 <= size:
            current = f"{current}\n\n{piece}".strip()
        else:
            if current:
                out.append(current)
            current = piece[:size]
            remainder = piece[size:]
            while len(remainder) > size:
                out.append(current)
                current = remainder[:size]
                remainder = remainder[size:]
            if remainder:
                current += "\n" + remainder
    if current:
        out.append(current)
    return out


def source_kind(path: Path) -> str:
    p = rel(path)
    if p.startswith("background information/银行AI测试系统_官方文档分类下载包_v1/"):
        return "official-source-index"
    if p.startswith("background information/"):
        return "background-knowledge"
    if p.startswith("contracts/"):
        return "project-contract"
    if p.startswith("docs/") or p.startswith("agent/") or p.startswith("_implementation_plan/"):
        return "project-document"
    return "project-source"


def shard_key(item: dict) -> tuple[str, str]:
    return item["source_kind"], item.get("sha256", "0" * 64)[:1]


def binary_records(path: Path) -> list[dict]:
    """Keep provenance for non-text project assets without injecting binary noise."""
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    return [{
        "id": f"{digest[:12]}-binary",
        "source": rel(path),
        "source_kind": source_kind(path),
        "sha256": digest,
        "chunk": 1,
        "text": f"非文本背景资产：{rel(path)}；文件类型={path.suffix or '无扩展名'}；字节数={len(raw)}；SHA-256={digest}。原始二进制未直接写入 RAG 文本索引。",
    }]


def main() -> None:
    files = sorted(p for p in ROOT.rglob("*") if allowed(p))
    records = []
    for path in files:
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if path.name not in TEXT_NAMES and path.suffix.lower() not in TEXT_EXTS:
            records.extend(binary_records(path))
            continue
        text = raw.decode("utf-8", errors="replace")
        for number, body in enumerate(chunks(text), 1):
            records.append({
                "id": f"{digest[:12]}-{number}",
                "source": rel(path),
                "source_kind": source_kind(path),
                "sha256": digest,
                "chunk": number,
                "text": body,
            })
    # The source folder is intentionally removable. Preserve its already-built
    # snapshots on later rebuilds so deleting the source cannot erase knowledge.
    migrated = []
    if not (ROOT / "background information").exists():
        prior_files = []
        if INDEX_FILE.exists():
            prior_files = [INDEX_FILE]
        elif MANIFEST_FILE.exists():
            previous = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
            prior_files = [OUT / shard["path"] for shard in previous.get("shards", [])]
        for prior_file in prior_files:
            if not prior_file.exists():
                continue
            for line in prior_file.read_text(encoding="utf-8").splitlines():
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    # Ignore a damaged legacy shard record; current project
                    # files are rebuilt below and only valid migrated snapshots
                    # need to survive source-folder removal.
                    continue
                if item.get("source", "").startswith("background information/"):
                    migrated.append(item)
        records.extend(migrated)
    OUT.mkdir(parents=True, exist_ok=True)
    if SHARDS.exists():
        shutil.rmtree(SHARDS)
    buckets: dict[tuple[str, str], list[dict]] = {}
    for record in records:
        buckets.setdefault(shard_key(record), []).append(record)
    for (kind, bucket), items in sorted(buckets.items()):
        target = SHARDS / kind / f"{bucket}.jsonl"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in items), encoding="utf-8"
        )
    source_rows = {}
    for record in records:
        source_rows[record["source"]] = {
            "source": record["source"],
            "source_kind": record["source_kind"],
            "sha256": record["sha256"],
        }
    SOURCES_FILE.write_text(
        "".join(json.dumps(v, ensure_ascii=False) + "\n" for v in sorted(source_rows.values(), key=lambda x: x["source"])),
        encoding="utf-8",
    )
    if INDEX_FILE.exists():
        INDEX_FILE.unlink()
    shard_rows = [
        {"path": f"shards/{kind}/{bucket}.jsonl", "source_kind": kind, "chunks": len(items)}
        for (kind, bucket), items in sorted(buckets.items())
    ]
    manifest = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(ROOT),
        "source_of_truth": "project docs, contracts, current source evidence, and migrated background snapshots",
        "source_count": len(source_rows),
        "chunk_count": len(records),
        "migrated_snapshot_chunk_count": len(migrated),
        "source_kinds": {k: sum(1 for r in records if r["source_kind"] == k) for k in sorted({r["source_kind"] for r in records})},
        "shard_count": len(shard_rows),
        "shards": shard_rows,
        "excluded": sorted(SKIP_PARTS | SKIP_NAMES),
        "official正文状态": "已吸收当前 background information 中的文本快照；外部官方在线正文仍需按来源 URL 单独核验",
        "background_information_migrated": True,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
