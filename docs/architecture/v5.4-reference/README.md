# 四阶段完整工程实施方案 V5.4——正向脚本生产与反向失败恢复闭环

> 版本：5.4.0  
> 定位：需求文档 + 架构设计 + 开发文档 + 测试验收规范一体化完整版

## 1. 核心目标

```text
质量检测平台人工成功案例
→ HiAgent/Coze Agent 对话确认
→ RAG 检索动作模板、业务规则、页面动作和风险策略
→ Prompt Harness 生成 FullActionPlan
→ 每个 AtomicAction 完成风险评级
→ GlobalExecutionSummary + previous/current/next
→ ActionExecutionSlot 预留当前执行位
→ ActionExecutionLease 限制一次动作
→ LOW/MEDIUM：Midscene Direct + Playwright 取证/验证
→ HIGH：Midscene aiLocate + Playwright Commit
→ ActionEventStore 记录不可变事件
→ CollaborativeExecutionEvidence
→ Stable StepTrace
→ 主控 LLM 生成 PlaywrightScriptPackage
→ 阶段二独立 Playwright Runner
→ Baseline Comparison
→ SCRIPT_VALIDATED
→ Agent 返回脚本下载入口或结构化错误原因
→ 可选挂载定时回归
```

正式定时回归只执行已验证的 Playwright 脚本，不调用 LLM、Midscene 或视觉模型。

## V5.4 新增阅读入口

首先阅读：

```text
00_V5.4_正向脚本生产与反向失败恢复闭环冻结决策.md
```

该文档冻结：

```text
ForwardAuthoringFlow
ReverseRecoveryFlow
RegressionFailureIncident
AgentFailureNotification
两条且仅两条 RecoveryOption
BehaviorChangeRequest
ChangeImpactAssessment
BehaviorPlanPatch
Schedule 失败自动暂停与恢复
```

## 2. 阅读顺序

1. `00_V5.4_正向脚本生产与反向失败恢复闭环冻结决策.md`
2. `00_V5.4_手写设计与正反向闭环冻结决策.md`
3. `00_V5.4_总体需求架构技术验证与命名基线.md`
4. `阶段一_测试目标系统质量案例输入与Baseline_需求开发一体化_v5.4.md`
5. `阶段二_Playwright脚本资产独立验证定时回归与失败事件平台_需求开发一体化_v5.4.md`
6. `阶段三_HiAgent_Coze正反向编排三动作窗口Midscene脚本生成系统_需求开发一体化_v5.4.md`
7. `阶段四_V5.4正反向闭环集成企业联调基准评测与交付_需求开发一体化.md`
8. `V5.4_技术调研代码块与命名核验报告.md`

## 3. 文件说明

| 文件 | 内容 |
|---|---|
| 正反向闭环决策 | ForwardAuthoringFlow、ReverseRecoveryFlow、主动通知、两路径恢复和 Schedule 恢复 |
| 手写设计映射 | 用户层、RAG、双层摘要、游标、执行位、租约、风险分流、事件溯源冻结 |
| 总体文档 | 产品目标、用例、术语、ADR、C4、统一合同、技术栈、NFR、四阶段边界 |
| 阶段一 | 测试目标、质量案例平台、Fixture、Baseline、人工成功事实和案例导出 |
| 阶段二 | 脚本资产、独立 Runner、定时回归、失败 Incident、通知 Outbox、Schedule 暂停与恢复 |
| 阶段三 | Agent 正反向编排、RAG、上下文控制、变化影响分析、行为计划 Patch、重新复刻和脚本生成 |
| 阶段四 | Compose、企业联调、Benchmark、安全、故障、恢复、CI/CD 和最终交付 |
| 核验报告 | 官方资料核验、代码块等级、本地测试、命名审计和修正记录 |
| snippets | 可编译的核心 TypeScript 机制和验证脚本 |

## 4. 本地验证

```bash
cd snippets/v5.4-context-control
npm test

cd ../v5.4-failure-recovery
npx tsc -p tsconfig.json
node --test test/*.test.mjs

cd ../..
python snippets/validate-v5.4-docs.py

find java-quartz-syntax/src -name '*.java' -print0 \
  | xargs -0 javac --release 21 -d java-quartz-syntax/out
cat java-quartz-syntax/result.txt
```

当前记录：

```text
Node.js: v22.16.0
TypeScript: 5.8.3
Java: OpenJDK 21.0.10
V5.4 Context Control 核心测试: 8/8 PASSED
V5.4 Failure Recovery + BehaviorPlanPatch 核心测试: 12/12 PASSED
Quartz Job Java 21 最小 Stub 语法编译: PASSED
文档校验: PASSED
```

## 5. 验证等级

```text
L1 LOCALLY_COMPILED_AND_TESTED
L2 OFFICIAL_SIGNATURE_VERIFIED
L3 SCHEMA_PARSED
L4 INTEGRATION_TEMPLATE
L5 ENTERPRISE_ENVIRONMENT_PENDING
```

完整定义见核验报告。

## 6. 关键命名

```text
HiAgentPattern
AgentPlatformPort
CozePlatformAdapter
EnterpriseAgentPlatformAdapter
RegressionCase
BaselineDefinition
FullActionPlan
AtomicAction
GlobalExecutionSummary
LocalActionWindowSummary
ActionWindow
ActionExecutionSlot
ActionExecutionLease
ActionRiskAssessment
ActionExecutionPolicy
ActionEvent
CollaborativeExecutionEvidence
ReplicationRun
StepTrace
ScriptGenerationContext
PlaywrightScriptPackage
ScriptArtifact
ScriptValidationRun
RegressionSchedule
RegressionRun
RegressionFailureIncident
AgentConversationBinding
AgentFailureNotification
NotificationOutbox
RecoveryDecision
BehaviorChangeRequest
ChangeImpactAssessment
BehaviorPlanPatch
ReauthoringSession
FailureExplanation
KnowledgeRetrievalSnapshot
```

## 7. 企业联调前必须取得

```text
公司 HiAgent 产品版本和 Tool Schema
文件输入/输出能力
原生定时触发能力
主动对话推送、通知 Inbox、交互卡片和送达回执能力
系统通知/弹窗或企业 IM 的批准渠道
公司视觉模型 Endpoint、Model ID、Family、有效 16K Profile 和 Token 估算方式
截图出域政策
质量平台真实导出格式
测试环境认证方式
Baseline 机器比对规则
RAG 知识源、审核流程和风险策略
```

## 8. 版本状态

V5.4 是完整实施基线，不代表以下事项已经在企业环境完成：

```text
HiAgent 正式接入
公司视觉模型真实复刻
质量平台真实导出适配
30–50 条真实案例 Benchmark
生产部署和企业验收
```

V5.4 已在本地验证：

```text
previous/current/next 窗口
双层摘要
风险路由
一次性 Lease
失败不推进 Cursor
通过后推进一次
双活动 Slot 拒绝
LOW/MEDIUM Midscene Direct 路径
HIGH Midscene Locate + Playwright Commit 路径
事件重放
终态失败自动暂停 Schedule
NotificationOutbox 幂等
Agent Conversation 强制通知语义
两条 RecoveryOption
路径二变化描述门禁
```
