---
id: HENGZHUN-I10-AGCLI-TP10-FULL18-RELEASE-001
title: Full 18-chain release validation
document_type: task
domain: architecture
status: BLOCKED
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP10：18 链完整上线

目标：在 TP09 同一 v4 身份完成 18/18、公共 API 回读、供应链/恢复/冷回滚门并形成正式发布裁决。

业务常识：18 链是 `L1`～`H3` 九个业务场景与 `TEXT_ONLY`、`TEXT_WITH_IMAGE` 两个变体的笛卡尔积；每个变体仍保留自己的精确批准，编排器不能代替用户授权。同一身份下同一 case/variant 的重试只取一个当前终态，不能把尝试次数当通过数。发送侧 PASS 不等于接收侧回读；恢复能力、冷回滚能力和正常业务验收是三个不同证据类别。机器只能产出 `ELIGIBLE_FOR_HUMAN_DECISION`，正式 `GO` 必须由项目负责人明确给出。

项目易错点：现有 `i10-acceptance-ledger-v3` 绑定旧 Flowise ReleaseIdentity，不能导入或提升为 CLI v4；跨身份拼证据、跳过失败链、确定性失败后继续、自动批准、缓存 audit 冒充实时、只验证代码不验证恢复、冷回滚复用正常链证据、未知端口进程被误杀、未经授权发布均须失败关闭。

具体实现模板：

1. v4 ledger：`releaseIdentityHash + caseId + variant + attempt` 不可变记录 → 同身份 9x2 当前投影 → 旧身份历史化。
2. ordered runner：TP09 L1 pair 前置 → identity lock → first missing chain → exact approval pause → terminal public readback → record → next chain；首次确定性失败立即停止。
3. release gates：18/18 → SBOM/lock/source/runtime 重检 → 同身份 DPAPI restart/restore → final public readback → eligibility。
4. cold rollback：第二份精确授权 → 正常链禁用 → 独立冷启动/探针/恢复 → 不可复用证据。
5. human gate：当前门禁只读投影 → 项目负责人显式 `GO`/`NO_GO` → 不可变决策记录。

执行批次：`RF-025`，切片 `S0`～`S5`。S0 治理拆解、S1 独立 v4 ledger 与 S2 顺序 full18 runner 已完成；S3～S5 实现均已离线就绪，但真实同身份门、冷回滚和人工裁决仍 BLOCKED。runner 固定 18 链顺序，逐次等待精确批准，在 `APPROVAL_EXECUTING` 前落安全检查点，崩溃后不重放歧义写，首次确定性失败锁定停止，并在每条终态后要求权威 Journey 证据和公共身份回读。S3 在 18/18 前不执行公共回读、audit 或 DPAPI；S4 只在独立精确授权下运行旧四服务冷路径并证明正常证据字节不变；S5 消费隔离冷证据并二次回读，只有项目负责人精确授权才能落不可变 GO/NO_GO。当前离线聚焦合同 45/45、MCP 合同 18/18、完整注册矩阵 577/577 已通过。Done：同一 bound v4 身份 `currentPassed=18/18`，每条均有当前公共回读，供应链与 DPAPI 恢复门当前，同一轮冷回滚具有独立授权且不污染正常证据，最终人工发布门明确通过。

阻塞：TP09 L1 LIVE 尚未验收且需要新的精确 CLI LIVE 授权；无完整 18 链 LIVE/发布授权；S3 真实门需在同一 bound 18/18 身份执行；S4 真实冷回滚需要独立精确授权；S5 需要项目负责人真实 `GO` 或 `NO_GO`。当前源码候选身份 `1d032c71aa65db3bdcf7352019f5d22d12c449643f1c9b9768948cfa23f2ad5e` 仍为 `SOURCE_FROZEN_UNBOUND`，不得写成已冻结、已发布或已上线。

当前完成审计：CLI doctor 为 READY 且 Flowise 缺席，三项正常服务均未运行；但模型名称/地址、L1 文本输入、图片输入、图片附件及三类精确授权均未配置。正式 L1 证据、v4 ledger、冷回滚证据和发布决策文件均为零。下一步必须先由项目负责人提供配置模型和脱敏 L1 输入材料，再按最终 bound 身份签发新的 CLI LIVE 授权；仓库内不存在可安全推断或复用的替代值。
