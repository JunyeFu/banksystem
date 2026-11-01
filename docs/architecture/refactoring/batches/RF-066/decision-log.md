---
id: RF066-DECISIONS
title: RF-066 decision log
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-066 decision log

## 2026-10-21 S2 implementation decisions

User authorized production wiring, SDK drift repair, tests and review while preserving services. No active banksystem Node listener/process was found; the original15 bank containers retained. Root installed SDK1.30.0 differed from package/lock1.31.0. Downloaded only the official locked tarball, verified lock SHA-512 and absence of install hooks, renamed the old SDK for recovery, and restored the exact package without npm ci, scripts or native-module replacement. SDK dependency ranges are unchanged; original lock/package files are not rewritten.

The final per-entry resolution check found a second1.30.0 in Controller's private node_modules. Restored that copy using the same official archive verified against the Controller lock; retained its own recovery directory. MCP/Controller/CLI now each resolve their declared locked1.31.0, enforced by an added nested-install regression. Re-ran Contract18/18, Integration35/35, CLI30/30 and the existing20-case adapter matrix after this correction, rather than claiming the root-only repair was complete.

Reuse createProductionService, CurrentUser DPAPI checkpoints and the existing model invoker. A purpose-specific DPAPI store holds keys only; public profiles and all task state stay in Harness via MCP. Save/check/default are separate facts. Explicit injected environments are authoritative; only normal entry uses the trusted runtime-file loader. Controller/MCP namespaces must match. Saving does not grant LIVE: actual readiness retains authorizedIdentity, managed fingerprints and product doctor.

RF067's existing producer scope adds one immutable-submission lookup, continuation projection and optional single-image filename metadata, not direct SQLite in CLI or another ledger. Metadata1.1 has11 tools; execution /mcp remains39. No migration. HTTP OpenAPI1.1 comes from source schemas, with required blockingReasons/result, binary image import and turn-scoped evidence/download.

An explicit direct-service input method continues the same checkpoint/Journey via journey_input_submit and existing decision/execution methods, without continueSession's fork or a new proposal gate. Missing launch facts ask for input before model invocation. Duplicate IDs read original snapshots after source/model drift. Only the task's pending-input lineage reaches authoring, not the conversation history; image receipt/name survive clarification.

Tool events come from actual MCP invocation points; failed/unknown calls never emit TOOL_FINISHED. Preserve Journey/checkpoint refs before verification. PASSED requires the existing verifier and exact turn identity/run/task match. Abort is not Worker cancellation or rollback. Ambiguous transport is INTERRUPTED; deterministic rejection FAILED. Restart queries authority and never auto-dispatches.

New runtime files and the owned web launcher join the existing v4 identity manifest, without freezing or authorization. Loopback18790 is registered/reserved, not running. Static/API CSP differ; no arbitrary file or browser service-token exposure. The launcher stops only its recorded PID after exact executable/entry/creation-time ownership checks.

2026-10-19 user confirmed Figma v2 and requested code analysis, task refinement and implementation while preserving services. Register RF066 as a new browser entry capability, not an expansion of RF065 image-risk closure.

Bottom-up facts: safeSession is metadata-only; encrypted continuation forks checkpoint IDs; model settings are environment-only; Quality must stay read-only. These facts are reflected in S1-S5, this batch and the unique order entry. The Figma transport outage is an external implementation blocker, not a repository defect or evidence of missing account permission.

User explicitly chose waiting for the Figma connection. No screenshot-only fallback is authorized. The initial governance check rejected six allowed modules and a not-yet-created contract path. Split into RF066 (CLI/Controller), RF067 (Harness/MCP), and RF068 (frontend); exact future contract creation is constrained in S1 while the batch permits the existing contracts/openapi directory. Five task packages retain one unique order; no implementation was attempted to bypass the failed control check.

Figma restored in this continuation: approved native full contexts/screenshots obtained, without local-preview substitution. S1 uses the installed Zod 4.4.3 boundary schemas to generate the sole OpenAPI artifact; no dependency installation or second DTO authority. HTTP validates and dispatches only; real service composition stays in S2, generated frontend consumers in RF068. Review added explicit bounded history/event paging against observed Harness/MCP output limits. Controller stop is reported as a request, never a banking rollback. Original Docker services/volumes and current model/identity remain untouched.

用户要求细化前端接入后，将S2补成六项具体接线工作，增加同一OpenAPI的拟加法而非新增平行合同。预算估计调整为32变更/24新增/6000行，覆盖既有生成OpenAPI、生产组合/DPAPI/事件与附件证据、其合同/集成测试和控制文件；保持合同最多1份、迁移0、同时模块最多2。此为计划预算，不是已实现代码量；超界仍须调整控制链，不能借前端批次改后台。


