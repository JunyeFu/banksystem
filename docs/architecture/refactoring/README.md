---
id: DOC-ARCH-REFACTOR-INDEX
title: 受控重构资产索引
document_type: reference
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-01
owner: project-owner
---

# 受控重构资产索引

本目录只定义获准重构批次的执行合同和证据，不拥有项目实施顺序。

- [`../refactoring-control-process-v1.md`](../refactoring-control-process-v1.md)：全过程、门禁、风险、切流和回滚总规范。
- [`dependency-rules-v1.md`](dependency-rules-v1.md)：模块依赖方向和机器检查要求。
- [`characterization-baseline-v1.md`](characterization-baseline-v1.md)：重构前必须冻结的行为保护层。
- [`agent-task-package-v1.md`](agent-task-package-v1.md)：单次Agent任务包格式。
- [`metric-catalog-v1.md`](metric-catalog-v1.md)：可量化完成指标及口径。
- [`module-boundaries-v1.yaml`](module-boundaries-v1.yaml)：当前目标模块登记表。
- `batches/`：逐批次合同、运行手册和证据索引。

统一验证命令：

```powershell
python scripts/architecture/validate_refactoring.py
python scripts/docs/validate_docs.py
```

