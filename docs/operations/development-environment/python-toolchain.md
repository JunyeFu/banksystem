---
id: DOC-OPS-PYTHON-TOOLCHAIN
title: Python 与 uv 开发工具链
document_type: how-to
domain: operations
status: accepted
authority: normative
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# Python 与 uv 开发工具链

本仓库的 Python 脚本统一使用 Python 3.14 和 uv 项目环境。不要依赖系统全局 site-packages，也不要直接使用失效的 Windows 应用执行别名。

## 首次安装

```powershell
uv python install 3.14 --default
uv sync --locked
uv run python scripts/tooling/verify_python_environment.py
```

`uv sync --locked` 根据根目录 `uv.lock` 创建或更新 `.venv`。`.venv` 是本机运行目录，不进入 Git。

## 常用验证

```powershell
uv run python scripts/docs/validate_docs.py
uv run python scripts/rag/build_rag.py
uv run python scripts/rag/validate_rag.py
```

所有 Python 命令优先使用 `uv run python`。若新终端中的裸 `python` 仍命中 WindowsApps，应确认 `C:\Users\<用户名>\.local\bin` 位于 WindowsApps 之前，或直接继续使用 `uv run python`。

## 依赖变更

使用 `uv add <package>` 或编辑 `pyproject.toml` 后运行 `uv lock`。提交依赖变更时必须同时提交 `pyproject.toml` 和 `uv.lock`，不得提交 `.venv`、缓存或下载产物。
