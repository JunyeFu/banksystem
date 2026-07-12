# ADR-003: Customer web must not directly call Fineract

Status: ACCEPTED
Date: 2026-07-11
Supersedes: None

## Context

Customer Portal and Operations Console are browser-based clients. If browser clients can directly access Fineract REST API, they could bypass channel-level authorization, idempotency, audit, and money-control rules. This would compromise security, accountability, and financial integrity.

## Decision

Browser clients MUST NOT directly call Fineract. The correct request chain is:

```text
Customer Portal
  -> Gateway
  -> Bank Channel Service
  -> Fineract Adapter
  -> Fineract API
```

The Gateway (Nginx) proxies browser requests to the Bank Channel Service. The Bank Channel Service uses the Fineract Adapter module for all core API calls. Fineract is on a separate Docker network (`mifos_isolated_internal`) that is not reachable from the browser-facing network (`channel_front`).

## Consequences

- Browser clients never hold Fineract credentials.
- All core mutations pass through the Fineract Adapter, which enforces tenant header injection, correlation ID propagation, idempotency, and error mapping.
- The Gateway is the single ingress point for browser traffic.
- Keycloak tokens are issued to browser clients but are validated by the Bank Channel Service, not by Fineract.
- Fineract Basic Auth credentials are held only by the Bank Channel Service container.

## Alternatives considered

- **Direct browser-to-Fineract with OAuth proxy**: Rejected. Fineract uses Basic Auth, not OAuth. Proxying would still bypass channel-level money controls.
- **Self Service plugin in Fineract**: Rejected. Fineract version is 1.15.0-SNAPSHOT; plugin compatibility is not established (R-001). Customer BFF approach is safer.
