---
id: DOC-ARCH-RF005-EVIDENCE
title: RF-005证据索引
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-005证据索引

| 门禁 | 当前结果 | 证据 |
|---|---|---|
| 执行基线 | 冻结：HEAD`d914998`、identity`632ad5ee`、双路由现状（C1-C5） | `baseline.md` |
| 批次骨架 | PROPOSED：9 制品齐全，校验器可过 | `batch.yaml`、`python scripts/architecture/validate_refactoring.py` |
| 范围授权 | ✅ 已授权：target-design v1.0 用户批准（2026-08-03，含 DP-R5-1 改名决策） | `target-design.md`、`decision-log.md`条目3 |
| S1双路由基线 | PASS（CONTRACT）：C1-C5 现状冻结、v7 零 i8 调用复核、DP-R5-1 记录 | `rf005-s1-dual-route-baseline.test.cjs`（5/5）、`contract-delta.md` |
| S1聚焦测试 | PASS：80/80（含RF-001/002/003/004回归75） | `node --test` 17个验证文件（exit 0） |

RF-005当前：target-design已批准、S1完成（双路由基线冻结）。下一门禁S2（单路由实现+改名）。
