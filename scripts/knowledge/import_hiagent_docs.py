#!/usr/bin/env python3
"""Extract the HiAgent 2.5.1 help package into RAG-controlled Markdown.

The raw DOCX/PDF package stays outside the RAG source set until the generated
Markdown, manifest and RAG validation have been verified.  Use --delete-raw
only after those checks have passed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
from datetime import date
from pathlib import Path

from docx import Document
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RAW = ROOT / "knowledge-sources" / "raw" / "hiagent-2.5.1"
DEFAULT_OUTPUT = ROOT / "knowledge-sources" / "imported" / "hiagent-2.5.1"
SUPPORTED = {".docx", ".pdf"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clean(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text.replace("\r\n", "\n").replace("\r", "\n")).strip()


def title_from_path(path: Path) -> str:
    return path.stem.replace("_", " ").strip() or "HiAgent 帮助文档"


def extract_docx(path: Path) -> str:
    document = Document(path)
    blocks: list[str] = []
    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        style_name = (getattr(paragraph.style, "name", "") or "").strip()
        style = style_name.lower()
        if "heading" in style or "标题" in style_name:
            level_match = re.search(r"(\d+)", style_name)
            level = min(int(level_match.group(1)), 6) if level_match else 2
            blocks.append(f"{'#' * level} {text}")
        else:
            blocks.append(text)
    for table_index, table in enumerate(document.tables, start=1):
        rows = []
        for row in table.rows:
            cells = [re.sub(r"\s+", " ", cell.text).strip().replace("|", "\\|") for cell in row.cells]
            if any(cells):
                rows.append(cells)
        if not rows:
            continue
        width = max(len(row) for row in rows)
        rows = [row + [""] * (width - len(row)) for row in rows]
        blocks.append(f"## 表格 {table_index}")
        blocks.append("| " + " | ".join(rows[0]) + " |")
        blocks.append("| " + " | ".join(["---"] * width) + " |")
        blocks.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return clean("\n\n".join(blocks))


def extract_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = []
    for number, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append(f"## 第 {number} 页\n\n{text}")
    return clean("\n\n".join(pages))


def extract(path: Path) -> str:
    if path.suffix.lower() == ".docx":
        return extract_docx(path)
    if path.suffix.lower() == ".pdf":
        return extract_pdf(path)
    raise ValueError(f"Unsupported file type: {path.suffix}")


def markdown_document(source: Path, source_root: Path, content: str) -> str:
    relative = source.relative_to(source_root).as_posix()
    source_hash = sha256(source)
    title = json.dumps(title_from_path(source), ensure_ascii=False)
    source_json = json.dumps(relative, ensure_ascii=False)
    return clean(
        f"""---
id: HIAGENT-251-{source_hash[:16].upper()}
title: {title}
document_type: external-reference
domain: hiagent
status: reference
authority: external
version: 2.5.1
effective_date: 2026-07-16
source_file: {source_json}
source_sha256: {source_hash}
extraction_method: {source.suffix.lower().lstrip('.')}
---

# {title_from_path(source)}

> 外部参考资料：HiAgent 2.5.1 帮助文档。仅供项目开发阶段检索，不得覆盖本项目当前架构、契约、代码、测试或运行证据；不得作为交付系统运行时知识来源。

## 提取正文

{content}
"""
    ) + "\n"


def write_readme(root: Path, manifest: list[dict]) -> None:
    rows = "\n".join(
        f"| `{item['source']}` | `{item['target']}` | {item['characters']} | `{item['sha256'][:12]}` |"
        for item in manifest
    )
    body = f"""---
id: HIAGENT-251-IMPORT-INDEX
title: HiAgent 2.5.1 帮助文档导入索引
document_type: external-reference-index
domain: hiagent
status: reference
authority: external
version: 2.5.1
effective_date: 2026-07-16
---

# HiAgent 2.5.1 帮助文档导入索引

本目录由 `scripts/knowledge/import_hiagent_docs.py` 从原始帮助包提取。它是开发 RAG 的外部参考来源，权重低于项目契约、代码、测试、运行证据和当前架构；不属于 Coze/Harness/Midscene/衡准的运行时知识来源。

- 原始文件数：{len(manifest)}
- 提取文件数：{len(manifest)}
- 原始清单：`migration-manifest.json`

| 原始文件 | 可检索 Markdown | 字符数 | 原始 SHA-256 前缀 |
|---|---|---:|---|
{rows}
"""
    (root / "README.md").write_text(body, encoding="utf-8", newline="\n")


def build(raw_root: Path, output_root: Path) -> list[dict]:
    files = sorted(path for path in raw_root.rglob("*") if path.is_file() and path.suffix.lower() in SUPPORTED)
    if not files:
        raise RuntimeError(f"No DOCX/PDF files found under {raw_root}")
    output_root.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix="hiagent-2.5.1-", dir=output_root.parent))
    manifest: list[dict] = []
    try:
        for source in files:
            relative = source.relative_to(raw_root)
            target = staging / relative.with_suffix(".md")
            target.parent.mkdir(parents=True, exist_ok=True)
            content = extract(source)
            if not content:
                raise RuntimeError(f"No extractable text: {source}")
            target.write_text(markdown_document(source, raw_root, content), encoding="utf-8", newline="\n")
            manifest.append({
                "source": relative.as_posix(),
                "target": relative.with_suffix(".md").as_posix(),
                "sha256": sha256(source),
                "characters": len(content),
                "status": "extracted",
            })
        (staging / "migration-manifest.json").write_text(
            json.dumps({"source_root": raw_root.as_posix(), "generated_on": str(date.today()), "files": manifest}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        write_readme(staging, manifest)
        if output_root.exists():
            shutil.rmtree(output_root)
        staging.replace(output_root)
        return manifest
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--delete-raw", action="store_true", help="Delete raw source only after a successful extraction.")
    args = parser.parse_args()
    raw_root = args.raw.resolve()
    output_root = args.output.resolve()
    if not raw_root.is_dir():
        raise SystemExit(f"Raw directory does not exist: {raw_root}")
    manifest = build(raw_root, output_root)
    if args.delete_raw:
        shutil.rmtree(raw_root)
    print(f"HIAGENT_IMPORT=PASS files={len(manifest)} output={output_root}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"HIAGENT_IMPORT=FAIL {error}", file=sys.stderr)
        raise SystemExit(1)
