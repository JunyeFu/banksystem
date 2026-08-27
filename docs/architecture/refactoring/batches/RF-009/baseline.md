---
id: DOC-ARCH-RF009-BASELINE
title: RF-009 Isolated Agent Controller Baseline
document_type: evidence
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-009 Isolated Agent Controller Baseline

RC-G0 was captured read-only from `D:/Agent/banksystem` on 2026-08-25 10:06 +08:00.

| Fact | Current value |
|---|---|
| Branch / HEAD | `main` / `9d79b7c1e6cfedd995093cc7a378dc8e9218fa98` |
| Primary remote | `github=https://github.com/JunyeOvO/banksystem.git` |
| Dirty file-level records before RF-009 | 212 |
| TP-00 path-set digest | `419a2aab8c60826f3f298b5677bc92d18b01e885fd438a91f1a14a8a82f5095b` |
| ReleaseIdentity | `02ae6b18ed678415488db431f1c271ec258ec6475a1414864731d495a8d81dc4` |
| Formal ledger | `0/18`, 228 historical stale records |
| Runtime | `UNAVAILABLE`; no services are started by this batch |
| Publication | cached readback exists but is stale; no publication occurs in this batch |
| Free space on D | 450,259,087,360 bytes |

The exact pre-existing dirty path ownership is delegated to `agent/plans/active/hengzhun-i10-tp00-change-inventory-v1.json`. RF-009 owns only its allowlisted governance files and the new isolated experiment directory. All other dirty content is preserved as user/pre-existing work.

Current static migration sizing (not runtime acceptance): Agentflow v7 has 345 nodes and 395 edges; the governed MCP contract has 33 tools. These values are re-derived in S1 evidence and are not treated as permanent constants.
