---
id: DOC-ARCH-RF020-CONTRACT
title: RF-020 Contract Delta
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-020 Contract Delta

Add the `hz-agent` command grammar, `hengzhun-cli-event/v1` JSONL envelope and fixed exit-code registry. Headless writes exist only behind explicit `resume --approve|--reject --proposal <id>` commands. `--yes`, unknown options, mixed approve/reject, missing JSONL mode and unsafe file inputs fail closed.
