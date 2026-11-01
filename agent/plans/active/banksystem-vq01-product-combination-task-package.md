---
id: BANKSYSTEM-OSS-VQ01-PRODUCT-COMBINATION-001
title: Product combination and visual language confirmation
document_type: task
domain: frontend
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-30
owner: project-owner
---

# VQ-01：完整产品组合与统一视觉语言

## 业务目标

让项目负责人先确认最终产品组合的整体气质、四个使用表面的主次关系和演示时的第一印象，再分别确认客户、运营、CLI 和质量页面。

## 预览功能

- 客户门户是主要业务表面：账户、余额、快捷转账和近期交易。
- 运营控制台负责按业务关联号查询同一笔交易和账务结果。
- `hz-agent` 终端负责作者化、批准、执行和输出证据定位。
- Quality Portal 负责只读展示 Run、Evidence、ReleaseIdentity 和 Full18 结论。
- 四个表面共享稳重的银行视觉语言，但保持角色与权限边界。

明确不展示 Flowise、Coze、HiAgent、运行时 Mock、真实客户信息、直接数据库操作或可写 Quality Portal。

## 生图提示词

```text
Use case: ui-mockup
Asset type: high-fidelity 16:9 product portfolio visual confirmation board
Primary request: Show the final shipped experience of an open-source demo bank named 复兴银行 combined with a CLI browser-testing Agent named hz-agent, presented as one coherent Windows 11 desktop product family.
Scene/backdrop: clean professional desktop presentation, realistic enterprise software, no device mockup frame.
Subject: one dominant customer banking portal showing account overview, CNY balance, quick transfer and recent transactions; one operations console showing correlation-ID transaction lookup and ledger result; one terminal showing hz-agent journey author, approve, execute and PASS evidence; one read-only Quality Portal showing ReleaseIdentity and Full18 result.
Style/medium: high-fidelity enterprise fintech UI mockup, trustworthy, restrained and interview-portfolio quality, not science fiction.
Composition/framing: wide landscape; customer portal occupies about half the canvas; operations, terminal and quality surfaces are smaller but clearly legible and visually connected.
Lighting/mood: bright clean workspace with confident dark navy structure and subtle teal/cyan status accents.
Color palette: dark navy, white, cool gray, restrained teal and success green.
Text (verbatim): "复兴银行", "客户门户", "运营控制台", "hz-agent", "质量门户", "ReleaseIdentity", "18 / 18 PASS".
Constraints: clearly separate the four product surfaces; use only synthetic masked account data and CNY; desktop web layouts; realistic typography and spacing; no real bank logo; no real PII; no mobile screens; no watermark.
Avoid: Flowise, Coze, HiAgent, neon cyberpunk, excessive gradients, glassmorphism, clutter, source-code walls, tiny unreadable text, fake biometric or crypto trading features.
```

## 确认合同

- 确认：`确认 VQ-01`，或在 `VQ-01` 是当前唯一问题时明确回复 `继续`。
- 修改：`修改 VQ-01：<需要调整的视觉、主次或功能>`

确认后才生成 `VQ-02`。本轮决定约束 A03 客户/运营页面、A04 Quality Portal、A05 CLI 展示和 A08 演示资产；不授权这些小包进入实现。

## 候选记录

- 生成方式：内置 `imagegen`，一次基础生成、一次 CLI 定向修订、一次 `ReleaseIdentity` 单词定向修订。
- 候选图片：`docs/design/visual-acceptance/banksystem-v1/vq-01-product-combination-v1.png`。
- SHA-256：`b4055244a2febe7dcad91f3d56c7407036595d8a818df4c3d85dd085adedc6cb`。
- 文本合同：正式字段必须精确显示为 `ReleaseIdentity`；候选图中的 AI 字形近似不构成实现合同。
- 项目负责人原文决定：`继续`。
- 规范化决定：`CONFIRMED_AND_ADVANCE`，记录时间 `2026-08-30T21:28:19+08:00`。

最终提示词集合由上方基础提示词和两个定向编辑组成：

1. `仅把中下 hz-agent GUI 改为深色等宽字体 CLI，依次显示 hz-agent journey author、approve、execute、PASS 与 evidence path；其余布局不变。`
2. `仅把质量门户身份标题修正为精确、大小写敏感的 ReleaseIdentity；其余像素不变。`
