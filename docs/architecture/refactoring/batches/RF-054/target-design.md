---
id: DOC-ARCH-RF054-TARGET
title: RF-054 target design
document_type: target-design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-054 target design

`LoanWorkflowService` owns one state machine: DRAFT → SUBMITTED → SCORED → APPROVED → CORE_SUBMITTED. Every transition is a conditional SQL update over expected state and version. A LOAN_OFFICER creates the pending approval and submits an approved application to Fineract; a distinct LOAN_APPROVER checks it. Customer and operations controllers are projections over the same rows. Fineract alone creates the core loan.
