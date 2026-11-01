---
id: RF065-CONTRACT-DELTA
title: CI合同
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-09
owner: Codex
---

# CI合同

公开银行/Agent API及数据库迁移均不改变。CI命令成功仅表示对应检查级别，不产生GO或LIVE。确定性模型只在测试进程；所有子命令非零使门失败。依赖安装只对隔离checkout，原工作区已有依赖不自动重装。

