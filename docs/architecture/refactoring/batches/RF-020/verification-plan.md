---
id: DOC-ARCH-RF020-VERIFY
title: RF-020 Verification Plan
document_type: test-plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-020 Verification Plan

Use injected services and OS temporary files only. Cover every baseline command, stdin/file input, attachment hashing/reference projection, golden JSONL streams, stderr separation, approval exit 20, exact approve/reject, unknown options, `--yes`, mixed flags, UTF-8, broken pipe and Ctrl-C exit 130. Assert no model, MCP, formal session root or live service is contacted.
