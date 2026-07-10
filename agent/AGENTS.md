# Agent execution rules

`agent/backlog.yaml` is the authoritative scheduler. Claim exactly one READY task,
honour all dependencies and allowed paths, and move completed work only to REVIEW.

The Fineract databases `fineract_default` and `fineract_tenants` are core-owned:
do not write to them directly. Use the Fineract API for all business changes.
Until Phase 0 is in REVIEW, do not modify Fineract, Mifos X, PostgreSQL,
ActiveMQ, Docker networks, or Docker volumes. Never report secrets, tokens,
full account identifiers, identity documents, or database passwords.
