---
id: DOC-AGENT-BANKSYSTEM-A03
title: Bank System A03 Golden Path Task Package
document_type: task
domain: agent
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---

# TP-A03：银行业务黄金链路

## 业务目标

合成客户登录后从付款账户向目标账户转账，客户与运营端使用同一 correlation ID 回读 Fineract 决定的结果。

## 输入与输出

输入为 A02 可复现拓扑、Keycloak、本地 Test Support 权限、Gateway 和 Fineract。输出为固定 `bank-transfer-golden` 结果、前后余额、Fineract transaction ID 和关联证据。

## 实现

- RF-030：幂等客户/账户种子与持久身份映射。
- RF-031：转账合同、幂等执行、余额守恒与关联账本。
- RF-032：客户确认命令、共享客户端 correlation/confirm 与真实 API 结算结果（已关闭）。
- RF-033：客户页面接线与 Fresh 浏览器证据（已关闭）。
- RF-034：运营端精确关联查询与只读详情浏览器证据（已关闭）。
- RF-035：根 `run-golden-path` 的 API-only 编排、重复 Fresh 运行与临时身份清理（已关闭）。
- RF-036：客户登录、账户概览、Fineract 余额与 VQ-02 Fresh 浏览器证据（已关闭）。
- 凭据脱敏 trace 留给统一证据包任务；A03 已进入 REVIEW，不提升为 LIVE_E2E 或发布结论。

## 项目易错点

Fineract 是唯一账务真相；不得随机重复建客户、吞掉账户命令、把幂等键当 correlation ID、从 Channel 审计推断 Fineract 交易或由前端直连核心。

## 验证

各 RF 独立执行 STATIC、CONTRACT、INTEGRATION 和 LIVE_E2E 分级命令；低级证据不能代替浏览器黄金链或发布结论。

## 完成门

重复播种无重复实体；重复转账无重复记账；余额守恒；两端显示同一金额、状态、关联号；重启后身份和历史仍可回读。所有合同或源码变化要求冻结新 ReleaseIdentity 后才可进入正式清单。
