# V5.4 外网演示完整产品规划 Track

> 状态：规划基线，非实现完成证明
> 更新：2026-07-14
> 上游：`docs/architecture/v5.4-reference/`

## 目标

在外网隔离环境演示完整的开源银行系统与完整回归测试平台；评审通过后，在不降低功能和安全门禁的前提下迁移到公司内网。

## Track 划分

### Track A：银行核心目标系统

继续使用当前 S0-S7 计划、Fineract 唯一账务事实源、Bank Channel Service、Customer Portal、Operations Console、Mifos X、资金安全、审计、对账、恢复和现有质量门禁。V4 落地必须同时满足 [`v4-v54-compatibility-baseline.md`](../docs/architecture/v4-v54-compatibility-baseline.md)，使银行系统从第一天就具备可重复流程、可重置 Fixture、页面/账务双 Baseline、稳定控件和证据关联能力。

### Track B：回归测试平台

按 v5.4 四阶段推进：

1. 测试目标、人工成功案例、Fixture、Baseline 和案例导出；
2. Playwright 脚本资产、独立验证、定时回归和失败事件；
3. HiAgentPattern、RAG、Coze/企业 Agent Adapter、三动作窗口、Midscene 原子动作、事实采集、脚本生成和反向恢复；
4. 双 Track 集成、基准评测、企业联调、安全、交付和内网迁移准备。

## 状态规则

- 当前银行核心状态不得因 v5.4 目标文档变更而自动变为 DONE。
- v5.4 平台能力使用 `PLANNED`、`POC_VERIFIED`、`LOCALLY_VERIFIED`、`PENDING_ENTERPRISE_VALIDATION`、`ACCEPTED`。
- 正式定时回归只执行 `SCRIPT_VALIDATED` 脚本，不调用 LLM、Midscene 或视觉模型。
- v5.4 目标计划不授权直接修改银行核心数据库、既有 Liquibase changeset、现有 API 契约或生产凭据。

## 外网演示门槛

- 仅使用虚构或脱敏数据；
- 外部入口必须经过 TLS 边界和最小权限认证；
- Fineract、数据库、ActiveMQ、内部 Worker 和凭据不直接暴露；
- 全部脚本生成、验证、Baseline、证据、审计、通知和失败恢复链路可追溯；
- 评审后只替换平台、模型、质量平台、企业认证、通知和网络适配，不删除安全与验收门禁。
