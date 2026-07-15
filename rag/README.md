# 项目本地 RAG

`rag/` 是检索工程，不是项目事实源。事实来自当前代码、测试、契约、运行证据和经过评审的 `docs/`。

## 目录

- `config/sources.yaml`：纳入和排除规则。
- `config/authority.yaml`：来源与文档状态权重。
- `config/retrieval-profiles.yaml`：`current`、`implementation`、`planning`、`reference`、`frontend` 检索域。
- `eval/golden-queries.yaml`：黄金问题和期望来源。
- `eval/reports/`：验证报告，机器生成、默认不提交。
- `index/`：本地索引，机器生成、默认不提交。

## 使用

先按 [Python 与 uv 开发工具链](../docs/operations/development-environment/python-toolchain.md) 完成 `uv sync --locked`，再通过项目锁定环境执行脚本：

```powershell
uv run python scripts/rag/build_rag.py
uv run python scripts/rag/validate_rag.py
uv run python scripts/rag/query_rag.py --profile current "Fineract 账务唯一事实源"
uv run python scripts/rag/query_rag.py --profile frontend "转账页面接口和状态"
uv run python scripts/rag/query_rag.py --profile reference "HiAgent 历史参考"
```

默认 `current` 不检索历史方案和第三方资料。查询命中后必须根据返回的源路径与 SHA-256 回到原文件核验。

治理规则见 [Docs 与 RAG 协作规范](../docs/workflows/rag-governance.md)。
