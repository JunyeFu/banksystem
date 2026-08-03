---
id: DOC-ARCH-RF003-EVIDENCE
title: RF-003证据索引
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-003证据索引

| 门禁 | 当前结果 | 证据 |
|---|---|---|
| 执行基线 | 冻结：HEAD`ba41e20`、identity`632ad5ee`、版本三源现状（8.0.0/10.0.0/10.1.0） | `baseline.md` |
| 批次骨架 | PROPOSED：9 制品齐全，校验器可过 | `batch.yaml`、`python scripts/architecture/validate_refactoring.py` |
| 范围授权 | ✅ 已授权：target-design v1.0 用户批准（2026-08-03） | `target-design.md`、`decision-log.md`条目3 |
| S1版本基线 | PASS（CONTRACT）：三源漂移冻结（8.0.0/10.0.0/10.1.0）、版本策略断言、身份安全性（合同非身份输入） | `rf003-s1-version-baseline.test.cjs`（4/4）、`contract-delta.md` |
| S1聚焦测试 | PASS：60/60（含RF-001/RF-002回归56） | `node --test` 12个验证文件（exit 0） |

| S2版本统一实现 | PASS：SDK/健康版本从合同派生（V1/V2）、启动失败关闭、三源一致（V3）、S1锚点翻转 | `rf003-s2-version-unify.test.cjs`（2/2）、`mcp/src/server.cjs` |
| S2聚焦测试 | PASS：62/62（含RF-001/RF-002回归60） | `node --test` 13个验证文件（exit 0） |

RF-003当前：target-design已批准、S1完成（版本契约基线）、S2完成（版本统一实现）。下一门禁S3（生产切流关闭）。
