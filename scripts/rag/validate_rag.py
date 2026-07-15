"""Validate index hygiene and expected-source retrieval over golden queries."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from query_rag import search


ROOT = Path(__file__).resolve().parents[2]
RAG = ROOT / "rag"
INDEX = RAG / "index"
GOLDEN = RAG / "eval" / "golden-queries.yaml"
REPORT = RAG / "eval" / "reports" / "latest.json"
MIN_RECALL = 0.95
MIN_TOP1 = 0.85
MIN_MRR = 0.90


def main() -> None:
    manifest = json.loads((INDEX / "manifest.json").read_text(encoding="utf-8"))
    sources = [json.loads(line) for line in (INDEX / "sources.jsonl").read_text(encoding="utf-8").splitlines() if line]
    banned_parts = {".env", "secrets", "data", "logs", "runs", "deliverables", "knowledge-sources/raw"}
    hygiene_errors = []
    for item in sources:
        source = item["source"]
        if any(part in source.split("/") for part in banned_parts) or source.startswith("knowledge-sources/raw/"):
            hygiene_errors.append(source)

    cases = json.loads(GOLDEN.read_text(encoding="utf-8"))["cases"]
    results = []
    passed = 0
    top1 = 0
    reciprocal_rank = 0.0
    for case in cases:
        hits = search(case["query"], case.get("profile", "current"), case.get("limit", 8))
        paths = [hit["source"] for hit in hits]
        ranks = [paths.index(expected) + 1 for expected in case["expected_sources"] if expected in paths]
        rank = min(ranks) if ranks else 0
        expected_hit = rank > 0
        forbidden_hit = any(any(path.startswith(prefix) for prefix in case.get("forbidden_prefixes", [])) for path in paths)
        ok = expected_hit and not forbidden_hit
        passed += int(ok)
        top1 += int(rank == 1 and not forbidden_hit)
        reciprocal_rank += (1.0 / rank) if rank and not forbidden_hit else 0.0
        results.append({"id": case["id"], "ok": ok, "rank": rank, "query": case["query"], "profile": case.get("profile", "current"), "expected": case["expected_sources"], "hits": paths, "forbidden_hit": forbidden_hit})

    recall = passed / len(cases) if cases else 0.0
    top1_rate = top1 / len(cases) if cases else 0.0
    mrr = reciprocal_rank / len(cases) if cases else 0.0
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manifest": {"sources": manifest["source_count"], "chunks": manifest["chunk_count"], "domains": manifest["domains"]},
        "golden_cases": len(cases),
        "passed": passed,
        "expected_source_recall_at_8": recall,
        "expected_source_top1_rate": top1_rate,
        "mean_reciprocal_rank": mrr,
        "hygiene_errors": hygiene_errors,
        "results": results,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    failures = [item for item in results if not item["ok"]]
    if hygiene_errors or recall < MIN_RECALL or top1_rate < MIN_TOP1 or mrr < MIN_MRR:
        print(f"RAG_VALIDATION=FAIL recall={recall:.3f} top1={top1_rate:.3f} mrr={mrr:.3f} passed={passed}/{len(cases)} hygiene={len(hygiene_errors)}")
        for failure in failures:
            print(f"{failure['id']}: expected={failure['expected']} hits={failure['hits']} forbidden={failure['forbidden_hit']}")
        raise SystemExit(1)
    print(f"RAG_VALIDATION=PASS recall={recall:.3f} top1={top1_rate:.3f} mrr={mrr:.3f} passed={passed}/{len(cases)} sources={manifest['source_count']} chunks={manifest['chunk_count']}")


if __name__ == "__main__":
    main()
