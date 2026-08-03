---
id: REF-HIAGENT-2.5.1-READABLE-001
title: HiAgent 2.5.1 可读参考镜像
document_type: external_reference
domain: hiagent
status: imported
authority: reference_only
version: 2.5.1-readable
effective_date: 2026-07-27
owner: project-owner
---

# HiAgent 2.5.1 可读参考镜像

本目录是对同级 DOCX 帮助文档的可读化镜像，不替换或删除原始文件。

## 处理方式

- DOCX 通过 LibreOffice 渲染为 PDF，保留原文档的页面布局和中文字体映射。
- 每个 PDF 同时通过 `pdftotext -layout` 生成 UTF-8 TXT，供检索、RAG 构建和代码分析使用。
- 每个源文档均按原目录层级保存，避免同名文件覆盖。
- 29 个 TXT 文件均已检查，不含 Unicode 替换字符 `�`，并且包含中文文本。

## 重要边界

原始 DOCX 的直接 XML 文本存在字体编码映射现象：直接读取 XML 可能显示为乱码，但在 Word/LibreOffice 中可正常显示。可读镜像用于机器读取和人工查阅，不能作为项目已实现 HiAgent 能力的证明。
