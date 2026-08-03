---
id: DOC-ARCH-RF001-EVIDENCE
title: RF-001证据索引
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.3
effective_date: 2026-08-02
owner: project-owner
---

# RF-001证据索引

| 门禁 | 当前结果 | 证据 |
|---|---|---|
| 回灌后产品身份 | PASS：ReleaseIdentity固定、18/18 | `docs/evidence/platform/hengzhun-i10-post-backfill-baseline-2026-08-02.md` |
| MCP公开面 | BASELINE：33个工具 | `docs/architecture/refactoring/module-boundaries-v1.yaml` |
| 重构合同 | PASS：2个批次、25个模块 | `python scripts/architecture/validate_refactoring.py` |
| 文档权威链 | PASS：130份元数据、169个链接、1176项过期检查、95份顺序文件 | `python scripts/docs/validate_docs.py` |
| 字段/错误码矩阵 | PASS：33/33工具已盘点 | `field-error-adapter-matrix.md` |
| 兼容适配器盘点 | PASS：12类适配行为已分类 | `field-error-adapter-matrix.md`第4节 |
| 缺陷登记 | PASS：9项合同与边界问题已编号 | `field-error-adapter-matrix.md`第5节 |
| B2机器合同 | PASS：33/33工具、13个别名映射、3个条件写入工具、8字段错误信封 | `mcp-boundary-contract-v1.json` |
| B2合同静态校验 | PASS：工具名及顺序与运行清单一致，字段和枚举完整 | `python scripts/architecture/validate_rf001_contract.py` |
| B3共享适配器 | PASS（CONTRACT）：8字段错误投影、共享语义比较、脱敏差异摘要 | `shadow-implementation-report.md` |
| B3首条细链 | PASS（CONTRACT）：`credential_session_get`规范化与现有MCP合同共15项测试 | `rf001-contract-adapter.test.cjs`、`mcp-interaction-contract.test.cjs` |
| B3-S2影子包装 | PASS（CONTRACT）：`shadowedRequest`单请求包装，成功/失败均观测同一次响应 | `shadow-implementation-report.md`第3节、`server.cjs`L166-183 |
| B3-S2编排工具接线 | PASS（CONTRACT）：8个直接编排工具全部直达往返接入，条件写单副作用静态断言 | `rf001-contract-adapter.test.cjs`B3-S2用例 |
| B3-S2聚焦测试 | PASS：18 passed / 0 failed | `node --test rf001-contract-adapter.test.cjs mcp-interaction-contract.test.cjs`（exit 0） |
| B3-S2静态合同 | PASS：`REFACTOR_VALIDATION=PASS batches=2 modules=25`、`RF001_CONTRACT_VALIDATION=PASS tools=33 aliases=13 conditional_mutations=3 error_fields=8` | `python scripts/architecture/validate_refactoring.py`、`python scripts/architecture/validate_rf001_contract.py`（exit 0） |
| B3-S3切片与任务包 | PASS：切片APPROVED、任务包批准、决策日志条目21（DEC-1 OPTION-C、DEC-2自映射） | `slices/RF-001-B3-S3.yaml`、`tasks/RF-001-B3-S3.md`、`decision-log.md`条目21 |
| B3-S3 13项别名适配 | PASS（CONTRACT）：13项别名全部接入权威投影函数，8个工具入口接线，移动函数沙箱语义对照PASS | `shadow-implementation-report.md`B3-S3小节、`mcp/src/rf001-contract-adapter.cjs` |
| B3-S3样本测试 | PASS：29 passed / 0 failed（含13项别名样本+无效果+自映射+无IO断言） | `node --test rf001-contract-adapter.test.cjs mcp-interaction-contract.test.cjs rf001-b3s3-aliases.test.cjs`（exit 0） |
| B3-S3合同更新 | PASS：`RF001_CONTRACT_VALIDATION=PASS tools=33 aliases=13 conditional_mutations=3 error_fields=8` | `mcp-boundary-contract-v1.json`（until字段按DEC-1/DEC-2更新）、`python scripts/architecture/validate_rf001_contract.py`（exit 0） |
| B3-S3身份对照 | PASS（受限复算）：sourceFlowHash重算一致、identityHash`632ad5ee…`不变；`inspect-i10.ps1`缺失，运行时复算登记为B3-S5前置 | `C:/tmp/i10-post-backfill-baseline.json` + `agentflow-v7.json`重算 |
| B3-S4前置读观测 | PASS（CONTRACT）：candidate_decide/schedule_disable前置读接入shadowedRequest，写路径保持callHarness，错误码不变 | `shadow-implementation-report.md`B3-S4小节、`server.cjs`两工具块 |
| B3-S4聚焦测试 | PASS：30 passed / 0 failed（含10工具观测覆盖断言） | `node --test rf001-contract-adapter.test.cjs mcp-interaction-contract.test.cjs rf001-b3s3-aliases.test.cjs`（exit 0） |
| B3-S4身份对照 | PASS（受限复算）：sourceFlowHash重算一致、identityHash不变 | `agentflow-v7.json`重算 |
| B3-S5隔离运行态影子 | PASS（RUNTIME_SHADOW）：16工具调用/20往返，计数代理零重复写入，影子observed=20/mismatched=0，无凭据泄漏 | `shadow-implementation-report.md`B3-S5小节、`rf001-b3s5-shadow-live.test.cjs` |
| B3-S5运行时身份复算 | PASS：`i10-release-identity.cjs` identityHash=`632ad5ee…`与基线一致 | `runtime/node-v20.20.2-win-x64/node.exe scripts/i10-release-identity.cjs`（exit 0） |
| B3-S5聚焦测试 | PASS：32 passed / 0 failed（含回归） | `node --test rf001-contract-adapter.test.cjs mcp-interaction-contract.test.cjs rf001-b3s3-aliases.test.cjs rf001-b3s5-shadow-live.test.cjs`（exit 0） |
| B3-S5公共API新鲜度 | OPEN：Flowise探针不可达（正式环境未启动），原因已记录；B4切流前置 | `shadow-implementation-report.md`B3-S5小节 |
| B4-S1兼容与错误路径基线 | PASS（CONTRACT）：33工具三源一致、13别名/8字段/3条件写一致、错误码全文档化、v7消费者面⊆33、切流前基线登记 | `shadow-implementation-report.md`B4-S1小节、`rf001-b4s1-compat-error-baseline.test.cjs` |
| B4-S1聚焦测试 | PASS：37 passed / 0 failed（含回归） | `node --test` 5个验证文件（exit 0） |
| B4-S2正式环境启动与探针 | PASS（RUNTIME_LIVE）：四服务健康、双模型 mock=false/degraded=false | `start-i10.ps1`（exit 0）、`.data/logs/i10-start-b4s2.log` |
| B4-S2公共API新鲜度 | ✅ 已关闭 OPEN：sourceFlow/deployedFlowData/chatbotConfig 三项Hash与基线一致 | `i10-agentflow-publish.cjs --allow-register` 回读（2026-08-03T02:21Z） |
| B4-S2 18链账本 | PASS：18/18、9组SEMANTIC_MATCH、记录级身份全部632ad5ee | `i10-18-chain-acceptance-live.cjs status` |
| B4-S2身份复算 | PASS：identityHash=632ad5ee… | `i10-release-identity.cjs`（exit 0） |
| B4-S3回滚演练 | PASS（CONTRACT_DRILL）：漂移可检测→基线恢复→33工具完整/身份不变/检测器绿，隔离演练真实工作区零改动 | `shadow-implementation-report.md`B4-S3小节、`rf001-b4s3-rollback-drill.test.cjs` |
| B4-S3聚焦测试 | PASS：39 passed / 0 failed（含回归） | `node --test` 6个验证文件（exit 0） |
| 切流前置硬门禁（cutover-runbook） | ✅ 全部满足：合同冻结、兼容全绿、影子等价、18链无回退、回滚已演练 | `shadow-implementation-report.md`B4-S2/S3小节 |
| B4-S4切流 | ✅（RUNTIME_CUTOVER）：生产默认规范信封（实时探测确认）、LEGACY_ERROR=1旧形状恢复（隔离验证）、43/43测试、身份不变 | `shadow-implementation-report.md`B4-S4小节、`rf001-b4s4-cutover.test.cjs` |
| B4-S5观察与关闭 | ✅（RUNTIME_OBSERVE）：生产10错误路径全规范信封（run_submit含safeMessage/correlationRef）、43/43、身份/18链无回退、批次CLOSED、RF-002解禁登记 | `shadow-implementation-report.md`B4-S5小节、`batch.yaml` |
| RF-001批次 | ✅ **CLOSED**（状态路径 IMPLEMENTING→…→CLOSED，校验器PASS） | `batch.yaml`、`validate_refactoring.py` |
| B3身份对照 | PASS：Identity不变、18/18差值0、Flowise源/部署Hash不变 | `inspect-i10.ps1 -CompareSnapshot C:/tmp/rf001-b3-before.json` |
| B3运行态影子 | PENDING：未重启或切换当前MCP，未收集真实隔离流量 | 达到`SHADOW_VERIFIED`前必须完成 |
| ReleaseIdentity对照 | PASS：identity/source/deployed Hash不变，18/18差值为0 | `inspect-i10.ps1 -CompareSnapshot C:/tmp/i10-post-backfill-baseline.json` |
| 证据新鲜度 | WARN：公共API回读为缓存证据且已超过新鲜度窗口 | B2不改运行态；B3影子验证和切流前必须重新实时回读 |

RF-001-B3已完成首条细链、直接编排工具切片（B3-S2）、全部13项入口别名适配（B3-S3）、前置读观测收尾（B3-S4）与隔离运行态影子验证（B3-S5，RUNTIME_SHADOW级）。B4-S1兼容/错误路径基线、B4-S2 18链+新鲜度、B4-S3回滚演练、B4-S4切流（RUNTIME_CUTOVER）、B4-S5观察与关闭（RUNTIME_OBSERVE）全部完成——**RF-001批次已CLOSED**（batch.yaml CLOSED，校验器PASS）：生产默认8字段规范信封、回退开关可用、43/43、身份632ad5ee…、18/18、RF-002解禁登记（不启动）。
