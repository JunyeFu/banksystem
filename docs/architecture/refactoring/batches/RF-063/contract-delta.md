---
id: RF063-CONTRACT-DELTA-MD
title: RF063 contract-delta.md
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-02
owner: Codex
---

# 合同变化

AsyncAPI 0.3.0 加入 loan.operation.completed（成功还款/关闭的持久事件，现有事件不变）。Liquibase v16 新增 loan_core_operation，并允许非转账聚合的 outbox 行不携带 transfer_id；Transfer 聚合继续要求 transfer_id=aggregate_id。公开还款/关闭成功字段不变；重复请求只读恢复，未知或拒绝为409，不重复提交核心。

保留贷款/转账既有公开字段形状；interestRate明确为年利率。内部贷款命令增加还款方式。资金结果未知和EOD作业恢复需要显式状态；合同变更与客户端同片完成。拒绝用空总账或本地投影冒充核心核验。

Quality ReleaseEvidence.evidenceSha256保持必填但允许null，表示未形成验证过的发布包；DRAFT的benchmarkPassRate仅是当前身份已观察运行通过比例，不证明正式清单覆盖。缺正式验证时不得READY/RELEASED或PASS。

