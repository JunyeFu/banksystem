---
id: DOC-ARCH-RF051-VERIFICATION
title: RF-051 verification plan
document_type: verification-plan
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-051 verification plan

Run Java 21 tests with a temporary PostgreSQL process for normal completion, difference recovery and interruption resume, plus the core fact mismatch; build the Operations Console; apply Liquibase v13 to the retained PostgreSQL state; verify health and the existing bank golden path without invoking a live business-date advance. The migration and online read-only reconciliation endpoint must succeed while all managed services remain running.
