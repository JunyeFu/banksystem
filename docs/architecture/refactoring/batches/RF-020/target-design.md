---
id: DOC-ARCH-RF020-TARGET
title: RF-020 Target Design
document_type: design
domain: architecture
status: accepted
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-020 Target Design

Build a dependency-free Node 24 application shell around an injected service port. A strict grammar produces typed commands; a single dispatcher emits allowlisted versioned events. JSONL stdout is machine-only, diagnostics are stderr-only, and exit codes are centrally registered. File and stdin input are bounded before dispatch; attachments are hashed and handed to the service as ephemeral descriptors, while emitted state contains only returned references. Resume approval must name one proposal and cannot be implied by flags or environment.
