# Docs 与 RAG 协作规范

## 角色分工

`docs/` 是人维护、可审阅的知识源：架构约束、契约、运行手册、审查结论和项目决策应在这里保存。源文件应有明确标题、日期/版本和适用范围；项目当前状态以当前审查报告、测试和运行证据为准。

当前产品基线见 `docs/architecture/v5.4-external-demo-baseline.md`；v4/S0-S7 只作为银行核心 Track，v5.4 回归平台能力必须单独标注实现、PoC 或企业环境待验证状态。

`rag/` 是机器生成、可删除重建的派生层：它保存来源清单、分块快照和分片索引，不作为新的事实源，也不手工直接编辑索引文件。

原 `background information` 的历史资料已经作为 `background-knowledge` 快照迁入 RAG；后续若其中的结论成为项目正式约束，应先整理成 `docs/` 下的正式文档，再重新构建索引。

## 工作流

```text
编辑/审阅 docs 或代码证据
        -> python scripts/rag/build_rag.py
        -> rag/index/sources.jsonl + rag/index/shards/<source_kind>/<bucket>.jsonl
        -> python scripts/rag/query_rag.py "问题"
        -> 回到 docs/代码核验来源、版本和当前状态
```

索引按 `source_kind` 和来源 SHA-256 首个十六进制字符分片；查询通过 `manifest.json` 发现分片，不依赖单个巨型 JSONL。这样可以减少冲突、支持按知识域替换，并保留每个分块的来源、哈希和分块号。

## 事实等级

1. 当前代码、契约、测试和运行证据：当前状态证据。
2. `docs/` 正式文档：项目约束和设计意图。
3. `rag` 中的 `background-knowledge`：迁移历史资料，需结合当前项目证据复核。
4. `official-source-index`：官方来源和必读主题；只有在正文快照或在线官方页面核验后，才能作为 API 细节依据。

## 维护规则

- 不直接修改 `rag/index/shards` 和 `sources.jsonl`。
- 文档改动后重建索引，并检查 `manifest.json` 的分片数量和来源数量。
- 检索命中后必须回链到 `source`，高风险银行业务结论必须再核对契约、测试和运行证据。
- 不把 `.env`、`secrets`、`backups`、`node_modules` 或运行缓存写入索引。
