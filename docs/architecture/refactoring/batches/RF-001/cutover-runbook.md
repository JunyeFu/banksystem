---
id: DOC-ARCH-RF001-CUTOVER
title: RF-001切换手册
document_type: runbook
domain: architecture
status: draft
authority: normative
version: 1.0
effective_date: 2026-08-02
owner: project-owner
---

# RF-001切换手册

RF-001尚未获准切换。未来切换必须满足：合同冻结、旧字段兼容测试全绿、影子结果等价、ReleaseIdentity差异经过解释且18链无回退、回滚命令已演练。切换只允许在MCP适配器与Harness I10入口之间发生，不修改Flowise或Worker。

## 执行记录（2026-08-03）

- 前置门禁全部满足：合同冻结（B2）✓、旧字段兼容测试全绿（B3-S3/S4）✓、影子结果等价 mismatched=0（B3-S5）✓、18链无回退+公共API实时回读（B4-S2）✓、回滚演练（B4-S3）✓。
- 切流经用户显式批准后执行（B4-S4，RUNTIME_CUTOVER）：MCP错误响应切换为8字段规范信封，`HENGZHUN_RF001_LEGACY_ERROR=1`回退开关可用；生产实时探测与隔离回退验证均通过。
- 观察窗口（B4-S5）：生产10个错误路径探测全部规范信封且errorCode保留；全量回归43/43、身份632ad5ee…、18/18。批次已CLOSED。
