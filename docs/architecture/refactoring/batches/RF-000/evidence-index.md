---
id: DOC-ARCH-RF000-EVIDENCE
title: RF-000证据索引
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# RF-000证据索引

| 门禁 | 命令 | 当前结果 | 证据 |
|---|---|---|---|
| 重构合同 | `python scripts/architecture/validate_refactoring.py` | PASS：2个批次、25个模块 | 2026-08-02终端输出 |
| 文档权威链 | `python scripts/docs/validate_docs.py` | PASS：129份元数据、169个链接、1169项过期检查、唯一顺序与重构校验通过 | 2026-08-02终端输出 |
| 差异格式 | `git diff --check` | PASS | 本轮终端输出 |
| 回灌后运行身份 | `inspect-i10.ps1 -CompareSnapshot C:\tmp\i10-post-backfill-baseline.json` | PASS：ReleaseIdentity不变、18/18不变、源/部署Hash不变 | `docs/evidence/platform/hengzhun-i10-post-backfill-baseline-2026-08-02.md` |
| Flowise公开API回读 | `i10-flowise-export-package.cjs capture` | PASS：版本7、deployed=true、部署Hash匹配、非公开 | `docs/evidence/platform/hengzhun-i10-post-backfill-baseline-2026-08-02.md` |
| I10目录完整性 | `VERIFY.cmd --no-pause` | PASS：285个核心文件、6组资产、0个禁止项 | `docs/evidence/platform/hengzhun-i10-post-backfill-baseline-2026-08-02.md` |

以上结果证明治理资产、链接、批次合同和差异格式通过，并证明RF-000控制切换没有改变已观察的I10运行身份；业务完成结论只来自独立的I10运行证据。
