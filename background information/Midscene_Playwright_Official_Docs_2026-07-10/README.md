# Midscene 与 Playwright 官网文档完整 Markdown 包

生成日期：2026-07-10

本包从两个官方 GitHub 仓库的指定提交完整提取文档源文件，并统一转换为 `.md` 扩展名：

| 产品 | 官方仓库 | 固定提交 | 收录 Markdown/MDX 页数 |
|---|---|---:|---:|
| Midscene | `web-infra-dev/midscene` | `d4b1a3092b358c3178760466960ab21fcce6e504` | 105 |
| Playwright 官网 | `microsoft/playwright.dev` | `a26d4b06417a23bf50adff1795730fa2ef62e3c8` | 898 |

## 内容结构

```text
Midscene_Playwright_Official_Docs_2026-07-10/
├─ Midscene_Agent_Official_Research.md
├─ 00_Provenance_and_Licenses/
├─ 01_Midscene/pages/                # 105 个官方页面，含英文和中文
├─ 02_Playwright/pages/               # 904 个官方页面，含 Node.js/Python/Java/.NET/MCP/Agent CLI
├─ 03_Combined_Full_MD/               # 每个产品及分区的合并版完整 Markdown
├─ 04_Manifest/
└─ 05_Refresh_Script/
```

## “相同格式”的处理规则

1. 所有 `.mdx` 文件只修改扩展名为 `.md`，正文按字节保留；原本就是 `.md` 的文件按字节复制。
2. 保留标题、列表、表格、代码块、Front Matter、HTML 和 MDX/JSX 标签，避免为了“纯 Markdown”而丢失官方内容。
3. 保持原始目录结构，避免同名页面冲突，并使相对链接尽可能保持可追溯。
4. 另生成合并版完整 `.md` 文件，每个页面之间用来源路径和 HTML 注释分隔。
5. `04_Manifest` 中记录每个源文件、输出文件、字节数和 SHA-256，便于完整性核验。

## 选择哪个文件阅读

- 调研 Midscene Agent：`Midscene_Agent_Official_Research.md`
- 给内部 LLM/RAG 导入 Midscene 全文：`03_Combined_Full_MD/Midscene_Official_Docs_All_EN_ZH.md`
- 给内部 LLM/RAG 导入 Playwright 全文：`03_Combined_Full_MD/Playwright_Official_Docs_All_Languages_and_Agent_Tools.md`
- 仅使用 TypeScript/Node.js：`03_Combined_Full_MD/Playwright_Official_Docs_nodejs.md`
- 需要逐页查阅：使用 `01_Midscene/pages` 和 `02_Playwright/pages`

## 范围说明

Playwright 官网仓库同时保存“当前开发版 docs”和“稳定版 versioned_docs”，本包二者都保留，因此存在有意的版本重复。这样做是为了满足“完整下载”，而不是只截取某个语言或稳定版。

Midscene 包含英文和简体中文官方页面；公共组件引用和 MDX 标签保持原样。合并版适合全文检索与 LLM 导入，逐页版适合人工查阅和追溯。

## 许可证

- Midscene 文档随仓库按 MIT License 分发。
- Playwright 官网文档仓库声明文档内容采用 CC BY 4.0，代码采用 MIT License。
- 原始许可证完整保存在 `00_Provenance_and_Licenses`。
