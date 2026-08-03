---
id: DOC-ARCH-RF004-EVIDENCE
title: RF-004证据索引
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-004证据索引

| 门禁 | 当前结果 | 证据 |
|---|---|---|
| 执行基线 | 冻结：HEAD`70cf25f`、identity`632ad5ee`、凭据绑定现状（C1-C5） | `baseline.md` |
| 批次骨架 | PROPOSED：9 制品齐全，校验器可过 | `batch.yaml`、`python scripts/architecture/validate_refactoring.py` |
| 范围授权 | ✅ 已授权：target-design v1.0 用户批准（2026-08-03） | `target-design.md`、`decision-log.md`条目3 |
| S1凭据绑定基线 | PASS（CONTRACT）：C1-C5 现状冻结、v7 零 credentialAlias 调用复核 | `rf004-s1-credential-baseline.test.cjs`（5/5）、`contract-delta.md` |
| S1聚焦测试 | PASS：67/67（含RF-001/002/003回归62） | `node --test` 14个验证文件（exit 0） |

| S2 MCP凭据注入退场 | PASS：默认停注入、LEGACY唯一回退通道、条件装配、DP-S4-1=A决策 | `rf004-s2-mcp-credential-exit.test.cjs`（3/3）、`mcp/src/rf001-contract-adapter.cjs` |
| S2聚焦测试 | PASS：70/70（含RF-001/002/003回归67） | `node --test` 15个验证文件（exit 0） |

| S3 Harness端点解析 | PASS：schema可选化、enqueueRun可空化、caseCredentialRef解析、失败关闭（DP-S4-2=A）、占位不落库 | `rf004-s3-harness-credential-resolution.test.cjs`（5/5）、`harness/src/service.ts` |
| S3聚焦测试 | PASS：75/75（含RF-001/002/003回归70） | `node --test` 16个验证文件（exit 0） |

| S4生产切流与关闭 | ✅（RUNTIME_CUTOVER+OBSERVE）：run_submit无注入+credentialRef 202实测、工具规范信封、身份/18链一致、批次CLOSED、RF-005解禁 | `batch.yaml`（CLOSED）、`.data/logs/i10-start-rf004-s4.log` |

**RF-004 批次 CLOSED（2026-08-03）**：S1凭据绑定基线→S2 MCP停注入（DP-S4-1=A）→S3 Harness解析（DP-S4-2=A，零迁移零Worker改动）→S4生产切流观察。终态指标达成：执行凭据绑定权威化 100%（i3-customer 仅 LEGACY 通道）。
