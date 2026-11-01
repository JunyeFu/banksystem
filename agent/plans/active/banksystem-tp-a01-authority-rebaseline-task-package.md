---
id: BANKSYSTEM-OSS-A01-AUTHORITY-REBASELINE-001
title: Open-source product authority rebaseline
document_type: task
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: Codex
---

# TP-A01：权威基线与完成定义

## 业务目标

把完整、可复现的开源银行演示系统与 CLI Agent 固化为唯一当前交付目标，避免历史 Flowise 计划继续控制产品运行和发布。

## 输入与输出

输入为 Git `552b3b8ac517bd5991bff446e72d9f4e87ea9543`、干净工作树、运行态不可用和无当前 LIVE 身份对齐。输出为产品基线、A01-A08 机器可读组合、RF-026 证据和两项权威状态更新。

## 实现

只修改治理与架构文档：固定双产品边界、唯一数据权威、证据等级、ReleaseIdentity 组成、无 Flowise 产品路径以及 A01-A08 顺序。不得修改产品代码、数据库、运行配置、正式账本或发布状态。

## 项目易错点

- Fineract 才是银行账务事实，门户展示不是账务证明。
- Harness SQLite 才是自动化状态事实，质量页面不是写入者。
- 离线测试、健康检查和 Git 推送都不是 LIVE_E2E。
- 取消 Flowise 产品依赖不得删除或改写历史证据。

## 验证

```text
py -3 scripts/architecture/validate_refactoring.py --batch RF-026
py -3 scripts/architecture/validate_refactoring_temporal.py
python scripts/docs/validate_docs.py
git diff --check
```

## 完成门

四个命令退出 0；RF-026 进入 CLOSED；A01 进入 REVIEW；A02-A08 保持 BLOCKED；运行态、ReleaseIdentity 和正式账本不改变。
