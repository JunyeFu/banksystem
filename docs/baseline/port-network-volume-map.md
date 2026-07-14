# Port, network, and volume baseline

Frozen: 2026-07-11 per v4 banking-core S0 baseline.
Scope: current local target-system runtime inside the v5.4 external-demo product.

The external demo must use a dedicated TLS edge/reverse-proxy boundary if it is reachable from the Internet. Internal Fineract, database, broker, Keycloak and channel ports remain unexposed; this document does not authorize changing the current compose bindings.

## Host port assignments

All host ports bind to `127.0.0.1` only. No port binds to `0.0.0.0`.

| Component | v4 target port | Current runtime port | Status |
|---|---|---|---|
| Fineract API | `127.0.0.1:13000` | `127.0.0.1:13000` | ALIGNED |
| Mifos X Web | `127.0.0.1:18080` | `127.0.0.1:18080` | ALIGNED |
| Customer Portal | `127.0.0.1:18082` | served via gateway | MIGRATE_S1 |
| Operations Console | `127.0.0.1:18083` | served via gateway | MIGRATE_S1 |
| Gateway | `127.0.0.1:18443` | `127.0.0.1:18081` | MIGRATE_S1 |
| Keycloak | `127.0.0.1:19000` | `127.0.0.1:18082` | MIGRATE_S1 |
| Bank Channel Service | `127.0.0.1:18100` | no host port | MIGRATE_S1 |

### Not exposed to host

| Component | Rule |
|---|---|
| Channel PostgreSQL | No host port mapping; internal network only |
| ActiveMQ | No host port mapping; internal network only |
| Mock Clearing Service | No host port mapping; internal network only |

## Docker networks

| Network name | Type | Purpose |
|---|---|---|
| `channel_front` | bridge | Browser-facing: gateway, customer-portal, operations-console, keycloak |
| `channel_internal` | bridge, internal=true | Channel internal: channel-db, bank-channel-service, mock-clearing |
| `mifos_isolated_internal` | external (bridge) | Core internal: Fineract, PostgreSQL, ActiveMQ; referenced by bank-channel-service for Fineract API access |
| `mifos_isolated_front` | external (bridge) | Core front: Mifos X Web |

### Network access rules

- Browser clients may only reach: Gateway, Customer Portal, Operations Console, Keycloak.
- Bank Channel Service reaches: Channel PostgreSQL, ActiveMQ, Keycloak, Fineract (via mifos_isolated_internal).
- Browser clients MUST NOT reach: Fineract, Channel PostgreSQL, ActiveMQ, Mock Clearing.
- Cross-network access is enforced by Docker network assignment, not by application code alone.

## Docker volumes

| Volume name | Scope | Mount path | Purpose |
|---|---|---|---|
| `channel_pg_data` | channel | `/var/lib/postgresql` | Channel PostgreSQL persistent data |
| Core PG bind mount | core | `D:/Agent/banksystem/data/postgres` | Fineract PostgreSQL persistent data (bind-mounted, core-owned) |

### Volume ownership rules

- Channel volume is managed by `compose.channel.yaml`.
- Core bind mount is managed by core compose; channel services MUST NOT write to it.
- Backup scripts for core and channel are separate and must not cross-write.

## S1 migration items

The following port changes are required in S1 to align with v4:

1. Gateway: `18081` -> `18443`
2. Keycloak: `18082` -> `19000`
3. Customer Portal: add direct host port `18082`
4. Operations Console: add direct host port `18083`
5. Bank Channel Service: add host port `18100`
6. Update Keycloak realm redirect URIs to match new ports.
7. Update `.env.example` default values to match new ports.
