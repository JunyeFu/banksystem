---
id: NORM-DESIGN
title: 系统设计与模块边界
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.2
effective_date: 2026-11-06
owner: Codex
---

# 系统设计与模块边界

## 组件与状态归属

截至2026-11-06，交付目标仍为可独立理解、联合演示的银行与测试Agent，整体NO_GO。以下说明现有主链和设计约束；源码/集成、真实运行及待验收能力的差异由[验收记录](acceptance-and-handover.md)明确区分，不因图或接口已存在就宣称全部上线。

银行链：Portal→Gateway→Bank Channel→Fineract。Keycloak提供身份；Channel校验权限、对象归属、业务规则、请求绑定并持久化操作；Fineract拥有账务。核心网络调用不跨本地长事务；未知结果只回读并匹配原请求。

Agent链：CLI/Controller→MCP→Harness→Worker→Playwright/Midscene→Portal。Harness SQLite保存任务/脚本/调度/证据索引，Quality只读展示。模型生成解释不能替代验证器；正式脚本回归不临场改预期或脚本。

| 边界 | 所有者与调用方式 | 不得承担的职责 |
|---|---|---|
| 银行UI/API | 两门户经Gateway调用Channel；Keycloak PKCE身份 | 不直连核心或数据库，不伪造入账 |
| 银行应用层 | 业务服务编排事务，Repository持有SQL，五个Fineract能力端口隔离核心解析 | 不跨网络持有本地资金长事务，不由Controller互调 |
| Agent会话入口 | CLI及loopback工作台复用Controller，历史/模型/轮次元数据经独立MCP接Harness | 不成为第二个任务数据库或银行写入口 |
| Controller与模型 | 唯一配置BYOK生成有合同约束的候选，凭据仅执行端解析 | 不读全仓、原账务或密钥，不直接写Harness状态 |
| Harness/Worker | Harness持久化及领取权；Worker实际浏览器操作和证据回传 | 不把模型说明当实际执行，不在结果未知时盲重做 |
| Quality/资料站 | Quality读同一SQLite脱敏投影；外部站仅准备资料 | 不创作/批准测试，不由自评改变工程结论 |

## 会话与测试执行

浏览器工作台仅保留对话、历史和模型选择/配置等核心入口，显示受控执行摘要、真实工具事件及结果证据，不展示模型内部推理作为结论。模型配置的版本、模型名、端点摘要与ReleaseIdentity绑定到轮次；本地凭据登记不把API key返回历史。Harness原子登记submission，重复ID返回原轮次，不重新发起银行业务；更改载荷沿用原ID冲突拒绝。

会话恢复读取Harness共享检查点与CAS版本，历史浏览不隐式恢复/重派。CLI进程恢复、已验证脚本再次执行和业务幂等是不同边界：前者恢复原任务；A06新Journey/Run复用同一冻结脚本；金融重复提交仍由银行幂等/未知回读约束。最新源码接缝与回归见[源码门](../../architecture/refactoring/batches/RF-065/ci-complete-20261105.md)，当前绑定尚未按这些增量冻结。

执行错误沿Worker→Harness→MCP→Controller→HTTP/CLI传播原分类，不吞异常伪装成功。测试是否通过只由事前目标和实际事实决定；业务成功、测试失败、Agent需要人工可以同时成立。证据生产/认证登记/验证/SQLite判定/Quality是一条链，任何后续非预期失败、身份过期或工件问题都不能继续显示旧READY为当前结论。

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
Controller不直接SQL；Repository独占SQL；跨层通过具名业务端口。反馈启用需匹配与不匹配两类反例、重启持久化与证据复核；计划调度需单次触发、多进程领取、失败暂停和恢复反例。2026-11-06已按当前源码更新[十视图图册](models-20261106/README.md)；模型只证明具名静态范围，不关闭运行验收。

## 既有专业模型与本次差异映射

当前入口为[2026-11-06专业图册](models-20261106/README.md)与[可编辑源](models-20261106/current-business-models.drawio)：用例、能力对照、银行/Agent组件、两时序、状态、逻辑领域关系、关键部署与DSM。重新提取65个Java文件/14条跨模块import，无强连通组；首次发现的贷款→审计声明缺项已由M4仅补bank.audit，实际边保留、未登记边为0。这不是运行验收或“完全解耦”结论。十九个具名锚点和每条import见图册来源JSON。

以下旧图是2026-09-30建模快照，继续作为修复前基线；不要将旧图标题中的“实际”解释为当前实现，也不要复用其中verify未实现、贷款年率或旧依赖环结论。

| 专业视图 | 已有源稿/预览 | 本轮必须反映的差异 |
|---|---|---|
| 业务能力地图 | [宏观图册](../../architecture/modeling/vibe-coding-review-2026-09-30/macro-comparison/README.md) | 周期回归、人工接管与核验经验分别映射 N06/N04/N07；演示银行存在不代表 Agent 完整 |
| UML组件 | [组件图](../../architecture/modeling/vibe-coding-review-2026-09-30/macro-comparison/02-uml-component.svg) | 两个产品、Harness 执行状态源与 Fineract 账务事实源 |
| 转账时序 | [PlantUML源稿](../../architecture/modeling/vibe-coding-review-2026-09-30/transfer-sequence.puml) | N01/N05、未知结果查询原操作；修复证据以 RF063 为准 |
| 转账状态机 | [状态机源稿](../../architecture/modeling/vibe-coding-review-2026-09-30/transfer-state.puml) | 分离业务成功、测试失败和人工接管；页面失败不能推断未记账 |
| Agent执行 | [既有快照](../../architecture/modeling/vibe-coding-review-2026-09-30/08-agent-actual.svg) | 发布单入口及反馈经验；未实现能力只画目标，不画为运行链 |

本轮发布门增加银行场景合同与性能样本重算，这是报告一致性校验，不宣称能从外部系统独立重建历史事实。真实执行、认证生产者、不可变登记和 Harness 账本共同构成证据入口。

