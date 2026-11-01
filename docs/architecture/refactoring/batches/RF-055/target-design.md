---
id: DOC-ARCH-RF055-TARGET
title: RF-055 target design
document_type: design
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-055 target design

The repository fixture catalog is the only fixture definition. A fixture lifecycle service hides catalog parsing and Fineract find-or-create operations behind `seed` and `reset`. `reset` removes only fixture-owned Channel identity mappings; it preserves settled transfers, audit records, customer mappings and all Fineract money history. The catalog includes the savings and loan products required by retained golden paths.

`prepare` writes fixed synthetic usernames and random persistent passwords into the ignored local `.env`. Keycloak and Fineract do not exist until `up`, so `up` provisions the customer and operations user, then binds the customer subject to the fixture client. Repetition updates the same identities and mapping.

The production Bank Channel runs without the Test Support profile. A separate internal Test Support service uses the same image and database but owns the test routes. Gateway routing targets that service only in the demo topology. Mock Clearing is opt-in and absent from the default Compose service set; its test-only path requires both `BANK_CHANNEL_PROFILES=demo,mock-clearing` and the Compose `mock-clearing` profile.
