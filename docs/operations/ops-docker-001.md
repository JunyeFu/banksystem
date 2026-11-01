---
id: DOC-OPS-DOCKER-001
title: OPS-DOCKER-001 Channel restart and socket recovery
document_type: runbook
domain: operations
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-09-23
owner: Codex
---
# OPS-DOCKER-001: Channel restart and Docker endpoint recovery

This task is separate from RF-056 bank source changes. The observed Docker Desktop startup error is an Inference manager `dockerInference` endpoint removal failure; an earlier Secrets Engine error named `docker-secrets-engine/engine.sock`. Both were zero-byte stale temporary endpoints in the observed incident. Neither is evidence of a bank-code defect.

## Allowed operation

1. Fully quit Docker Desktop and confirm no Docker Desktop process remains.
2. Inspect only `C:\Users\fujunye\AppData\Local\Docker\run\dockerInference` and `C:\Users\fujunye\AppData\Local\docker-secrets-engine\engine.sock`. If the named stale endpoint exists, rename its containing temporary directory with a timestamp suffix; retain the renamed directory. Do not delete it, adjacent files, volumes, or Docker AI settings.
3. Start Docker Desktop and check `docker info` and the project service health. If the error text names a different path, stop; this runbook does not apply.

The observed incident had already been recovered by a directory rename. The current code change adds `unless-stopped` to the 11 default Channel product services; Mock Clearing remains behind its explicit profile. `docker compose stop` and the project's explicit `down` still leave those services stopped intentionally. No factory reset or automatic directory cleanup is authorized.

## Done

- `docker compose -f compose.channel.yaml config --services` lists the 11 default product services and omits `mock-clearing-service`.
- `docker inspect` reports `unless-stopped` for those 11 services after targeted Compose reconciliation.
- Core 4 and Channel 11 recover healthy after a controlled engine restart; retained named volumes are unchanged.
- Do not run `down`, `reset`, or remove a volume as part of this task.

## Execution record, 2026-09-23

Compose listed 11 default services and no Mock Clearing. Targeted `up -d --no-build --wait` completed with 11 services healthy/running; `docker inspect` reported `unless-stopped` for each. A controlled `docker desktop restart` initially left the engine unavailable. After fully stopping Docker Desktop, the two observed endpoint directories were renamed and retained with suffix `socket-recovery-20260923-114632`. `docker desktop start` restored Engine 29.8.0; all 4 core and 11 Channel containers restarted automatically. The six declared project volumes remained present. No factory reset, volume deletion or Docker AI setting change occurred.

During RF-056-S3 deployment, Docker Desktop again stopped with the same two zero-byte endpoint files. With Docker processes absent, only the two containing directories were renamed and retained as `run.socket-recovery-20260923-141130` and `docker-secrets-engine.socket-recovery-20260923-141130`. `docker desktop start` restored Engine 29.8.0 and all 15 project containers; targeted Bank Channel/Test Support replacement and bank verification then passed. No factory reset, volume deletion, Docker AI change or project-wide stop occurred.
