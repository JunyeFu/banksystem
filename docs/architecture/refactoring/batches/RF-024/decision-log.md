---
id: DOC-ARCH-RF024-DECISIONS
title: RF-024 Decision Log
document_type: decision-log
domain: architecture
status: ACTIVE
authority: normative
version: 1.0
effective_date: 2026-08-26
owner: project-owner
---

# RF-024 Decision Log

- The environment Journey id is compatibility input, not the default fresh-run contract.
- Journey creation is a LOW mutation and therefore still requires a frozen exact proposal; “bootstrap” is not permission to write eagerly.
- A temporary Journey id is private encrypted binding state and never evidence of an authoritative Harness object.
- One-time session rebind is permitted only before a checkpoint and before a previous bootstrap resolution.
- Normal lifecycle owns exactly Harness/MCP/Worker. It reuses only healthy exact-identity records, rejects unknown listeners, rolls back only processes spawned in the failed transaction, and never kills an ownership mismatch.
- Runtime secrets may be filled from the ignored local `.data/runtime.env` only for missing `HENGZHUN_*` variables; explicit process values win and unrelated machine variables are never imported from that file.
- L1 is a restartable exact-approval state machine. Checkpoints persist only safe ids, hashes, status and timestamps; raw inputs, attachment paths, model output and secrets are excluded.
- The production TUI is a presentation adapter over the same production service as headless CLI. A follow-up creates a new encrypted session/thread on the same authoritative Journey; it cannot carry attachments or bypass an unresolved exact approval.
- TUI shutdown belongs to the runtime bridge. The terminal component reports `EXIT`/`CANCEL_AND_EXIT` but does not stop stdin before the bridge settles the application exit code.
- `evidence` is a pure `journey_get` projection. It exposes bounded artifact metadata only and never returns a download URL, grant token or host path.
- Credential enrollment is not a Journey. It uses a separately typed DPAPI-encrypted operation whose HIGH exact proposal is the sole authority for one `credential_session_create` mutation.
- A credential capture URL must be an exact HTTP loopback URL with the expected credential-session path and one fragment token. It is transient launcher input only: never durable state, JSONL output or evidence. Mutation completion is persisted before launch, so launch failure cannot replay the write.
- RF-024 remains PROPOSED after offline S2 preparation because no configured-model binding, managed runtime execution, public LIVE readback or variant evidence exists.
