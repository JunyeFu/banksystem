# BANK-0003 security and operational configuration audit

Audit date: 2026-07-10. Evidence gathering was read-only. No database data,
configuration, container, network, or volume was changed.

## Authentication and tenant boundary

- The exported OpenAPI contract declares HTTP Basic authentication (`basicAuth`)
  plus the required tenant API-key header `fineract-platform-tenantid`.
- Unauthenticated, tenant-header-bearing GET probes to `/v1/clients`,
  `/v1/externalevents/configuration`, and `/v1/makercheckers` each returned HTTP
  401. Therefore protected API authentication is enforced before these resources
  are exposed.
- The default sandbox tenant is `default`; the channel service must centralize
  injection of the exact tenant header and must never accept a browser-supplied
  tenant identifier.

## Idempotency

- The local 1.15.0-SNAPSHOT OpenAPI has no `Idempotency-Key` header declaration.
- It does include an `idempotencyKey` **query parameter** only for
  `GET /v1/internal/externalevents`; this is not evidence that money-changing
  requests are idempotent.
- Finding: Fineract money-operation idempotency header spelling/behavior is not
  contract-verified. BANK-0101/0201 must define a channel-level `Idempotency-Key`
  contract and prove the mapped core behavior by an isolated integration test
  before any money operation is implemented.

## Maker-checker and external events

- Maker-checker APIs are present at `/v1/makercheckers`,
  `/v1/makercheckers/searchtemplate`, and `/v1/makercheckers/{auditId}`; they
  are authentication-protected.
- A read-only PostgreSQL query found 960 permission definitions, of which 63 are
  maker-checker eligible. This confirms the capability exists in the active core;
  it does not prove any user/role assignment and those identities were not read.
- External event configuration API is present at `/v1/externalevents/configuration`.
  A read-only aggregate query found 131 configuration rows and 0 enabled rows.
  Thus external event publishing is currently disabled; a future channel must
  use an isolated outbox/event bus unless a controlled core configuration change
  is separately approved.

## Runtime and network controls

- Fineract and the Mifos web app bind only to loopback. PostgreSQL and ActiveMQ
  have no host port mapping. The core network split is `mifos_isolated_front`
  and `mifos_isolated_internal`.
- The active Fineract container reports Java 21.0.11 LTS. Only environment
  variable names were examined; values were not read or recorded.
- Docker Desktop has manual HTTP/HTTPS proxy settings configured. The proxy
  address is intentionally redacted from this report; it is a machine-level
  dependency, not a bank component. It should be changed only through a
  separately approved workstation hardening task.

## Required constraints for subsequent phases

1. Browser clients may not call Fineract, PostgreSQL, or ActiveMQ directly.
2. No direct writes to `fineract_default` or `fineract_tenants`.
3. Do not enable external core events or modify maker-checker configuration as
   part of channel work without an ADR, approval, backup, and regression test.
4. Do not use mutable image tags in new channel infrastructure.
