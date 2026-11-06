---
id: NORM-CURRENT-MODELS-20261106
title: 当前业务与实现专业图册
document_type: reference
domain: architecture
status: draft
authority: informative
version: 1.0
effective_date: 2026-11-06
owner: Codex
---

# 当前业务与实现专业图册

打开[图册](index.html)或[十页可编辑draw.io源](current-business-models.drawio)。输入为[model.json](model.json)，具名来源与重新提取的import边在[source-evidence.json](source-evidence.json)，实际渲染检查在[render-check.json](render-check.json)。整体仍为 **NO_GO**；这是当前源码模型，不是当前部署、正式28项或本人UAT证据。

| 视图 | 回答的问题 | 范围 |
|---|---|---|
| [01 用例](01-use-cases.png) | 客户、运营和测试人员各做什么？ | 需求角色和核心动作；不表示全部已实测 |
| [02 能力对照](02-capability-comparison.png) | 目标与源码还差在哪里？ | 八组能力；目标、源码、待证分别描述 |
| [03 银行组件](03-bank-components.png) | 事务、SQL和核心事实分别由谁拥有？ | 逻辑组件，不把业务包当微服务 |
| [04 Agent组件](04-agent-components.png) | 对话、模型、执行和只读投影如何分工？ | Harness共享状态权威，本地密钥不是任务库 |
| [05 转账时序](05-transfer-sequence.png) | 核心调用失败时能否再次提交？ | 应用逻辑片段；短事务和原键回读 |
| [06 Agent时序](06-agent-sequence.png) | 目标怎样成为浏览器执行和证据？ | 省略轮询细节；不把所有场景画成已通过 |
| [07 状态](07-state-boundaries.png) | 业务成功为何仍可能测试失败？ | 转账核心片段及完整文档状态路径 |
| [08 领域关系](08-domain-ownership.png) | 哪些数据能关联，谁拥有它？ | 逻辑关系，非完整物理ER/跨库外键图 |
| [09 关键部署](09-deployment.png) | Docker银行与Windows Agent如何组合？ | 声明视图，省略辅助容器，非实时运行盘点 |
| [10 DSM](10-dependency-dsm.png) | 当前显式类型依赖是否仍成环？ | 11生产包/65Java文件，14条唯一import边 |

## 相对9月30日基线的变化

历史[宏观图册](../../../architecture/modeling/vibe-coding-review-2026-09-30/macro-comparison/README.md)与其图片不修改。当前核对结果：

- 贷款提交用审批年率除12映射月利率，同时核核心金额、产品、期限、方式和利率；不能继续沿用“年率失真”旧结论。默认产品模板和真实审批提交是不同入口。
- 转账在短事务取得提交权后调用Fineract，再以原键/核心引用核验。未知不能推断拒绝；状态矩阵允许的边也不等于当前处理器会自动走到那一步。
- 对账已有账户交易腿→核心交易号→总账方向/金额/币种/控制账户核对，不再把渠道投影称为唯一总账事实。现金会计覆盖与旧无会计记录分开，不宣称对所有业务全覆盖。
- EOD位于operations协调层，持有运行锁与短事务检查点；未知核心作业先核执行记录，不能盲重做。图不授权推进保留环境日期。
- `demo.ps1 verify`已调用统一RF057报告入口；Harness保存机器验证结论，Quality读取真实发布记录并检查后续阻断。旧“verify未实现/发布页为空”不再作为当前结论。
- 会话经独立MCP持久化到Harness，轮次模型绑定与CAS已进入源码；本地密钥/恢复辅助文件不构成第二个执行状态源。旧身份S5不覆盖当前源码。

## 尚未收口的差异和耦合

当前65文件、14条唯一跨包显式import，未发现强连通组；9月快照62文件、14边、11条未声明和旧依赖环不能当当前事实。首次重建发现`customerprofile → audit`未列入`bank.customer-profile.allowedDependencies`，实际显式import来自LoanOperationService.java:12，不包括首轮说明误列的LoanWorkflowService。M4仅登记bank.audit，保留原完成审计，刷新后未声明边为0，实际14条边不变；逐条路径/行号在JSON。此为现有协作的声明修正，不是新增资金故障或删除业务耦合的重构。

DSM只读11个包的显式主源码import，不含根能力端口、Test Support、SQL表引用、反射、HTTP或完整构建依赖图。空格/无环不证明完全解耦；宽泛allowedDependencies也不证明每条调用都合理。最终28项、补充真实容量、安全/许可证、统一候选、远端CI及本人验收仍未闭合，图中不填未测指标或个人贡献。

## 编辑、生成与核验

原生编辑源保留；SVG/PNG由同一XML几何产生，是本地预览，**不是draw.io Desktop原生导出**。已安装的drawio-skill用于序列布局及XML结构检查；本机未安装Desktop/Graphviz，不因此下载新工具或上传模型。没有增加产品运行依赖、CI或端口。

```powershell
# 在本目录，使用已安装drawio-skill；不是银行运行命令。
python build.py --drawio-skill <drawio-skill目录>
python <drawio-skill目录>/scripts/validate.py current-business-models.drawio --score
# 仅复用已安装的Playwright及Chromium，均指定本地绝对路径。
node render.mjs --playwright <Playwright模块目录> --browser <Chromium可执行文件>
```

原生十页结构由技能检查，SVG用固定Playwright1.59.1/Chromium147检查实际文字边界、非空和图片加载，十张PNG逐张实看；未把结构评分当作UML完整语义验证或运行证据。两轮定向视觉修正仅处理长标题断行、状态交叉线和角色标签；不反复自动美化。领域图明确保持逻辑层，未伪造DDL/物理ER验证。
