---
id: NORM-DESIGN
title: 系统设计与模块边界
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-08
owner: Codex
---

# 系统设计与模块边界

银行链：Portal→Gateway→Bank Channel→Fineract。Keycloak提供身份；Channel校验权限、对象归属、业务规则、请求绑定并持久化操作；Fineract拥有账务。核心网络调用不跨本地长事务；未知结果只回读并匹配原请求。

Agent链：CLI/Controller→MCP→Harness→Worker→Playwright/Midscene→Portal。Harness SQLite保存任务/脚本/调度/证据索引，Quality只读展示。模型生成解释不能替代验证器；正式脚本回归不临场改预期或脚本。

## 调度与反馈增量
复用已有schedule、lease、incident与repair接口，先审计可达性和版本条件再补CLI缺口。失败暂停是人工接管，不重引入日常提案审批。反馈记录失败类别、人工纠正、目标适配器和适用版本；经验仅在匹配目标/合同条件时加入候选作者化上下文。候选通过合同与隔离验证后才可用于后续运行，原失败和正式脚本版本保留；禁止凭空生成金融参数或放宽断言。

## 验证码
本项目目标是授权合成环境测试。验证码种类需通过页面/适配器合同明确；无法处理时产生可恢复的接管状态并保持原业务关联。实现不得绕过生产风控或收集真实客户数据。合成能力测试不等于机构实际验证码已接入。

2026-10-09 已提供 CLI 入口：verification status <challengeId>；verification ready|confirm|cancel <challengeId> --session <sessionId> --revision <当前版本> --jsonl。ready只登记准备，confirm只确认用户已在原浏览器完成，不替代页面最终状态断言；Worker消费确认后恢复同一挑战/任务，不新建业务请求。版本陈旧拒绝，验证码/PIN无命令参数；读投影不返回准备说明、页面指纹或验证内容。合成Chromium、真实MCP/Harness临时SQLite的集成证明见[RF064证据](../../architecture/refactoring/batches/RF-064/evidence-index.md)，正式环境验收待最终身份冻结。

## 状态与数据
2026-10-09 作者化租约复审：当前I10作业过期即FAILED（资金仍为结果未知），保留旧上下文和原失败，不自动重新执行；显式retryFailed复用已有恢复接口创建新作业及新冻结上下文，资金必须新样本池。完成接收及最终事务均拒绝过期/非持有者；旧Worker不得凭晚到结果覆盖新状态。真实BYOK进程恢复另按A05验收。
2026-10-09 feedback record的纠正可为TARGET_MAPPING或ASSERTION_IMPLEMENTATION；后者结构为{"type":"ASSERTION_IMPLEMENTATION","stepId":"原失败步骤","implementation":"EXACT_TEXT|EXACT_EQUAL"}，枚举须选其一。登记须原正式失败报告唯一步骤和原DSL操作匹配，核验须独立持证激活修复及实际脚本实现/DSL/fixtures相同，不改业务目标。MCP当前合同10.4.0、39工具；断言消费已接入S3-4b2源码链，晋级或仅发放上下文不算已应用。

2026-10-09 断言实现修复为明确限时精确DOM等待，而不是改变预期或重新执行业务。原DSL失败步骤绑定原动作，只有身份/namespace/适配器/场景/版本/动作语义及引用值匹配才冻结reviewedAssertion。Worker执行并报告准确实现，Harness匹配发放事实，再将映射写入正式候选脚本和manifest；后续定位修复保留已核验实现。getFeedback仅投影已完成候选中上下文、执行记录和产物一致的消费。Worker默认expectText现已真实检查，不再漏执行；真实业务失败不能通过修改断言目标变成成功。BYOK保留任务改善仍待最终身份验收。

2026-10-09 定位经验消费者已接到Harness作者化作业领取：仅当前身份/namespace下VERIFIED、相同完整适配器/场景/DSL、相同动作语义和引用值，才把reviewedLocator加入既有受控视觉上下文；不改冻结计划。feedback show的consumptions只来自已完成候选与匹配验证动作，发放提示不算使用，候选仍须稳定性验证。DSL版本迁移043修正旧V2标识错误；断言实现反馈源码已接通，跨层复审及真实模型效果验收待完成。

2026-10-09 反馈公开入口：feedback record <incidentId> --session <sessionId> --input-file <纠正JSON> --jsonl；feedback verify <feedbackId> --journey <独立成功Journey> --session <sessionId> --jsonl；feedback show <feedbackId>。写命令经MCP及认证Harness绑定当前身份，查询为安全投影；当前工具合同10.4.0共39项。已核验反馈不等于已被作者化使用，定位与断言消费机制见上文；真实BYOK效果未验收，不能据此声称自主进化。

资金幂等状态属于Channel PostgreSQL；核心账务属于Fineract；Agent执行及反馈属于Harness SQLite；外部站点只有规范资料和只读状态引用。反馈不得放在仓库docs作为产品运行时RAG。

## 设计验收
Controller不直接SQL；Repository独占SQL；跨层通过具名业务端口。反馈启用需匹配与不匹配两类反例、重启持久化与证据复核；计划调度需单次触发、多进程领取、失败暂停和恢复反例。现有理想/实际专业图在RF064 S1核对更新，本文不声称图已更新。

## 既有专业模型与本次差异映射

以下图是2026-09-30建模快照，保留作为修复前基线，不将旧图标题中的“实际”解释为当前实现。最终候选前需要重建实际图。

| 专业视图 | 已有源稿/预览 | 本轮必须反映的差异 |
|---|---|---|
| 业务能力地图 | [宏观图册](../../architecture/modeling/vibe-coding-review-2026-09-30/macro-comparison/README.md) | 周期回归、人工接管与核验经验分别映射 N06/N04/N07；演示银行存在不代表 Agent 完整 |
| UML组件 | [组件图](../../architecture/modeling/vibe-coding-review-2026-09-30/macro-comparison/02-uml-component.svg) | 两个产品、Harness 执行状态源与 Fineract 账务事实源 |
| 转账时序 | [PlantUML源稿](../../architecture/modeling/vibe-coding-review-2026-09-30/transfer-sequence.puml) | N01/N05、未知结果查询原操作；修复证据以 RF063 为准 |
| 转账状态机 | [状态机源稿](../../architecture/modeling/vibe-coding-review-2026-09-30/transfer-state.puml) | 分离业务成功、测试失败和人工接管；页面失败不能推断未记账 |
| Agent执行 | [既有快照](../../architecture/modeling/vibe-coding-review-2026-09-30/08-agent-actual.svg) | 发布单入口及反馈经验；未实现能力只画目标，不画为运行链 |

本轮发布门增加银行场景合同与性能样本重算，这是报告一致性校验，不宣称能从外部系统独立重建历史事实。真实执行、认证生产者、不可变登记和 Harness 账本共同构成证据入口。

