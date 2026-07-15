"""Import a HiAgent help package into isolated external knowledge sources.

The original binaries go to a separate raw destination that remains excluded
from Git and RAG. Extracted Markdown goes to the imported destination and is
available only through the explicit reference retrieval profile.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from pypdf import PdfReader


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u00a0", " ")).strip()


def md_escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")


def docx_markdown(path: Path, title: str) -> tuple[str, int]:
    document = Document(path)
    lines = [f"# {title}", "", f"> 迁移来源：`raw/{path.name}`", ""]
    image_count = len(document.inline_shapes)
    if image_count:
        lines += [f"> 原文含 {image_count} 个内嵌图像；完整原件保存在 `raw/`，图像不作 OCR 推断。", ""]
    table_number = 0
    for paragraph in document.paragraphs:
        text = clean(paragraph.text)
        if not text:
            continue
        style = (paragraph.style.name if paragraph.style else "").lower()
        heading = re.search(r"heading\s*(\d+)|标题\s*(\d+)", style)
        if heading:
            level = int(heading.group(1) or heading.group(2))
            lines += [f"{'#' * min(level + 1, 6)} {text}", ""]
        else:
            lines += [text, ""]
    # python-docx does not expose paragraphs and tables in one ordered stream;
    # tables are still fully retained below, with every cell represented.
    for table in document.tables:
        table_number += 1
        lines += [f"## 表格 {table_number}", ""]
        for row_number, row in enumerate(table.rows, 1):
            cells = [md_escape(clean(cell.text)) for cell in row.cells]
            lines.append(f"- 行 {row_number}: " + " | ".join(cells))
        lines.append("")
    body = "\n".join(lines).strip() + "\n"
    return body, len(body)


def pdf_markdown(path: Path, title: str) -> tuple[str, int]:
    reader = PdfReader(str(path))
    lines = [f"# {title}", "", f"> 迁移来源：`raw/{path.name}`", ""]
    for number, page in enumerate(reader.pages, 1):
        text = clean(page.extract_text() or "")
        lines += [f"## 第 {number} 页", "", text or "[该页未提取到可检索文本；请查阅 raw 原件。]", ""]
    body = "\n".join(lines).strip() + "\n"
    return body, len(body)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path, help="extracted Markdown destination")
    parser.add_argument("--raw-destination", required=True, type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    destination = args.destination.resolve()
    raw_root = args.raw_destination.resolve()
    if not source.is_dir():
        raise SystemExit(f"source directory not found: {source}")
    if destination.exists() or raw_root.exists():
        raise SystemExit(f"destination already exists: {destination}")
    files = sorted(path for path in source.rglob("*") if path.is_file())
    if not files:
        raise SystemExit("source directory contains no files")
    records = []
    for item in files:
        relative = item.relative_to(source)
        raw_target = raw_root / relative
        raw_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, raw_target)
        if sha256(item) != sha256(raw_target):
            raise RuntimeError(f"copy hash mismatch: {relative}")
        text_target = destination / relative.with_suffix(".md")
        text_target.parent.mkdir(parents=True, exist_ok=True)
        if item.suffix.lower() == ".docx":
            body, characters = docx_markdown(item, item.stem)
        elif item.suffix.lower() == ".pdf":
            body, characters = pdf_markdown(item, item.stem)
        else:
            body = f"# {item.stem}\n\n> 迁移来源：`raw/{relative.as_posix()}`\n"
            characters = len(body)
        text_target.write_text(body, encoding="utf-8", newline="\n")
        records.append({
            "source_relative_path": relative.as_posix(),
            "source_sha256": sha256(item),
            "raw_relative_path": raw_target.relative_to(raw_root).as_posix(),
            "raw_sha256": sha256(raw_target),
            "markdown_relative_path": text_target.relative_to(destination).as_posix(),
            "markdown_sha256": sha256(text_target),
            "extracted_characters": characters,
            "file_type": item.suffix.lower(),
        })
    manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_package": str(source),
        "file_count": len(records),
        "files": records,
    }
    (destination / "migration-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    lines = ["# HiAgent 2.5.1 帮助文档知识源", "", "本目录是外部参考的可审阅文本；原始二进制保存在独立 raw 目录，默认不提交、不索引。当前 Codex/GPT 主开发链不会在默认检索域使用本资料。", "", "## 文件索引", ""]
    for record in records:
        lines.append(f"- `{record['markdown_relative_path']}`：来自 `{record['source_relative_path']}`，提取 {record['extracted_characters']} 字符。")
    (destination / "README.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps({"destination": str(destination), "file_count": len(records), "extracted_characters": sum(r["extracted_characters"] for r in records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
