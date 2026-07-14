"""Lexical retrieval over the generated local RAG index."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parents[2]
INDEX_ROOT = ROOT / "rag" / "index"
MANIFEST = INDEX_ROOT / "manifest.json"


def terms(value: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9_./:-]+|[\u4e00-\u9fff]", value.lower())
    return [w for w in words if len(w) > 1 or "\u4e00" <= w <= "\u9fff"]


def main() -> None:
    query = " ".join(sys.argv[1:]).strip()
    if not query:
        raise SystemExit("用法: python scripts/rag/query_rag.py <问题>")
    q = terms(query)
    results = []
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for shard in manifest["shards"]:
        shard_path = INDEX_ROOT / shard["path"]
        for line in shard_path.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            body = item["text"].lower()
            score = sum(body.count(term) for term in q)
            if score:
                results.append((score, item))
    for score, item in sorted(results, key=lambda x: (-x[0], x[1]["source"]))[:8]:
        print(f"[{score}] {item['source']}#{item['chunk']} ({item['source_kind']})")
        print(item["text"][:700].replace("\n", " "))
        print()


if __name__ == "__main__":
    main()
