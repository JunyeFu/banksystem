---
id: DOC-EVIDENCE-INDEX
title: 验收与运行证据索引
document_type: reference
domain: evidence
status: accepted
authority: normative
version: 1.1
effective_date: 2026-07-21
owner: project-owner
---

# 验收与运行证据索引

`docs/evidence/` 保存脱敏、可复核的验收结论，不保存凭据、Token、Cookie、Storage State、真实个人信息、运行日志原件或大体积生成物。

- `frontend/`：客户门户与运营前端缺陷、联调和验收证据。
- `platform/`：衡准、Coze/Harness、固定运行时和平台一致性证据。
- `platform/README.md`：平台证据辅助索引和 I8/I9 当前状态边界。
- `v51-audit/`：历史阶段审计证据，仅按其标注边界使用。
- `agent-reports/`：Agent 生成的辅助报告，不自动获得规范权威。

证据只能证明记录时实际执行过的范围，不定义项目开发顺序，也不能把 `NOT_RUN`、设计或本地制品生成写成平台已安装能力。

当前平台证据状态：I8 阶段2—7是已完成本机引擎基线；I9 P1—P6已有正式本机Flowise产品证据，P7反向恢复、P8便携候选、P9最终提交文件夹和HiAgent目标环境仍未验收。
