---
id: DOC-ARCH-RF000-DECISIONS
title: RF-000决策记录
document_type: decision
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# RF-000决策记录

1. 采用增量重构和绞杀者迁移，不从零重写。
2. 保持项目现有多运行角色，新增部署单元必须经ADR。
3. 银行Channel继续采用模块化单体；衡准先建立逻辑模块和公开合同。
4. RF-000只建立治理和事实入口，不修改业务代码。
5. 现有脏工作区归用户所有，批次验证不得要求清理或广泛暂存。
6. 2026-08-01：`PROPOSED → BASELINE_FROZEN`，以HEAD和脏树清单冻结治理前基线。
7. 2026-08-01：`BASELINE_FROZEN → CONTRACT_APPROVED`，Schema、模块边界和验证合同通过。
8. 2026-08-02：`CONTRACT_APPROVED → IMPLEMENTING → SHADOW_VERIFIED`，文档校验器以影子方式调用重构校验器，未修改业务运行模块。
9. 2026-08-02：`SHADOW_VERIFIED → CUTOVER_READY → CUTOVER → OBSERVING`，控制切换仅指唯一实施顺序、批次Schema和校验器开始生效，不包含运行时流量切换。
10. 2026-08-02：观察期复验确认ReleaseIdentity、Agentflow源/部署Hash和18链计数无变化，进入`ACCEPTED → CLEANUP_ELIGIBLE → CLOSED`。
11. RF-000关闭不授权删除历史文件；后续清理仍必须在独立批次中逐项证明无引用。
