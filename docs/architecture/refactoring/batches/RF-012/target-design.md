---
id: DOC-ARCH-RF012-TARGET
title: RF-012 State Security Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-012 State Security Target Design

`ControllerSecurity` owns immutable `(namespace, threadId) -> journeyId/releaseIdentityHash` bindings, TTL, cleanup, checkpoint-safe validation and allowlisted trace projection. LangGraph config uses both `thread_id` and `checkpoint_ns`.

The scratch VFS accepts only bounded relative POSIX paths and in-memory UTF-8 content. It has no host filesystem adapter or execute capability. Current Deep Agents profile exposes no filesystem tool, so VFS remains a future bounded option rather than an active model tool.
