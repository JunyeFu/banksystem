---
id: RF067-DECISION-LOG
title: RF-067 Decisions
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-067 Decisions

## 2026-10-21 RF066-S2 producer completion

Before editing, refine the existing producer task for workbench_submission_get (read-only, namespace/conversation-bound immutable request), projection of the existing continuation_of_turn_id column and optional single-image originalFilename metadata. Metadata1.1.0 has11 tools; /mcp remains39 and the model never sees metadata tools. No migration or execution action. This supports original submission replay after source/model drift and same-Journey clarification, not a new state store. Tests cover foreign namespace/conversation and actual MCP consumers. The test fixture pins attachment storage to its temporary root before Harness construction and restores its environment afterward; binary import never writes original .data/attachments. Original databases remain unopened.

## 2026-10-21 implementation and review

Explicit user request authorizes this package, not next-package implementation or production cutover. The complete control chain was present. Additive migration044 only; Repository owns its SQL and uses existing queued immediate write transactions plus read snapshots. Models retain immutable versions/key references; turn binding and request are immutable. submissionId returns one created=true claim and never dispatches execution. Continuations retain the prior model/identity/Journey.

Preserve the existing exclusive 39-tool contract/version: ten metadata operations use /mcp/workbench in the same authenticated process, not the model allowlist or a new port. Zod source generates the single versioned MCP artifact; real producer/consumer tests check it. Project history/events within 64KiB pages and the existing 128KiB scoped transport cap; do not raise global budgets or truncate text.

Review fixes: read projections now use one SQLite snapshot; invalid configured namespace fails before opening/migrating a DB; known credential patterns including URL userinfo are rejected rather than persisted. Strict DTOs reject unknown key/reasoning fields. These do not claim universal natural-language PII detection: the future Controller still owns safe summary/context generation.

First test run found a Windows EBUSY cleanup defect in the two-connection test: a later after-hook closed the second handle after the fixture tried deleting SQLite. Close the second handle in finally before fixture cleanup; no retry or catch-to-success added. Registry ordering was initially wrong and corrected; complete test discovery now passes. These were test/control defects, not live banking failures.

The existing SDK install drift (1.30.0 versus locked1.31.0) was detected by an existing compatibility check and retained. Official exact-version metadata/integrity/hooks/disk impact were reviewed, then a separate temporary SDK1.31.0 mirror passed37 tests. Original node_modules/lock/package files and processes were not replaced. There is no claim of all original-environment checks green.

The review was a separate acceptance-oriented pass by this agent using source/contract counterexamples, not a second person or human sign-off. S1 closes its source/isolated gates; batch remains SHADOW_VERIFIED, next RF066-S2 may begin only its own scoped work, production identity/dependency/cutover gates remain.

Final impact scan found one existing candidate-DSL upgrade test still asserting terminal migration43. A focused red run confirmed44!=43 with all candidate/foreign-key/immutability checks preceding it intact. Change only that expected current schema number to44; retain all older-record/protection assertions. This necessary migration consumer adds one changed verification file, so maxChangedFiles is25 (previous24), with other budgets unchanged. This is not dropping a failing test or expanding business refactoring.

2026-10-19: split metadata persistence from browser/Controller work so this batch opens at most Harness and MCP. Dependency and execution order remain only in v54-implementation-batches.md.

