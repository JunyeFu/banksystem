# 项目专属 RAG 知识库

本目录是银行 AI 测试系统的专属知识目录，保存从原 `background information` 文件夹迁移并拆解后的本地检索知识库、知识缺口报告和索引。后续涉及本项目的实现、审查和决策，应先检索这里，再回到当前源文件核验。当前索引会注册所有可纳入 RAG 的项目文件；文本文件拆块，非文本文件登记来源、类型、大小和 SHA-256。知识分为三类：

- `background-knowledge`：V4/V5.1 方案、PoC、研究资料和辅助资产的拆分快照。
- `official-source-index`：官方资料包的组件职责、必读主题、官方 URL 和下载规则，以及已包含的官方文档快照。
- `project-document` / `project-contract`：项目规范、阶段报告、契约和实施计划，是当前状态与目标状态的主要依据。
- `project-source`：当前代码、脚本和配置，用于核对文档是否与实际实现一致。

构建索引：

```powershell
python scripts/rag/build_rag.py
```

检索示例：

```powershell
python scripts/rag/query_rag.py "Fineract 账务唯一事实源和转账幂等"
```

协作规范见 [docs/rag-governance.md](../docs/rag-governance.md)。索引输出为 `manifest.json`、`sources.jsonl` 和 `shards/<source_kind>/<hash-prefix>.jsonl`，不再使用单一大文件。

索引明确排除 `.env`、`secrets`、`backups`、`node_modules`、`data` 运行时数据、官方下载缓存和 RAG 自身，避免把敏感信息、依赖噪声、数据库文件或未经核验的缓存带入后续推理。上述排除项会在 `manifest.json` 的 `excluded` 字段中登记；这不影响项目源文件、文档、契约、脚本、配置和非文本资源的注册。
