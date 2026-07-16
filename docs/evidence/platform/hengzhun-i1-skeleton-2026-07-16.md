---
id: DOC-EVIDENCE-HENGZHUN-I1-SKELETON-20260716
title: 衡准 I1 单目录产品骨架验证记录
document_type: report
domain: evidence
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-16
owner: 傅钧烨
---

# 衡准 I1 单目录产品骨架验证记录

## 范围

本记录只证明唯一开发顺序 I1 的第一开发步骤：建立单目录产品边界、迁移固定运行时副本、隔离运行数据、建立兼容制品登记与验证入口。它不证明 Harness、Worker、七工具 OpenAPI、Coze Agent/Workflow/Knowledge Base 或 HiAgent 已安装可用。

## 实际落地

- 产品根：`platform/hengzhun-regression-system/`。
- 模块目录：`coze`、`harness`、`worker`、`runtime`、`contracts`、`tests`、`scripts`、`docs`、`config` 与本地 `.data`。
- 固定运行时从 `platform/runtime` 复制到产品目录；复制结果为 25,363 个文件、880,433,971 字节。
- 旧 `platform/runtime` 保留，不执行删除，以便新副本失败时回滚。
- `.data`、产品运行时二进制、依赖、浏览器、测试结果与日志均由忽略规则排除。
- 三个 Skill、一个七工具插件和 `PLAT-V001` 至 `PLAT-V014` 只建立登记；状态均未冒充平台已安装或已验证。

## 验证结果

在 `platform/hengzhun-regression-system/` 执行 `verify.cmd`：

1. `HENGZHUN_I1_SKELETON_READY`：必需目录、控制文件、私有 package 和 Node 版本锁定均通过。
2. `DEMO_RUNTIME_VERSION_FROZEN`：Node `v20.20.2`、Playwright/Test/Core `1.59.1`、Midscene Web/CLI `1.10.5`、Chromium `147.0.7727.15` 与 FFmpeg 目录通过；Chromium 实际启动成功。
3. 最终返回 `HENGZHUN_I1_SKELETON_VERIFIED`，进程退出码为 0。

验证过程未安装或下载依赖，未调用外部模型，未读取或输出 `.env`、密钥、凭据、Token、Cookie 或个人信息。

## 剩余边界

- I1 尚需完成 Coze Studio、本机网络路径和公开界面平台一致性实测。
- `PLAT-V001` 至 `PLAT-V014` 当前仍按登记状态逐项验证，不能从目录或 CLI 存在推断通过。
- GAP-002 仍开放；Harness、SQLite、OpenAPI、Worker 和首个纵向闭环属于后续步骤。
