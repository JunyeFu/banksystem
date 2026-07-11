# Internal transfer E2E evidence (BANK-0304)

Run date: 2026-07-10. This was executed against the local sandbox only.

| Assertion | Evidence | Result |
|---|---|---|
| Channel accepts transfer | Operations API returned HTTP 202 and a stable transfer ID | PASS |
| Core posting | Channel row is `POSTED`, `core_reference=3` | PASS |
| Idempotent replay | Repeating the same request/key returned the same transfer ID and HTTP 202 | PASS |
| Core duplicate prevention | Fineract transfer list contains one unreversed transfer for this E2E; earlier diagnostic transfers are reversed | PASS |
| Outbox | Channel `transfer_outbox` contains two status events (received and posted) for the transfer | PASS |
| Channel/core reconciliation | Channel core reference matches the Fineract transfer resource ID | PASS |

No direct write to `fineract_default` or `fineract_tenants` was used. Temporary
Keycloak test credentials were deleted after the run. The local demo customer,
savings product, accounts and one posted transfer remain as sandbox fixtures.
