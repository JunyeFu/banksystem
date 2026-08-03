---
id: EVIDENCE-HENGZHUN-I9-P1-RUNTIME-BASELINE-20260721
title: 衡准 I9 P1 产品化基线与运行时收编证据
document_type: evidence
domain: platform
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-21
owner: project-owner
date: 2026-07-21
---

# 衡准 I9 P1 产品化基线与运行时收编证据

## 结论

I9 P1 已通过。该结论只证明 Windows 原生 Flowise 正式运行底座已被产品收编且可离线静态验真，不证明 P2 四服务已经启动、Flowise 已存在正式 URL、Agentflow 已发布或 HiAgent 已验收。

## 冻结基线

- I8 基线提交：`29c3428`。
- Flowise：`3.0.12`。
- Node：产品自带 `20.20.2`。
- Chromium：产品自带 revision `1217`；FFmpeg revision `1011`。
- Flowise 运行时正式边界：`platform/hengzhun-regression-system/flowise/app/`。
- 依赖声明与锁：`flowise/runtime-package.json`、`flowise/runtime-package-lock.json`。
- 机器可读基线：`flowise/manifests/i9-p1-runtime-baseline.json`。

## 完整性证据

- 运行树文件数：`288538`。
- 运行树总字节：`1966406537`。
- 目录 Hash 算法：按排序后的 POSIX 相对路径、文件字节数和单文件 SHA-256 聚合。
- 目录 SHA-256：`7b92a8e4a4ff0e52c6428f43b571be39766c0430dbc5bdf5609200b8b81694a6`。
- 依赖锁 SHA-256：`3cc2128e633468729b8acdf6afb6a2cd3a9f8f43cfe4f8a7e024853d47bd24cd`。

## 网络与配置边界

- 正式 TCP 端口已登记：Flowise `3006`、Harness `18788`、MCP `18789`。
- 验证时三个端口均无监听冲突。
- 配置 Schema 固定 `127.0.0.1`，路径只能是产品根内相对路径。
- 配置只保存凭据环境变量名，不保存 Token、API Key 或账号密码。

## 验证结果

执行：`npm.cmd run verify:i9:stage1`。

- P1 单元测试：`3/3` 通过。
- 端口冲突门禁：通过。
- Bundled Node 版本与 Flowise 入口语法检查：通过。
- 四项 Flowise 依赖精确版本检查：通过。
- 依赖声明、依赖锁和完整运行树 Hash 独立复算：通过。
- 终态标记：`HENGZHUN_I9_STAGE1_RUNTIME_BASELINE_VERIFIED`。
- 产品总门禁从仓库根执行：I1— I8 与 I9 P1 全部通过，终态标记为`HENGZHUN_I1_I2_I3_I4_I5_I6_I7_I8_STAGE7_AND_I9_STAGE1_VERIFIED`。
- 总门禁曾发现I8测试仍引用探针运行时；已改为正式`flowise/app/`并复验I8累计`32/32`通过。

## 剩余边界

下一步为 I9 P2：实现 Harness → MCP → Worker → Flowise 的产品自有准备、启动、停止、状态检查、PID 归属、健康门禁和失败清理。P2 通过前不得声称 Flowise 平台可使用。
