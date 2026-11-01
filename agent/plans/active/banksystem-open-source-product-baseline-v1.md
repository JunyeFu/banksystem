---
id: BANKSYSTEM-OSS-PRODUCT-BASELINE-V1
title: Open-source bank demo and CLI Agent product baseline
document_type: plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# 开源银行演示系统与 CLI Agent 产品基线 v1

## 产品完成谓词

产品由两个可独立理解、可联合演示的部分组成：复兴银行演示系统与 `hz-agent` CLI 自动化测试 Agent。Windows 11 + Docker Desktop 是 v1 唯一交付环境；模型只接受用户配置的一个 OpenAI-compatible BYOK 端点，不提供备用模型、运行时 Mock、静默降级或宽泛重试。

银行链路固定为 `Portal -> Gateway -> Bank Channel -> Fineract API`，Fineract 是账户、余额和交易唯一真相源。自动化链路固定为 `hz-agent -> Controller -> independent MCP -> Harness -> Worker -> Playwright/Midscene`，Harness SQLite 是 Journey、执行与证据唯一真相源。Quality Portal 只读取 Harness 投影，不形成第二控制面。

Flowise、Coze 与 HiAgent 只保留历史证据；它们不进入构建、启动、运行、恢复、CI 或发布门。

## 完成等级

- `STATIC`：源码、格式、类型和构建成立。
- `CONTRACT`：单个公开边界在受控输入下成立。
- `INTEGRATION`：真实组件组合成立，但可使用测试专用确定性模型。
- `LIVE_E2E`：当前 ReleaseIdentity 使用配置模型和真实浏览器到达银行业务终态，并写入不可变证据。
- `HUMAN_ACCEPTED`：维护者完成演示与证据审阅。
- `RELEASED`：Full18、冷启动复验、CI、许可证和发布物共同通过。

低等级证据不得提升为高等级结论。源码、合同、构建产物、非秘密模型绑定或正式测试清单改变时必须冻结新 ReleaseIdentity。

## 唯一黄金链路

`客户登录 -> 账户查询 -> 转账 -> 客户回读 -> 运营回读 -> CLI 作者化 -> 精确批准 -> 浏览器执行 -> Harness 证据 -> Quality Portal 同身份展示`。

金额、认证、幂等、关联号、账务事务、凭据隔离和证据 Hash 是业务边界，不属于被拒绝的推测性防御。

## 实施组合

机器可读的 A01-A08 顺序见 `banksystem-open-source-task-packages-v1.yaml`；状态只以 `agent/backlog.yaml` 为准，顺序只以 `v54-implementation-batches.md` 为准。每个后续包必须先具有独立 RF 批次、切片和命令级任务包。

大中小三层细化、业务常识、项目易错点、具体实现模板和 `VQ-01` 至 `VQ-08` 逐屏问答门见 `banksystem-three-level-development-control-v1.yaml`。带视觉门的小包只有在项目负责人确认对应问答后才能 READY；生图不是接口、页面状态或完成证据。

本基线只产生 DOC/GOVERNANCE 证据，不证明服务、模型、浏览器、18 链或发布已就绪。
