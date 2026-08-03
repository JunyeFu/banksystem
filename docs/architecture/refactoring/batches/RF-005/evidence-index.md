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

| S2单路由实现 | PASS：i8路由/三输入退场（v7零消费者）、DP-R5-1改名、aliases 13→10、锚点翻转 | `rf005-s2-single-route.test.cjs`（3/3）、`mcp/src/rf001-contract-adapter.cjs` |
| S2聚焦测试 | PASS：81/81（含RF-001/002/003/004回归80） | `node --test` 18个验证文件（exit 0） |

| S3生产切流与关闭 | ✅（RUNTIME_CUTOVER+OBSERVE）：case_prepare i10链路实测、工具规范信封、run_submit 202、批次CLOSED、**全景终态8/8** | `batch.yaml`（CLOSED）、`.data/logs/i10-start-rf005-s3.log` |

**L1 重构全景 CLOSED（2026-08-03）**：RF-000~RF-005 全部完成；终态指标 8/8 达成（状态推断 0、条件副作用 0、重复入口 0、状态语义可验证 100%、缺陷归属全关闭、版本来源 1、凭据绑定 100%、兼容层退场 100%）。
