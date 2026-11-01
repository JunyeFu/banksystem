---
id: DOC-ARCH-RF036-VERIFY
title: RF-036 Verification Plan
document_type: verification
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-03
owner: Codex
---
# RF-036 Verification

Build the production portal image, start isolated Fresh Core and Channel volumes, seed through Test Support, then use playwright-cli snapshots and refs to submit the real login form. Assert the dashboard URL, customer name, one account, 100,000.00 CNY, masked account number and `正常`. Compare screenshots with VQ-02. Do not retain browser session data or authentication traces.
