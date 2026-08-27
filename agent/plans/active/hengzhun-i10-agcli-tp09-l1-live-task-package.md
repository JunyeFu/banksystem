---
id: HENGZHUN-I10-AGCLI-TP09-L1-LIVE-001
title: CLI Agent L1 live validation
document_type: task
domain: architecture
status: BLOCKED
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# TP09：L1 LIVE

目标：对冻结 v4 候选身份按顺序运行 `TEXT_ONLY`、`TEXT_WITH_IMAGE`。业务规则：需新的显式 runtime/live 授权；先公共回读和身份对齐；首次确定性失败立即停止；不做 Flowise shadow retry。易错点：沿用旧 Browser/OCR、失败后重试第二变体、L1 当 18/18、发布回读缓存冒充实时。

执行模板：preflight → managed start → public readback → freeze identity → current Browser/OCR → TEXT_ONLY → TEXT_WITH_IMAGE → stop/evidence。Done：两个变体在同一身份通过且证据可回读；只解锁 TP10，不声明完整上线。

执行批次：`RF-024`。S1 已离线完成 fresh Journey bootstrap：新 `run` 无需预设 Journey；写前返回加密 LOW 风险提案，批准后一次 `journey_prepare`，再原子改绑权威 Journey 并进入 Controller。S2 的正常生命周期、配置模型身份公共回读、loopback 附件导入、精确批准检查点和变体顺序编排已完成离线实现；真实执行仍只阻塞于新的明确 CLI LIVE 授权，旧 Flowise 发布/回读授权不复用。
