---
id: RF068-CONTRACT-DELTA
title: RF-068 Contract delta
document_type: reference
domain: architecture
status: draft
authority: design
version: 1.0
effective_date: 2026-10-19
owner: Codex
---

# RF-068 Contract delta

Generate and consume the Agent OpenAPI client frozen by RF066; no handwritten competing DTO or Quality write API. Remove design sample results in favor of actual API data and explicit loading/empty/error/readiness states.

Current source gap: the 1.0 HTTP factory is not a running service. It has history/model/turn DTOs but no single-image upload or evidence-proxy operations, and COMPLETED alone cannot distinguish a response from verified test success. These additions belong to RF066-S2, not RF068; the frontend consumes the verified generated successor contract. Request/response names proposed in S2 are pending, not implemented claims.

Consumer contract checks must cover submissionId replay/conflict, profileVersion, NEEDS_INPUT continuation under the original binding, message/event pagination and byte bounds, safe Problem responses, explicit result semantics and artifact authorization. Unknown server fields do not become a handwritten browser DTO. Model key input is writeOnly; empty means retain existing via omitted apiKey, never send mask dots.

