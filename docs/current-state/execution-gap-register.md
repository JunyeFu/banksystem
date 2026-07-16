---
id: DOC-STATE-EXECUTION-GAPS-001
title: 当前执行方案缺口清单
document_type: register
domain: current-state
status: verified
authority: evidence
version: 1.6
effective_date: 2026-07-16
owner: project-owner
---

# 当前执行方案缺口清单

> 本清单是对当前仓库文档、契约、目录、固定运行时和本机监听状态的审计汇总，不将目标设计写成已实现能力。任务状态仍以 [`../../agent/backlog.yaml`](../../agent/backlog.yaml) 为唯一来源；本清单用于补齐计划与验收，不替代 Backlog。

## 汇总

| 优先级 | 数量 | 含义 |
|---|---:|---|
| P0 | 3 | 阻止首批案例闭环或 Coze/Harness 核心交付 |
| P1 | 5 | 阻止安全、可重复或可审计交付 |
| P2 | 2 | 影响治理一致性和持续交付质量 |

## 缺口清单

| ID | 优先级 | 缺口 | 当前证据 | 完成判定 | 建议归属 |
|---|---|---|---|---|---|
| GAP-001 | P0 | 首批三个被测案例尚未全部形成案例级冻结证据 | `FE-DEFECT-001` 仍为 `IN_PROGRESS`，但平台基础不再等待其整体完成；只需为登录/个人资料、账户列表/详情、安全拒绝/恢复分别补齐页面、API、角色、Fixture 与定位器证据 | 三条首批案例逐条通过案例门禁；某案例未通过只阻塞该案例，不阻塞 Harness 基础或其他案例 | `FE-DEFECT-003`、`FE-DEFECT-005`、`COZE-HARNESS-CORE-001` |
| GAP-002 | P0 | Coze/Harness 回归执行核心尚未形成纵向闭环 | `COZE-HARNESS-CORE-001` 为 `IN_PROGRESS`；I1 已完成单目录、固定运行时、Coze Studio 0.5.1、合成一致性服务、内部网络、最小 Agent、Knowledge Base 与 Workflow。当前 Coze 公开界面没有同结构 Skill 上传入口，Plugin/OpenAPI 创建入口未建立；I2 的正式 Harness、SQLite、七工具、Worker 仍未实现 | Coze Plugin、Harness、SQLite 权威状态、Fixture 隔离、Midscene 风险路由、独立 Playwright 验证形成三案例闭环；平台失败项按兼容路径关闭 | `COZE-HARNESS-CORE-001` |
| GAP-004 | P1 | 演示运行态已经恢复，但缺少与平台批次绑定的可重复冻结证据 | 2026-07-16 Keycloak、Bank Channel Service、Customer Portal 和 Gateway 容器均为 healthy；旧“全部端口无监听”审计已过期 | 为首批案例固定启动、健康、认证入口、Gateway 路由和重启复验命令，输出同一时间的脱敏证据 | I0 被测基线冻结 |
| GAP-005 | P1 | 银行核心全量回归与若干业务闭环仅部分验证 | E2E-001—E2E-014 未全部自动化/执行；贷款生命周期、账户冻结/关闭/到期为 `PARTIALLY_VERIFIED` | 全量回归、账务平衡、对账、恢复和关键异常路径在冻结环境可重复通过 | 银行核心发布验收批次 |
| GAP-006 | P1 | 转账状态机文档与机器契约不一致 | 状态机仍为 `RECEIVED -> PENDING_REVIEW -> PROCESSING -> POSTED`；OpenAPI/AsyncAPI 使用 `CREATED -> VALIDATING -> ... -> SETTLED` | 选定唯一状态词表；状态机、OpenAPI、AsyncAPI、Liquibase、测试、页面文案和证据全部一致 | 新建状态机契约收敛任务 |
| GAP-007 | P1 | 衡准遗留前端违反最新暂停与只读边界 | 设计禁止写操作；遗留页面仍可新建用例、批准基线、启停计划、生成恢复计划和提交审批，并保留旧运行时作者化文案 | 遗留实现隔离，或在恢复任务授权后收敛为只读观测；不得作为当前能力证据 | 新建遗留衡准隔离/收敛任务；`HZ-OBSERVABILITY-001` 继续保持阻塞 |
| GAP-008 | P1 | Coze 运行时知识库缺少可审计实施链 | Coze KB 被确认是唯一运行时知识权威，但导入、版本、检索快照、审核、失效与 Harness 引用协议均未实现 | 受控导入、版本/Hash、权限、检索证据引用、失效治理与回放测试完成；仓库 docs/RAG 不参与运行时回退 | `COZE-HARNESS-CORE-001` 子任务 |
| GAP-009 | P2 | 内网迁移与离线交付仅有验收要求，没有可执行拆分 | 离线包、镜像 tar、清单、SQLite/Artifact/Evidence 备份恢复和演练报告均无对应实施任务 | 离线包可在隔离目标恢复，包含版本清单、镜像、备份、校验和演练证据 | 新建迁移交付批次，依赖回归核心验收 |
| GAP-010 | P2 | 项目开发 RAG 的中文命令行输出不可读 | `validate_rag.py` 通过，但 Windows CLI 查询中文结果出现乱码 | UTF-8 输出固定；中文查询可读；增加中文检索与终端编码验收 | `GOV-001` 收尾或新建 RAG 可用性子任务 |
| GAP-011 | P0 | 客户门户图形化账号密码登录尚未形成持久演示账号的可重复闭环 | 门户表单、`bank-customer`、`customer-portal`、Direct Access Grant、默认 `CUSTOMER` 和临时合成客户浏览器冒烟均已具备；但持久账号仍缺少由用户掌握密码完成的图形化验收、幂等身份/核心映射准备和重启复验 | 持久客户在 `/portal/login` 亲自输入凭据后进入 Dashboard 并读取本人账户；身份、角色、唯一核心映射和重启后复验全部有脱敏证据；手机号、会话续期和本地演示/生产边界按专项清单收敛 | `FE-DEFECT-003`、`FE-DEFECT-005`；详见 [`../evidence/frontend/customer-password-login-gap-2026-07-16.md`](../evidence/frontend/customer-password-login-gap-2026-07-16.md) |

## 必须遵守的并行推进关系

```text
轨道 A：已验证的单目录骨架与产品内固定运行时 -> GAP-002 Harness/Coze 基础 -> 首个纵向闭环
轨道 B：GAP-004 冻结被测运行态 -> GAP-011/GAP-001 逐案例收敛

轨道 A + 已通过门禁的单个案例 -> 三案例闭环 -> Midscene/修复 -> Schedule/迁移

GAP-006、GAP-005 和未被首批案例使用的银行缺陷继续后置，不阻塞轨道 A。
```

`GAP-007` 不得阻塞 `GAP-002`：衡准当前保持暂停，且不能承载任何 Agent、案例、脚本、基线、调度或恢复写控制。

`GAP-002` 内涉及 Coze/HiAgent 平台能力的退出门禁以 [`coze-hiagent-verification-register.md`](coze-hiagent-verification-register.md) 为准。未经验证的平台主张只阻塞其依赖批次，不得被写成已实现能力，也不得阻塞无依赖的 Harness、SQLite、Artifact 或银行案例修复。

## 已关闭缺口

| ID | 关闭日期 | 关闭证据 | 剩余边界 |
|---|---|---|---|
| GAP-003 | 2026-07-16 | `platform/runtime/verify-runtime.cmd` 在专属 Node v20.20.2 下验证 Playwright/Test/Core 1.59.1、Midscene Web/CLI 1.10.5、Chromium 147.0.7727.15 revision 1217 和 FFmpeg revision 1011 全绿；MiMo v2.5 使用 `xiaomi-mimo` family 完成门户 Playwright/Midscene 联合冒烟，视觉框与 DOM 框 IoU 为 0.9606 | 运行时冻结不等于 GAP-002 已完成；Coze、Harness、SQLite、Worker、三动作窗口与正式脚本验证仍需实施 |

I1 骨架证据见 [`../evidence/platform/hengzhun-i1-skeleton-2026-07-16.md`](../evidence/platform/hengzhun-i1-skeleton-2026-07-16.md)，机器基线与公开界面实测见 [`../evidence/platform/hengzhun-i1-platform-baseline-2026-07-16.md`](../evidence/platform/hengzhun-i1-platform-baseline-2026-07-16.md)。

## 审计依据

- [当前能力矩阵](capability-matrix.md)
- [Coze 模拟 HiAgent 平台能力待验证登记册](coze-hiagent-verification-register.md)
- [V5.4 Coze/Harness 验收矩阵](../architecture/v54-coze-harness-acceptance-matrix.md)
- [Coze、Harness、Midscene 与衡准职责边界](../architecture/overview/coze-harness-midscene-observability-boundary.md)
- [前端真实运行缺陷盘点](../evidence/frontend/frontend-defect-inventory-2026-07-15.md)
- [当前实施任务状态](../../agent/backlog.yaml)
