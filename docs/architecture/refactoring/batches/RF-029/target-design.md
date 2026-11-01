---
id: DOC-ARCH-RF029-TARGET
title: RF-029 Target Design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-31
owner: Codex
---

# RF-029 Target Design

`demo.ps1 prepare` owns one browser runtime only:

```text
runtime/package-lock.json -> runtime/node_modules -> Playwright 1.59.1 + Midscene 1.10.5
                                                    -> Chromium revision 1217
```

The Worker keeps loading only `runtime/node_modules`. Flowise is outside this graph.
