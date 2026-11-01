---
id: DOC-ARCH-RF057-A01-LIVE-REVALIDATION-002
title: RF-057 A01 repaired-source live revalidation
document_type: evidence
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-28
owner: Codex
---
# A01 修复后真实复验：FAILED

用户要求恢复 A01，并明确不再等待另一次批准；本次按既有 S2 细化链执行，不修改全局身份或安全合同。当前身份 `7e4cadd2db9224bd1da58ff66ca83afcbf1ead1e16dc6e9a45899285a7913214`，suite SHA256 `8a13efde39130e2842f8452f4fbb3a5208e023b5bd60bc21046c28428eb2b3de`。授权预检返回 `AUTHORIZED / EXACT_IDENTITY_MATCH`。

## 实际命令与结果

1. 使用 owned lifecycle `stop`、`start` 替换三项 Agent 原生进程；绑定上述身份。未调用 Docker down/reset 或重启银行容器。
2. 根目录在本进程绑定 `HENGZHUN_AUTHORIZE_AGENT_LIVE` 后执行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test/rf057-bank.ps1 -Profile Agent`。这是一次真实 BYOK A01，不是历史 Flowise/L1/Full18，也不是 Mock。
3. 命令退出 1；驱动报告 A01 FAILED，CLI 安全码 `JOURNEY_EXECUTION_FAILED`、阶段 `AUTHORING_EXECUTION`、CLI exit 4。run `0be5d8f7-9148-483c-856d-74495f20fb95`，报告 `agent/runs/rf057-agent/0be5d8f7-9148-483c-856d-74495f20fb95/report.json`。首次失败后停止，未重跑或进入 A02。
4. 清理完成，回执 `agent/runs/rf057-cleanup/d7381ebbf614464e9c102051e6de6296.json`，COMPLETED。保留的业务数据、历史证据和原凭据未删除。

## 最小只读失败证据

通过现有加密会话应用及 bearer-protected Harness GET 语义接口回读，未输出会话内容、Token、密码、模型响应或原始日志：

- session `session-2a63bdd86c8f5585ca4f951a7bd165bc`；Journey `journey_044361d1-719b-4bdb-8162-98c7d1cb6984`，version 6，`FAILED_ACTIONABLE / FAILED`，实际业务错误 `I10_MIDSCENE_LOCATOR_MISMATCH`。
- case `case_a5df69ed-81b8-4e70-8f71-cdf68ff79146`；preparation `prep_b03c38c8-8467-4c6c-8638-6c020af0f1e8`，`AWAITING_STAGE3`。
- executable plan `eap_645f7133caa84fcde7de303c0e79d079100f0ff7`；build job `buildjob_eb780c21-9e3a-4bd0-8966-276d1d6eb57d`，FAILED，同一业务错误。
- 该 job 现有诊断文件的结构化投影确认 job ID 一致：act01 打开 `/portal/login` 成功；act02 / `DYNAMIC_002` 的三次模型定位都收到内容，但在 `TARGET_VALIDATION` 被拒绝，`I10_MIDSCENE_TARGET_VALIDATION_FAILED`。这些是现有内部定位尝试，不是额外启动的三个 A01。没有新的候选成功、稳定证书或正式 PASSED Run。
- 当前真实 TargetProfile `targetprofile_6bf753fc-7ddf-4ab9-8b8d-76d2b6de0ee0`，version 2 / ACTIVE；binding `fuxing-bank-demo@2.0.0`，manifest hash `03d4d84eab6defda8f54f2de7fed5841fd3337543a78df5759c7b40dfebc7f03`。导航源为门户 18082 和 Keycloak 19000；凭据源仅 Keycloak。这次不是旧认证档案/旧源放行失配。

定位坐标、目标验证为何不匹配尚未在本轮证据中完全确定；不得仅据错误码归因于模型故障、银行缺陷或旧密码控件。已观测的另一个问题是 CLI 等待投影返回泛化 `JOURNEY_EXECUTION_FAILED`，而 Harness Journey 保留更具体业务码，后续应核对该投影边界。

## 运行态与验收边界

复验后原生服务 `HEALTHY`、owned/current 均 true：Harness PID 22100、MCP 36728、Worker 41592；15 个 Docker 容器仍 Up。非运行 preflight 为 `RUNTIME_READY`，源码身份前后相同；显示的 `LIVE_AUTHORIZATION_REQUIRED` 是该只读命令的通用提示，不是本轮尚待人工批准。

新部署的 Quality cases 分页 GET 200；单独只读观察 runs 列表 GET 仍 413，属于另一未闭合的列表预算问题，不是本次作者化失败原因，也不能据 cases 修复声称整个质量门户验收通过。

A01 失败证据已保存，S2 仍 IMPLEMENTING；A02–A07、压力/性能和最终 GO 未完成。本轮未进一步修改产品源、增加模型重试或自动运行下一个场景。
