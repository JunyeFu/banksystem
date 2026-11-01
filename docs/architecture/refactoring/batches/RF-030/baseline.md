---
id: DOC-ARCH-RF030-BASELINE
title: RF-030 Baseline
document_type: baseline
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# RF-030 Baseline

The current seed creates random fixture subjects and random Fineract client external IDs on every call, selects the first savings account, and ignores approve or activate failures. Identity lookup depends on a random subject prefix and newest-row ordering. The root golden-path command is not implemented; this batch does not implement that command.
