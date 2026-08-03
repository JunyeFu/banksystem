---
id: DOC-ARCH-RF002-EVIDENCE
title: RF-002证据索引
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-03
owner: project-owner
---

# RF-002证据索引

| 门禁 | 当前结果 | 证据 |
|---|---|---|
| 执行基线 | 冻结：HEAD`3582a64`、identity`632ad5ee`、18/18、33工具面、8字段信封切流后 | `baseline.md` |
| 批次骨架 | PROPOSED：范围候选+待细化标注，校验器可过 | `batch.yaml`、`python scripts/architecture/validate_refactoring.py` |
| 范围授权 | **已授权**：L1全景（2026-08-03）与target-design v2.0（2026-08-03）经用户批准 | `v54-implementation-batches.md`重构章节、`target-design.md` |
| S1状态契约考古 | PASS（CONTRACT）：A2-A5现状缺口机器断言、差异表产出、零代码改动 | `state-contract-baseline.md`、`rf002-s1-state-contract-baseline.test.cjs` |
| S1聚焦测试 | PASS：48/48（含RF-001回归43） | `node --test` 8个验证文件（exit 0） |
| S2 Harness状态契约扩展 | PASS：G1/G2/G3落地（terminal/verificationGate），tasks五分支+candidates两分支+双源一致性 3/3 | `rf002-s2-state-contract.test.cjs`、`harness/src/service.ts` |
| S2聚焦测试 | PASS：51/51（含S1锚点翻转）、TS 0错误、身份632ad5ee | `node --test` 9个验证文件（exit 0） |

| S4条件写收口 | PASS：schedule_get READ_ONLY（v7零消费者证据）、条件写3→2、G4版本绑定确认 | `rf002-s4-conditional-writes.test.cjs`、`mcp-boundary-contract-v1.json` |
| S5生产切流与关闭 | ✅（RUNTIME_CUTOVER+OBSERVE）：受管重启上线、探测全规范信封、身份/18链一致、批次CLOSED、RF-003解禁 | `batch.yaml`（CLOSED）、`.data/logs/i10-start-rf002-s5.log` |

**RF-002 批次 CLOSED（2026-08-03）**：S1考古基线→S2 Harness状态契约（G1/G2/G3/G1.1）→S3 MCP收敛（零跨端点、展示投影冻结映射）→S4条件写退场（schedule_get READ_ONLY）→S5生产切流观察。终态指标达成：MCP业务状态推断0、重复业务入口0、状态语义机器可验证100%。
