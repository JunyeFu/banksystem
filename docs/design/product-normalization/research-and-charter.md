---
id: NORM-CHARTER
title: 实习课题立项与研究
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-08
owner: Codex
---

# 实习课题立项与研究

## 用户与问题
用户明确：科技部测试组需要抽调人力执行案例回归，希望AI产出脚本并在服务器周期运行；银行演示系统为Agent提供合成数据、可控且可实机展示的业务环境。价值指标是日常人工投入和结果可靠性，现有案例量、人工基线和验证码类型尚未统计。

## 产品目标
主产品为CLI浏览器测试Agent；银行演示环境提供登录、账户、转账、贷款、运营等真实业务状态。正常转账必须核验最终成功、双方余额与对应交易；视觉提示仅是部分证据。失败需说明现象、业务结果和人工接管信息。已验证脚本用于周期回归，模型用于目标理解、作者化及受控修订。

## 一手研究（2026-10-08）
| 样本 | 官方事实 | 本项目定位推论 |
|---|---|---|
| [Apache Fineract](https://fineract.apache.org/) | 提供开放API的金融核心，包含贷款、储蓄及会计能力 | 复用核心事实，渠道与Agent不自行伪造账务 |
| [Midscene](https://midscenejs.com/) | 视觉驱动GUI自动化，可与浏览器测试结合 | 可作为页面操作能力；不能据其能力声明本项目业务验收已通过 |
| [Anthropic工程说明](https://www.anthropic.com/engineering/building-effective-agents) | 区分预定义流程与模型动态决定路径的Agent | 分清定时脚本执行与模型作者化/反馈决策 |
| [SWEBOK](https://www.computer.org/education/bodies-of-knowledge/software-engineering/v4) | 软件工程知识覆盖框架 | 用于检查需求、设计、测试和交付材料覆盖，不宣称获得认证 |

人工测试是需求中给出的现有替代方式；固定脚本可提高重复执行一致性，但维护成本需本项目实测。Playwright细项竞品比较尚待补充正式来源，未编造工具成本、市场规模或访谈。

## 范围与可行性
首版以现有Windows 11、Docker Desktop、固定浏览器和BYOK单模型为基线。无人值守服务器部署默认先按同等Windows环境验证，Linux不默认兼容。验证码走实际类型的授权测试处理或人工接管；未知类型不得宣称自动识别已实现。经验改进通过已核验反馈与脚本候选复验体现，不等同模型训练或任意自改代码。

## 成功与停止条件
必须满足正式28项、资金不变量、证据闭环、隔离复现和UAT；本地候选不自动公开发布。人力减少50%为初始目标，未测不得写成收益。真正外部用户UAT与贡献事实由本人提供，不代签。

