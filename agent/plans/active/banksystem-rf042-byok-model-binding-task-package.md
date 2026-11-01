---
id: BANKSYSTEM-RF042-BYOK-MODEL-BINDING-001
title: RF-042 single BYOK model binding task package
document_type: task_package
domain: delivery
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-042：单 BYOK 模型绑定与显式探测

## 业务目标

测试人员配置唯一 OpenAI-compatible 模型后，可用一次最小请求确认绑定；成功结果只暴露模型名和 Base URL 哈希，失败返回明确机器码。

## 输入与输出

输入仅为 `HENGZHUN_MODEL_NAME`、`HENGZHUN_MODEL_BASE_URL`、`HENGZHUN_MODEL_API_KEY`。输出为脱敏绑定摘要和 READY/NOT_READY 结果。

## 实现

- 抽出可独立调用的模型探测器，并由 `hz-agent doctor` 复用。
- 对配置缺失、URL 非法、网络失败、HTTP 失败、响应 JSON 非法和响应结构非法分别返回稳定错误码。
- 每次调用只发送一次非流式、无工具、低输出预算请求。
- 不记录或返回 API key、Authorization header 或服务响应正文。

## 项目易错点

- 不增加备用模型、重试或自动修复。
- 不把 Base URL 明文写入输出和证据。
- 模型 READY 不代表 Harness、浏览器、银行或 LIVE_E2E READY。
- 本批不实现 Journey author、validate 或 approve。

## 验证

- CONTRACT：三变量、端点规范化、脱敏摘要和错误码测试。
- INTEGRATION：本机已配置端点执行一次真实最小探测，首次确定性失败即停止。
- LIVE_E2E：不在本批执行。

## 完成门

离线合同测试和一次真实模型探测通过；证据不含密钥或 Base URL 明文；源码变化使旧 ReleaseIdentity 失效，但本批不冻结新身份。
