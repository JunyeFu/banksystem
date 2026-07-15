---
id: DOC-71E8E53308
title: BANK-0001 runtime inventory
document_type: reference
domain: baseline
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# BANK-0001 runtime inventory

Captured on 2026-07-10 from Windows 11 Pro with Docker Engine 29.5.3.
The full non-secret machine inventory is in `container-inventory.json`.

## Core sandbox

| Component | Runtime state | Reachability | Image identity |
|---|---|---|---|
| Fineract API | running | `127.0.0.1:13000`; actuator health HTTP 200 (`UP`) | `openmf/fineract@sha256:666c666900eb62fc1f6c5faa971e19c34ef6ec5d7cb8224276a49e2ddba262e1` |
| Mifos X web app | running | `127.0.0.1:18080`; HTTP 200 | `openmf/web-app@sha256:d071bea02ba0b83b0a9958f8ea651b7cc50aa86dd18f71ab304955e76bbd4b03` |
| PostgreSQL | healthy | no host port | `postgres@sha256:7e32e9833a6fb1c92c32552794cb6ed569d51b445a54907d35fc112ef39684db` |
| ActiveMQ Classic | healthy | no host port | `apache/activemq-classic@sha256:75852a6d357991028e58e7c32a7dd190cb36802568236cf3cd189d2350033be1` |

The core compose project is `mifos-isolated`, using
`D:/Agent/banksystem/postgresql/docker-compose.isolated.yml`. PostgreSQL data is
bind-mounted at `D:/Agent/banksystem/data/postgres`; no core volume, network, or
configuration was changed during this inventory task.

## Scope boundary

`shopping-pg` and `shopping-qdrant` are unrelated running containers. They were
observed only to make host-port conflicts visible and were not inspected for
application data or changed. Their host exposure is not a finding against this
bank sandbox.

## Baseline findings

- Core API and staff web app are loopback-only; core PostgreSQL and broker have no host port.
- Fineract and Mifos images use development tags paired with immutable digests; ActiveMQ retains a `latest` tag despite a digest. Version-tag cleanup is deferred until Phase 0 gates pass.
- Fineract has no Docker health check; actuator health is the available runtime check.
