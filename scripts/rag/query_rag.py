"""Weighted lexical retrieval over the generated local RAG index."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RAG_ROOT = ROOT / "rag"
INDEX_ROOT = RAG_ROOT / "index"
MANIFEST = INDEX_ROOT / "manifest.json"
CONFIG = RAG_ROOT / "config"


def load_config(name: str) -> dict:
    return json.loads((CONFIG / name).read_text(encoding="utf-8"))


AUTHORITY = load_config("authority.yaml")
PROFILES = load_config("retrieval-profiles.yaml")["profiles"]
SYNONYMS = load_config("synonyms.yaml")["groups"]


def raw_terms(value: str) -> list[str]:
    lowered = value.lower().strip()
    output = [token for token in re.findall(r"[a-z0-9_./:-]+", lowered) if len(token) >= 2]
    for phrase in re.findall(r"[\u4e00-\u9fff]+", lowered):
        if len(phrase) <= 2:
            output.append(phrase)
        else:
            output.append(phrase)
            output.extend(phrase[index : index + 2] for index in range(len(phrase) - 1))
    return list(dict.fromkeys(output))


def terms(value: str) -> list[str]:
    output = raw_terms(value)
    lowered = value.lower()
    for group in SYNONYMS:
        if any(alias.lower() in lowered for alias in group):
            for alias in group:
                output.extend(raw_terms(alias))
    return list(dict.fromkeys(output))


def lexical_score(item: dict, query: str, query_terms: list[str]) -> float:
    body = item["text"].lower()
    title = str(item.get("title", "")).lower()
    path = item["source"].lower()
    section = str(item.get("section_path", "")).lower()
    score = 0.0
    for term in query_terms:
        factor = 1.0 + min(len(term), 12) / 12.0
        # BM25-like saturation: repeated boilerplate must not outrank a precise
        # title/path/section match simply because a source file is long.
        score += min(body.count(term), 4) * factor
        if term in title:
            score += 5.0 * factor
        if term in section:
            score += 3.0 * factor
        if term in path:
            score += 2.5 * factor
    if query.lower() in body or query.lower() in title:
        score += 8.0
    return score


def allowed(item: dict, profile: dict) -> bool:
    if item["retrieval_domain"] not in profile["retrieval_domains"]:
        return False
    if item.get("status") in profile.get("excluded_statuses", []):
        return False
    include_classes = profile.get("source_classes")
    return not include_classes or item["source_class"] in include_classes


def search(query: str, profile_name: str = "current", limit: int = 8) -> list[dict]:
    if not MANIFEST.exists():
        raise FileNotFoundError("RAG index is missing; run scripts/rag/build_rag.py")
    if profile_name not in PROFILES:
        raise ValueError(f"Unknown profile: {profile_name}")
    profile = PROFILES[profile_name]
    query_terms = terms(query)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    candidates = []
    for shard in manifest["shards"]:
        if shard["retrieval_domain"] not in profile["retrieval_domains"]:
            continue
        shard_path = INDEX_ROOT / shard["path"]
        for line in shard_path.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            if not allowed(item, profile):
                continue
            raw = lexical_score(item, query, query_terms)
            if raw <= 0:
                continue
            status_weight = float(AUTHORITY["status_weights"].get(item.get("status", "draft"), 0.5))
            domain_boost = float(profile.get("domain_boosts", {}).get(item["retrieval_domain"], 1.0))
            class_boost = float(profile.get("class_boosts", {}).get(item["source_class"], 1.0))
            intent_boost = 1.0
            if any(marker in query.lower() for marker in ("为什么", "原则", "架构", "决定", "规范", "规则", "状态机")) and item["retrieval_domain"] == "normative":
                intent_boost *= 1.25
            if any(marker in query.lower() for marker in ("当前", "已实现", "运行", "代码")) and item["retrieval_domain"] == "current":
                intent_boost *= 1.20
            score = raw * float(item.get("authority_weight", 0.5)) * status_weight * domain_boost * class_boost * intent_boost
            candidates.append({"score": round(score, 6), **item})

    candidates.sort(key=lambda item: (-item["score"], item["source"], item["chunk"]))
    per_source: defaultdict[str, int] = defaultdict(int)
    results = []
    for item in candidates:
        if per_source[item["source"]] >= int(profile.get("max_chunks_per_source", 2)):
            continue
        results.append(item)
        per_source[item["source"]] += 1
        if len(results) >= limit:
            break
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query", nargs="+")
    parser.add_argument("--profile", default="current", choices=sorted(PROFILES))
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    query = " ".join(args.query).strip()
    results = search(query, args.profile, args.limit)
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return
    for item in results:
        print(
            f"[{item['score']:.2f}] {item['source']}#{item['chunk']} "
            f"({item['source_class']}/{item['retrieval_domain']}, status={item['status']}, sha={item['source_sha256'][:12]})"
        )
        print(item["text"][:700].replace("\n", " "))
        print()


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from exc
