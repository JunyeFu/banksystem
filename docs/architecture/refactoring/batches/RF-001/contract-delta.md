---
id: DOC-ARCH-RF001-CONTRACT
title: RF-001合同差异
document_type: contract
domain: architecture
status: accepted
authority: normative
version: 1.1
effective_date: 2026-08-02
owner: project-owner
---

# RF-001合同差异

RF-001-B1已完成字段、错误和适配器代码考古；RF-001-B2现已冻结机器可校验的共享合同，但仍不批准字段或工具删除：

1. 盘点MCP-33每个请求和响应的权威字段、历史别名、空值语义及来源。
2. 错误统一为`errorCode / category / status / retryable / userActionRequired / safeMessage / fieldErrors / correlationRef`；继续以当前消费者使用的`errorCode`为权威名，`code`仅作为读取别名，敏感值不得进入错误信封。
3. 旧请求别名只在MCP入口读取，Harness内部只接收权威字段；响应只输出权威字段和明确的兼容元数据。
4. 任何删除、重命名或错误码合并都必须先有消费者清单、兼容测试和回滚映射。

具体矩阵见`field-error-adapter-matrix.md`。B1确认的合同差异为：

1. 当前公开JSON只冻结工具名，字段级合同实际分散在MCP Zod、Harness Zod和领域服务中。
2. Harness完整错误信封在MCP投影时丢失恢复、用户动作和关联字段。
3. `authoring_submit`存在已声明但未消费的旧数组参数。
4. `schedule_get(DISABLE)`与`schedule_disable`重复，部分`get/list`工具存在副作用。
5. Journey根别名、URL处理和草案转换存在跨层重复适配。
6. `case_prepare`同时兼容I10、旧I8和平铺草案，不能在无消费者证据时直接清理。

B2冻结结果见`mcp-boundary-contract-v1.json`。该合同逐工具声明`canonicalRequest / acceptedAliases / canonicalResponse / errorEnvelope / sideEffect / idempotency`，并通过`python scripts/architecture/validate_rf001_contract.py`与当前MCP-33清单交叉校验。

本次批准只授权B3在`hengzhun.mcp / hengzhun.harness`内实施影子适配和等价比较，不授权运行切换。现有`platform/.../contracts/mcp/hengzhun-i8.json`仍是运行时合同；只有B3实现、兼容测试、影子比较和实时公共API回读通过后，才能把冻结合同转为可执行合同。

## B2冻结决策

1. 33个工具名称全部保留。
2. 历史别名仅由MCP入口读取，Harness只接收权威字段。
3. Journey根别名在B3后只由MCP紧凑投影生成，Harness不再新增同义根字段。
4. `schedule_disable`是停用调度的权威写工具；`schedule_get(action=DISABLE)`保留读取兼容至B4。
5. `candidate_get`、`schedule_get`和`result_inbox_list`被明确标记为条件写入，禁止按纯读权限授权。
6. `authoring_submit`七组未消费数组不是权威字段；B3必须选择“明确拒绝”或“接线并测试”，不得继续静默接受。
7. `case_prepare`的I8双路由、平铺草案和JSON文本入口保留至B4消费者证据门禁。
8. `run_submit/schedule_create`的隐式`i3-customer`仅作为旧兼容行为登记，通用目标切换前必须由权威执行凭据绑定替代。
