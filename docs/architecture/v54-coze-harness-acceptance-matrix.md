---
id: DOC-V54-COZE-HARNESS-ACCEPTANCE
title: V5.4 Coze Harness 回归核心验收矩阵
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.3
effective_date: 2026-07-15
owner: project-owner
---

# V5.4 Coze/Harness 回归核心验收矩阵

本矩阵只适用于 `COZE-HARNESS-CORE-001`。实施先后以 [`../../agent/plans/active/v54-implementation-batches.md`](../../agent/plans/active/v54-implementation-batches.md) 为唯一权威。银行 S0-S7 验收继续以 [`acceptance-matrix.md`](acceptance-matrix.md) 为准，但不构成平台基础建设的全局前置条件；衡准 UI 实现处于暂停状态，不属于本矩阵的交付范围。

| 门槛 | 通过条件 | 必须证据 |
|---|---|---|
| 被测案例门禁 | 平台基础可先行；每条银行案例接入 Harness 前，该案例自己的页面、API、角色、Fixture、错误语义和稳定定位器必须可重复验收。未使用页面及 `FE-DEFECT-001` 其余缺陷不阻塞平台基础或其他案例 | 对应案例的前端构建、契约、浏览器、Fixture 清理与脱敏证据 |
| Coze 唯一入口 | 用户只能通过自托管 Coze Studio Agent/Workflow 提交作者化、导入、诊断和恢复任务 | Agent/Workflow 配置标识、HTTP Plugin 调用记录 |
| 平台能力一致性 | 当前批次依赖的 `PLAT-Vxxx` 均已由目标版本真实平台或明确官方依据关闭；模型回答、附件文本和单张截图不能独立关闭 | [`平台能力待验证登记册`](../current-state/coze-hiagent-verification-register.md)、conformance 用例、脱敏结果清单和证据 Hash |
| Harness 工具边界 | HTTP OpenAPI Plugin 使用服务令牌和内网 allowlist；所有工具具有版本化请求/响应、幂等键、任务 ID 和审计 | OpenAPI、鉴权负测、任务状态与审计证据 |
| 工具输出预算 | L0/L1/L2/L3 分别执行 8/16/64/128 KiB 单次上限；按 UTF-8 JSON 压缩前字节计量；Harness 绝对上限 128 KiB；超限时分页或转 Artifact，不能安全降级则返回 `OUTPUT_BUDGET_EXCEEDED` | 各等级边界值与越界契约测试、UTF-8 多字节测试、分页完整性测试、Artifact 降级测试、128 KiB 全局门禁负测 |
| SQLite 权威状态 | `regression_platform.sqlite` 是回归领域唯一事实来源；使用 WAL、外键、单写入队列、备份与 `integrity_check` | 迁移、并发负测、备份恢复与完整性检查 |
| Fixture 隔离 | 每个运行均携带 `namespace + runId`，只经 Test Support API Seed/Reset，禁止直写银行数据库 | Test Support 契约、隔离并发测试、清理证据 |
| Midscene 风险路由 | Midscene 使用 Harness 三动作窗口；只有逐动作通过 `PLAT-V014` 的能力才可进入 LOW/MEDIUM 作者化。动作未验证或已降级时使用纯 Playwright；高风险动作原则上只允许已验证的 Midscene 定位并由 Playwright 完成 DOM/ARIA 校验与提交，若定位能力降级则同样使用纯 Playwright | 原子能力门禁、低/中/高风险案例、窗口与租约日志、失败动作未获准路由的负证据 |
| 输入与模型安全 | 外部模型只接收本机脱敏最小上下文；视频仅本机拆帧，Coze仅接收 Artifact ID；内网版使用本机视觉模型 | 脱敏负测、Artifact 传递记录、网络边界检查 |
| 脚本验证 | 脚本包通过静态门禁、隔离 Worker、独立 BrowserContext、业务断言与证据 Hash 验证 | 三条银行案例的验证报告 |
| 定时回归 | Harness Schedule 仅执行 `SCRIPT_VALIDATED` Playwright 脚本，正确处理互斥、misfire、补跑与失败暂停 | 调度、断网恢复、失败暂停和无 LLM 执行证据 |
| 修复激活 | Coze 可诊断、Harness 可隔离验证；正式脚本激活与 Schedule 恢复必须人工确认 | 修复候选、隔离验证、人工确认审计 |
| 衡准排除 | 不创建或改造衡准 UI；若已有路由可访问，只能是只读且不得支持 Coze 或控制 Harness | 范围审查与路由/权限负测 |
| 内网迁移 | 提供版本化离线包、镜像 tar、清单、SQLite/Artifact/Evidence 备份和恢复演练 | 离线包清单与恢复演练报告 |
