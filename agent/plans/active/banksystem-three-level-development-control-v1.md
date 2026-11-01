---
id: BANKSYSTEM-OSS-THREE-LEVEL-CONTROL-V1
title: Open-source bank and CLI Agent three-level development control
document_type: plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# 开源银行与 CLI Agent 大中小三层开发控制

## 控制映射

管理视角采用三层，执行视角继续满足仓库四级细化门禁：

| 管理层 | 业务含义 | 必须落盘的执行制品 | 状态上卷条件 |
|---|---|---|---|
| 大包 | A01-A08 的完整产品结果 | `v54-implementation-batches.md` 中的唯一顺序授权 | 所属中包全部通过 |
| 中包 | 单一业务能力、单一变化轴 | `RF-xxx/batch.yaml`、基线、合同、回滚和证据索引 | 所属小包全部 REVIEW 且证据接受 |
| 小包 | 1-3 天可完成的可观察结果 | 一个 slice 与一个命令级 task package | 命令 done 条件通过并完成逐级回灌 |

机器可读的完整控制树、业务常识、项目易错点和八类实现模板见 `banksystem-three-level-development-control-v1.yaml`。它不创建第二状态源：任务状态只读 `agent/backlog.yaml`，实施顺序只读 `v54-implementation-batches.md`。

## 逐屏问答验收

视觉确认按 `VQ-01` 到 `VQ-08` 串行进行。每轮只展示一张 AI 预览图，并同时给出：用户角色、可执行动作、可观察结果、明确不实现的能力和受该决策约束的小包。项目负责人可以确认当前问题、在当前问题唯一时明确要求“继续”，或给出当前问题的具体修改；未记录文本决定前不生成下一屏。

AI 图片只用于确认信息架构、视觉层级和使用感受。最终 UI 合同来自文本决定、OpenAPI、页面状态和浏览器验收，不能从生图中的随机文字或像素反推实现要求。

视觉顺序：

1. `VQ-01`：完整产品组合与统一视觉语言。
2. `VQ-02`：客户登录与账户总览。
3. `VQ-03`：客户转账与结果回读。
4. `VQ-04`：运营端交易检索与账务核验。
5. `VQ-05`：CLI 测试作者化、校验与批准。
6. `VQ-06`：CLI 真实执行与证据展示。
7. `VQ-07`：只读 Quality Portal。
8. `VQ-08`：开源首页、五分钟启动和面试演示路径。

## 状态规则

- 同时只能有一个小包处于执行态。
- 带 `visualGate` 的小包在对应问答确认前不得 READY。
- 中包进入实现前必须分配独立 RF 编号，不能用本控制文件代替批次合同。
- 首次确定性失败立即停止；不得以图片确认、静态构建或 Git 推送替代 LIVE_E2E。
- 问答修改只影响尚未实现的对应小包；若改变已冻结合同或源码，必须生成新 ReleaseIdentity。

## 当前门

`VQ-01` 至 `VQ-08` 已由项目负责人全部确认，RF-028 已关闭。A04 的 RF-037 至 RF-039 已完成只读门户工程链。A05 的 RF-040 至 RF-044 已完成 doctor、会话、模型绑定、候选冻结回读和显式精确批准。A05-M03-S01 已修复 session runtime contract 与 MCP `/mcp` 端点并真实完成 session start；新身份运行重验在单次 `journey author -> AGENT_ADAPTER_MODEL_TIMEOUT` 首次失败处停止。Worker 与浏览器尚未执行，LIVE_E2E 尚未执行。
