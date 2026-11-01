---
id: DOC-ARCH-RF050-CUTOVER
title: RF-050 cutover runbook
document_type: runbook
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-22
owner: Codex
---
# RF-050 cutover runbook

Build the Bank Channel and two portal images, then recreate only those three services with Compose `--wait --no-build`. Do not stop Fineract, PostgreSQL, Keycloak, Gateway, Agent services, or evidence services. Run the golden path only after Liquibase and health checks succeed.
