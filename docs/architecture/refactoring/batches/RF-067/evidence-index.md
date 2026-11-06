---
id: RF067-EVIDENCE-INDEX
title: RF-067 Evidence
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

2026-11-05授权会话增量：新增045与专用/mcp/sessions，Harness SQLite为密文/revision唯一写入者，原11项元数据工具及主执行工具目录不扩给模型。隔离双进程CAS、迁入与分页通过，原库备份后切至45/45，101份密文导入且原文件摘要不变。最终H1c76996e…ca3e94d的真实S5刷新/重启不重派通过。详见[修复回执](../../../../evidence/platform/agent-interview-repair-2026-11-05.md)；不改写以下历史SDK/隔离记录，不提升正式发布。

2026-10-24补充MCP Journey error脱敏投影：保留errorCode/category/recoverable，剔除供应商正文；真实MCP隔离传输及Controller错误消费回归通过，Integration41＋1、CLI76通过。无新增工具/迁移/银行写入。实机验收归RF068-S5，当前因工具拒绝托管启动而未运行新身份LIVE；见[专项执行回执](../RF-068/S5-repair-execution-20261023.md)。

# RF-067 Evidence

## 2026-10-23 S5只读执行快照补充

按原S1补充任务，仅在WorkbenchRepository增加executionSnapshot，供可信本机验收脚本按namespace+Journey读取完整run/task、attempt_count、run.claim和turn绑定。查询处于一个只读事务，不增加HTTP/MCP工具、迁移、写入或第二个状态源。新增真实SQLite查询反例覆盖201条背景记录后新增目标run、无关Journey与跨namespace；最终Integration39/39＋runtime1/1通过。原停止状态转换不变。运行验收见[RF068-S5修复回执](../RF-068/S5-repair-execution-20261023.md)。

## RF066-S2 producer revalidation — 2026-10-21

The original1.0/ten-tool and SDK-drift receipts below are historical. The scoped producer supplement now emits metadata1.1.0 with11 tools: immutable submission lookup (read-only, bound namespace/conversation), existing continuation-column projection and optional single-image filename snapshot. No migration or execution tool was added. /mcp remains39 tools, independent of /mcp/workbench. Same-source generated schema/real HTTP/MCP consumers and foreign-scope counterexamples are exercised by the final shared Integration runner: exit0,35/35. Public Contract runner18/18 also passes. RF066-S2 restored both installed root and nested Controller SDK1.30.0 to each existing lock1.31.0, with recovery directories retained; all three entrypoint resolutions now match. No original DB, banking container, credentials or live model used. Batch remains SHADOW_VERIFIED, not production CUTOVER. Detailed commands and review findings are in the RF066 evidence index.

Historical planning snapshot (2026-10-19): source/control planning only; implementation/runtime scopes were unexecuted then. The Figma failure/waiting choice below is not a current blocker. Later implementation receipts distinguish isolated integration from LIVE.

## Control verification 2026-10-19

- Actual `python scripts/architecture/validate_refactoring.py --batch RF-067`: exit 0, REFACTOR_VALIDATION=PASS.
- Shared docs validation: exit 0. This is not migration, persistence, MCP or restart verification; implementation remains blocked.

## Dependency update 2026-10-19

Figma high-fidelity context has been read successfully, and RF066-S1 completed its 14-case contract/characterization gate. The connector blocker is resolved; RF067 is READY in the sole backlog. No migration, MCP persistence implementation or restart acceptance has been executed yet. Next slice must honor the frozen HTTP history/event paging and existing Harness/MCP output budgets.

## 前端前置包细化（非实现证据）

补齐迁移/Repository、原子submission去重、版本与绑定、字节预算分页、MCP认证及隔离重启五项实现步骤，明确文件白名单与待实现Integration命令。未执行迁移或运行服务，不将计划验收记为持久化已完成。

## RF067-S1 actual implementation, 2026-10-21

Earlier planning paragraphs are historical. This section records actual source and isolated execution, not production migration or Agent LIVE.

| Evidence level | Actual result | What it establishes |
| --- | --- | --- |
| STATIC | TypeScript typecheck and generate:dist exit0 | New Harness code compiles with the existing pinned Node20 toolchain |
| CONTRACT | RF066 browser contract/characterization14/14; metadata generated-artifact check PASS | Existing DTOs preserved; new ten-operation metadata contract matches producer |
| INTEGRATION | New persistence/MCP suites19/19 | Real SQLite migration/transactions/readback, real HTTP/MCP transport, two-process claim and fresh-process history |
| EXACT SDK | SDK1.31.0 isolated mirror37/37 (19 new +18 existing compatibility cases) | Compatibility with the declared SDK; not an in-place dependency repair or full clean-clone result |
| REGISTRY | 108 registered /104 CI-runnable /2 governed-runtime /2 historical-only | New suites are discoverable, not forgotten standalone green tests |
| REGRESSION | Journey evidence/migration consumer + Harness listener24/24 | Existing evidence, feedback, schedules, immutable candidate records and loopback boundary retained |
| LIVE_E2E | NOT_RUN | No BYOK/model, bank action, identity freeze, formal28 or release GO |

### Scope and reviewed invariants

- 044 preserves pre-044 namespace rows and all previous migration names/checksums, produces the existing pre-migration backup, and passes SQLite integrity checks in a temporary database. Original databases/volumes are never opened or migrated.
- Stable conversation/turn/message identities; first safe goal generates a short title. Same submission replay returns the original turn with created=false; conflicting content409; same-conversation competing work409. Actual concurrent Node processes observed one created=true claim.
- Model/key references retain immutable versions. Profile/default edits do not alter existing task bindings; NEEDS_INPUT continuation keeps the old model version/ReleaseIdentity/Journey. Plaintext key fields, recognized credentials and private-reasoning fields are rejected.
- Event sequence/version fencing and append-only storage; immutable execution references and paired Run/Task linkage. STOP_REQUESTED/INTERRUPTED are explicit, not rollback/success. Repository does not create PASSED, dispatch tools or become an independent execution ledger.
- 15,000-character Unicode messages and long event streams traverse count/byte-budget pages with exact text preserved. History embeds turn summaries, not repeated answers/all events. Repeated Repository reads make zero data changes; existing HTTP security auditing still appends its pre-existing auth records.
- Real bearer/namespace failures are401/403; foreign IDs/anchors do not reveal other tenants. The new metadata surface lists10 tools, the original surface still39. New operations do not join model-visible execution tools. Three review-counterexample cases validate contradictory states, stale configurations and browser DTO compatibility.

### Failures retained and resolution

1. Initial new suite12/13: Windows test fixture cleanup EBUSY due second connection hook ordering. Fixed finally-close order; later full suite19/19 passes.
2. Initial registry check TEST_MANIFEST_NOT_SORTED: moved only the two new entries before worker-*; later registry complete.
3. Existing compatibility suite on original install17/18: installedSDK1.30.0 differs from declared/locked1.31.0. Not suppressed or repaired in-place. Exact-version integrity matches official registry; isolated SDK1.31.0 test mirror final37/37 passes. Original drift remains for production entry.
4. First mirror31/34 lacked genuine generated dist/contracts assets; copied those build artifacts, not invented fixtures; final37/37 includes the later review cases. No assertion was weakened.
5. Impact scan found an existing candidate-DSL upgrade test hard-coded to43. Focused red confirmed44!=43; changed only the current schema expectation to44, retaining old-record, foreign-key and immutability assertions. Full Journey evidence suite plus loopback listener24/24 passed; the required extra consumer file is reflected in the25-file budget.

### Review outcome and remaining boundary

S1 source/isolated acceptance is complete; batch remains SHADOW_VERIFIED, not production CUTOVER. No unresolved blocker found in this slice's reviewed source. The original SDK drift is an environment condition, not evidence that the current original installation is fully green. RF066-S2 must reconcile it before production acceptance and connect the explicit metadata path. Frontend, DPAPI model-key storage, browser service composition and current-identity LIVE remain later work.

No commit/push, dependency-manifest change, external model invocation, Docker operation beyond ps, service restart, business-date advance or original-state migration. Only owned temporary test processes were stopped. Exact-SDK mirror is retained locally for inspection; no whole-directory cleanup follows its dependency junctions.

### Final preservation and control receipts

- RF067_SERVICE_PRESERVATION=PASS originalContainers=15 sameIds=true stillRunning=true; all initial IDs matched at closeout, uptime30h. No new listener on original18788/18789/proposed18790; test servers used ephemeral loopback ports and closed.
- Original installed SDK rechecked:1.30.0, not overwritten by the isolated1.31.0 test. Other package/lock and bank code changes predate this slice and remain untouched.
- Final typecheck PASS; test registry complete108; metadata artifact check PASS; changed CJS syntax and whitespace checks passed.
- Actual RF067 governance REFACTOR_VALIDATION=PASS; docs DOC_VALIDATION=PASS metadata=754 links=243. These are control/static results, not production readiness.

