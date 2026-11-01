---
id: DOC-ARCH-RF057-VERIFY
title: RF-057 verification plan
document_type: verification-plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# Verification

Run S1-S4 serially. CONTRACT tests cover load statistics with controlled local HTTP responses only. LIVE_BANK uses actual APIs and browser. LIVE_AGENT uses actual BYOK and the same real bank. PERFORMANCE uses real services without LLM calls except separately measured Agent authoring. Run governance/docs after control edits. Required final evidence includes all manifest cases, exact source identity, environment/hardware, complete failed/timeout counts, fund conservation and evidence hashes.

Load: read concurrency 1/5/10/20, 120s each; payment concurrency 1/5/10, <=100 transactions per stage, CNY 1 each; same-key 20 concurrent requests; document same-version 20; Agent 1/2/4 read-only tasks; read soak 10 concurrent for 1800s. Goals: read p95 <=1000ms, page READY p95 <=3000ms, settlement p95 <=15000ms, unexpected errors <=1%, money invariants 100%. Report p99 sample count, queue waits and actual offered/completed throughput. These are approved test goals, not prior measurements. A closed-loop load must be labeled as such; it does not claim fixed-rate capacity.
