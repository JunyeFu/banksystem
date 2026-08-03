---
id: DOC-ARCH-RF001-VERIFY
title: RF-001验证计划
document_type: verification
domain: architecture
status: accepted
authority: normative
version: 1.1
effective_date: 2026-08-02
owner: project-owner
---

# RF-001验证计划

1. 对MCP-33生成请求/响应/错误码基线清单，并为每个旧字段建立兼容样本。
2. 合同Schema、MCP合同测试、Harness I10单元与错误路径测试必须先于实现切换通过。
3. 影子阶段对旧适配和新适配执行同输入比较，不允许写操作重复落库。
4. 每一阶段比较ReleaseIdentity和18链计数；非预期变化立即回滚。
5. 最终运行重构校验、文档校验、差异格式和I10目录VERIFY。

6. B2机器合同必须逐项覆盖当前33个工具、全部权威请求字段、入口别名、响应模式、副作用和幂等归属。
7. `python scripts/architecture/validate_rf001_contract.py`必须证明工具名及顺序与当前运行清单一致，且错误信封和条件副作用声明完整。

当前阶段为`CONTRACT_APPROVED`：共享合同已经冻结，但运行时代码仍未实施、影子比较尚未开始、切换仍被禁止。
