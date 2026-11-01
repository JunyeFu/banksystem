---
id: DOC-ARCH-RF055-CONTRACT
title: RF-055 contract delta
document_type: contract-delta
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# RF-055 contract delta

The existing Test Support URLs and response shapes remain stable. The current OpenAPI declares namespace/run headers required, but the existing callers omit them and the controller has never bound them. RF-055 corrects the catalog/seed/reset portions of this mismatch without claiming namespace isolation. The dedicated demo listener is documented. No customer or operations public API changes.

Fixture keys gain `product.demo.basicLoan` and identity metadata for the fixed customer and operator. These are synthetic demo resources, not production defaults.
