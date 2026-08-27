---
id: DOC-ARCH-RF014-TARGET
title: RF-014 Shadow Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-25
owner: project-owner
---

# RF-014 Shadow Target Design

The comparator accepts redacted input, authoritative read facts and baseline output, invokes only the bounded planner, and emits hashes plus metrics. It has no mutation dependency. Window acceptance is fail-closed and never authorizes cutover.
