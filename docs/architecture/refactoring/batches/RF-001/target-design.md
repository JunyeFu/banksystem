---
id: DOC-ARCH-RF001-TARGET
title: RF-001目标设计
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.1
effective_date: 2026-08-02
owner: project-owner
---

# RF-001目标设计

RF-001建立单向边界：`Flowise → MCP合同适配器 → Harness I10服务`。MCP负责认证、参数形状、旧字段兼容和错误封装；Harness负责业务校验、状态转换、幂等与数据所有权。

目标只有三项：统一同义字段的权威名称；统一机器可判定的错误信封；删除MCP与Harness之间重复且语义不一致的转换。不得改变33个工具名称、Flowise图、Worker协议、SQLite结构或现有运行语义。

B2批准的机器合同为`mcp-boundary-contract-v1.json`。MCP是旧线格式、空占位、JSON文本和紧凑响应投影的唯一适配层；Harness只拥有权威业务对象、状态转换、授权、持久幂等和领域错误。所有条件副作用必须显式声明，不能从`get/list`命名推断只读。

该设计当前处于`CONTRACT_APPROVED`，只允许B3影子实施。当前运行合同与ReleaseIdentity保持不变。
