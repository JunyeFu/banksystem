---
id: DOC-ARCH-RF055-BASELINE
title: RF-055 test support and demo identity baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-055 baseline

RF-054 REVIEW is the recovery point. `contracts/fixtures/baseline-fixtures.yaml` and a classpath copy are duplicate authorities; `TestSupportController` owns fixture parsing, Fineract orchestration and Channel cleanup; it runs on the main listener under the default `local` profile; default Compose starts Mock Clearing; demo identities are created per run instead of being fixed preparation output. ReleaseIdentity is unfrozen.

RC-G0: repository `D:\Agent\banksystem`, branch `main`, HEAD `552b3b8ac517bd5991bff446e72d9f4e87ea9543`, GitHub remote `https://github.com/JunyeFu/banksystem.git`. The inherited dirty tree predates RF-055 and must be preserved. Fifteen project containers were running at capture time; thirteen reported healthy and the two without health checks were running. Runtime ReleaseIdentity is `UNFROZEN`.
