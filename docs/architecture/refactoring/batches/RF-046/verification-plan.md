---
id: DOC-ARCH-RF046-VERIFY
title: RF-046 Verification Plan
document_type: verification
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-06
owner: Codex
---
# RF-046 Verification

Run the focused contract tests with the bundled Node runtime, then the registered suite, TypeScript build, refactoring governance and documentation validator. Runtime acceptance freezes the new ReleaseIdentity, starts only the owned composition, creates one fresh read-only Journey, executes once, and runs `hz-agent evidence verify` against that exact Journey. The pass record must show five required kinds, every artifact hash verified, identical before/after identity, zero Full18 ledger delta, and state-preserving shutdown. Stop at the first deterministic failure.
