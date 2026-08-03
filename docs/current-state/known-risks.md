---
id: DOC-STATE-KNOWN-RISKS
title: 当前已知风险
document_type: current-state
domain: current-state
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 当前已知风险

| 风险 | 状态 | 控制 |
|---|---|---|
| 工作区存在多项未提交实现 | CONFIRMED | RF批次显式白名单，不广泛暂存或清理 |
| Harness/Worker内部模块边界不足 | CONFIRMED | 标记LEGACY_UNENCAPSULATED，先合同后迁移 |
| 当前运行进程可能与源码漂移 | REQUIRES_LIVE_CHECK | 每次基线记录ReleaseIdentity、PID、迁移和Agentflow Hash |
| 表级所有权尚未全量登记 | NOT_MEASURED | 数据批次前强制生成所有权清单 |
| 源码依赖指标尚未全量采集 | NOT_MEASURED | RF-000后建立语言级依赖扫描器 |
| 历史计划与当前I10状态可能冲突 | CONFIRMED_HISTORY_RISK | 唯一实施顺序、backlog和能力矩阵裁决 |
| 本机Flowise能力迁移至HiAgent存在平台差异 | OPEN_EXTERNAL_GATE | 只使用已证实能力交集，服务器另行验收 |

