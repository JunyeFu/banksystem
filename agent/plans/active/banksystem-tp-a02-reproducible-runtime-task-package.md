---
id: BANKSYSTEM-OSS-A02-REPRODUCIBLE-RUNTIME-001
title: Fresh-clone reproducible runtime
document_type: task
domain: architecture
status: REVIEW
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: Codex
---

# TP-A02：新克隆可复现运行环境

## 业务目标

在 Windows 11 + Docker Desktop 的新克隆中，不依赖开发机绝对目录或预生成 `dist`，即可构建并启动银行与 CLI Agent。

## 切片

1. `RF-027-S1`：`COMPLETED`；命名数据卷、固定镜像标签、三个前端的通用多阶段镜像。
2. `RF-027-S2`：`COMPLETED`；根 `demo.ps1` 的 prepare/up/status/down/reset、单模型配置、本地秘密生成与一次受控运行闭环已完成。
3. `RF-029-S1`：`COMPLETED`；Agent 自有锁文件安装 Playwright 1.59.1、Midscene 1.10.5 与 Chromium 1217，不依赖 Flowise。
4. `RF-027-S3`：`COMPLETED`；精确 reset 所有权、可恢复快照、两次空状态启动与原状态哈希恢复已通过。黄金链归 A03，通用发布验证归 A06，不在本切片接线。
5. `RF-027-S4`：`COMPLETED`；当前非忽略候选树已冻结为临时 Git 提交，在独立干净克隆和隔离卷中完成完整生命周期，并证明原状态不变。

## 易错点

- Compose 健康只证明进程，不证明银行黄金业务或 Agent LIVE。
- 不通过数据库卷预置业务结果；业务数据只能由 A03 经 API 播种。
- 不调用 Flowise 的 PREPARE/START/STATUS/STOP。
- `down` 不删除卷；破坏性 reset 必须是独立显式命令。

## 完成门

两个 Compose 配置校验、三个前端镜像构建、根生命周期合同测试与一次空卷冷启动全部通过；证据等级最高为 INTEGRATION，不能代替 A03/A06。

## 当前状态

本机双冷启动与恢复验证位于 `agent/runs/rf027-s3/20260901-110552`；独立干净克隆完整生命周期位于 `agent/runs/rf027-s4/20260903-144753`。A02 当前进入 `REVIEW`：本机源码独立克隆门已通过，仍不等价于 GitHub 下载或另一台 Windows 11 新机器复验。
