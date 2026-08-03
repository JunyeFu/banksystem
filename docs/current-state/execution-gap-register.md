---
id: DOC-STATE-EXECUTION-GAPS-001
title: 当前执行方案缺口清单
document_type: register
domain: current-state
status: verified
authority: evidence
version: 1.7
effective_date: 2026-07-18
owner: project-owner
---

# 当前执行方案缺口清单

> 本清单是对当前仓库文档、契约、目录、固定运行时和本机监听状态的审计汇总，不将目标设计写成已实现能力。任务状态仍以 [`../../agent/backlog.yaml`](../../agent/backlog.yaml) 为唯一来源；本清单用于补齐计划与验收，不替代 Backlog。

## 汇总

| 优先级 | 数量 | 含义 |
|---|---:|---|
| P0 | 1 | 阻止持久客户身份的独立图形化复验 |
| P1 | 5 | 阻止安全、可重复或可审计交付 |
| P2 | 1 | 影响治理一致性和持续交付质量 |

## 缺口清单

| ID | 优先级 | 缺口 | 当前证据 | 完成判定 | 建议归属 |
|---|---|---|---|---|---|
| GAP-004 | P1 | 演示运行态已经恢复，但缺少与平台批次绑定的可重复冻结证据 | 2026-07-16 Keycloak、Bank Channel Service、Customer Portal 和 Gateway 容器均为 healthy；旧“全部端口无监听”审计已过期 | 为首批案例固定启动、健康、认证入口、Gateway 路由和重启复验命令，输出同一时间的脱敏证据 | I0 被测基线冻结 |
| GAP-005 | P1 | 银行核心全量回归与若干业务闭环仅部分验证 | E2E-001—E2E-014 未全部自动化/执行；贷款生命周期、账户冻结/关闭/到期为 `PARTIALLY_VERIFIED` | 全量回归、账务平衡、对账、恢复和关键异常路径在冻结环境可重复通过 | 银行核心发布验收批次 |
| GAP-006 | P1 | 转账状态机文档与机器契约不一致 | 状态机仍为 `RECEIVED -> PENDING_REVIEW -> PROCESSING -> POSTED`；OpenAPI/AsyncAPI 使用 `CREATED -> VALIDATING -> ... -> SETTLED` | 选定唯一状态词表；状态机、OpenAPI、AsyncAPI、Liquibase、测试、页面文案和证据全部一致 | 新建状态机契约收敛任务 |
| GAP-007 | P1 | 衡准遗留前端违反最新暂停与只读边界 | 设计禁止写操作；遗留页面仍可新建用例、批准基线、启停计划、生成恢复计划和提交审批，并保留旧运行时作者化文案 | 遗留实现隔离，或在恢复任务授权后收敛为只读观测；不得作为当前能力证据 | 新建遗留衡准隔离/收敛任务；`HZ-OBSERVABILITY-001` 继续保持阻塞 |
| GAP-008 | P1 | Coze 运行时知识库的全生命周期治理尚未完成 | I3/I4/I6 已证明 Knowledge Base 公开绑定、自动/全文检索和真实命中；但跨版本失效、权限隔离和长期回放治理仍缺少完整证据 | 受控导入、版本/Hash、权限、检索证据引用、失效治理与回放测试完成；仓库 docs/RAG 不参与运行时回退 | 后续知识治理任务，不阻塞已冻结实习演示 |
| GAP-010 | P2 | 项目开发 RAG 的中文命令行输出不可读 | `validate_rag.py` 通过，但 Windows CLI 查询中文结果出现乱码 | UTF-8 输出固定；中文查询可读；增加中文检索与终端编码验收 | `GOV-001` 收尾或新建 RAG 可用性子任务 |
| GAP-011 | P0 | 客户门户图形化账号密码登录尚未形成持久演示账号的可重复闭环 | 门户表单、`bank-customer`、`customer-portal`、Direct Access Grant、默认 `CUSTOMER` 和临时合成客户浏览器冒烟均已具备；但持久账号仍缺少由用户掌握密码完成的图形化验收、幂等身份/核心映射准备和重启复验 | 持久客户在 `/portal/login` 亲自输入凭据后进入 Dashboard 并读取本人账户；身份、角色、唯一核心映射和重启后复验全部有脱敏证据；手机号、会话续期和本地演示/生产边界按专项清单收敛 | `FE-DEFECT-003`、`FE-DEFECT-005`；详见 [`../evidence/frontend/customer-password-login-gap-2026-07-16.md`](../evidence/frontend/customer-password-login-gap-2026-07-16.md) |

## 必须遵守的并行推进关系

```text
轨道 A：I1—I6 回归核心已关闭 -> I7 实习交付冻结与恢复演练已关闭
轨道 B：继续处理 GAP-004、GAP-011 和未纳入实习交付的银行前端缺口

GAP-006、GAP-005 和未被首批案例使用的银行缺陷继续后置，不阻塞轨道 A。
```

`GAP-007` 不反向影响已完成的回归核心与 I7 交付：衡准当前保持暂停，且不能承载任何 Agent、案例、脚本、基线、调度或恢复写控制。

剩余 Coze/HiAgent 平台主张以 [`coze-hiagent-verification-register.md`](coze-hiagent-verification-register.md) 为准。未经验证的目标租户容量与网络只阻塞对应迁移声明，不得被写成已实现能力，也不得反向否定本机 Harness、SQLite、Artifact 和 I7 交付证据。

## 已关闭缺口

| ID | 关闭日期 | 关闭证据 | 剩余边界 |
|---|---|---|---|
| GAP-001 | 2026-07-17 | I4 三条低风险案例均以独立 BrowserContext、Fixture 隔离和脱敏证据通过 | 银行前端整体与持久客户独立复验仍由 GAP-011/FE 任务跟踪 |
| GAP-002 | 2026-07-18 | I6 确定性调度、失败暂停/恢复和 Coze 自然语言创建/查询/停用闭环通过 | 目标租户容量与 HiAgent 网络以 `PLAT-V007`、`PLAT-V010` 移交未来新对话 |
| GAP-003 | 2026-07-16 | `platform/runtime/verify-runtime.cmd` 在专属 Node v20.20.2 下验证 Playwright/Test/Core 1.59.1、Midscene Web/CLI 1.10.5、Chromium 147.0.7727.15 revision 1217 和 FFmpeg revision 1011 全绿；MiMo v2.5 使用 `xiaomi-mimo` family 完成门户 Playwright/Midscene 联合冒烟，视觉框与 DOM 框 IoU 为 0.9606 | 运行时持续由固定版本门禁保护 |
| GAP-009 | 2026-07-18 | I6/I7 已生成三镜像离线包、Hash、SBOM、SQLite/Artifact/Evidence 备份，并在全新目录恢复通过 | 目标内网现场配置和 HiAgent 网络验证已移交未来新对话 |

I1 骨架证据见 [`../evidence/platform/hengzhun-i1-skeleton-2026-07-16.md`](../evidence/platform/hengzhun-i1-skeleton-2026-07-16.md)，机器基线与公开界面实测见 [`../evidence/platform/hengzhun-i1-platform-baseline-2026-07-16.md`](../evidence/platform/hengzhun-i1-platform-baseline-2026-07-16.md)，I2 安全内核见 [`../evidence/platform/hengzhun-i2-safe-kernel-2026-07-16.md`](../evidence/platform/hengzhun-i2-safe-kernel-2026-07-16.md)，I7 交付冻结见 [`../evidence/platform/hengzhun-i7-internship-delivery-2026-07-18.md`](../evidence/platform/hengzhun-i7-internship-delivery-2026-07-18.md)。

## 审计依据

- [当前能力矩阵](capability-matrix.md)
- [Coze 模拟 HiAgent 平台能力待验证登记册](coze-hiagent-verification-register.md)
- [V5.4 Coze/Harness 验收矩阵](../architecture/v54-coze-harness-acceptance-matrix.md)
- [Coze、Harness、Midscene 与衡准职责边界](../architecture/overview/coze-harness-midscene-observability-boundary.md)
- [前端真实运行缺陷盘点](../evidence/frontend/frontend-defect-inventory-2026-07-15.md)
- [当前实施任务状态](../../agent/backlog.yaml)
