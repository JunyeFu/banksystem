---
id: DOC-4C559D963E
title: BANK-0002 local Fineract API index
document_type: reference
domain: baseline
status: verified
authority: evidence
version: 1.0
effective_date: 2026-07-15
owner: project-owner
---

# BANK-0002 local Fineract API index

## Source and validation

- Swagger UI configuration: `http://127.0.0.1:13000/fineract-provider/api-docs/swagger-config`
- Export URL resolved at runtime: `http://127.0.0.1:13000/fineract-provider/fineract.json`
- Export: `swagger-original.json` (1,430,455 bytes; SHA-256 `815D71558B58CF202A07B07F85E4049D564ED8BBE6112B207B24C8B2D6E099E1`)
- Parse result: OpenAPI 3.0.3, title `Apache Fineract REST API`, version `1.15.0-SNAPSHOT`, 600 paths.
- Security schemes declared by the contract: `basicAuth`, `tenantid`.

The document was fetched from the local running service and parsed with
PowerShell `ConvertFrom-Json`; no endpoint that changes data was invoked.

## Indexed endpoint families

| Capability | Confirmed API paths (representative) |
|---|---|
| Client | `/v1/clients`, `/v1/clients/template`, `/v1/clients/{clientId}`, `/v1/clients/{clientId}/accounts`, `/v1/clients/external-id/{externalId}/accounts` |
| Savings | `/v1/savingsaccounts`, `/v1/savingsaccounts/{accountId}`, `/v1/savingsaccounts/{savingsAccountId}/transactions`, `/v1/savingsaccounts/external-id/{savingsExternalId}/transactions` |
| Loan | `/v1/loans`, `/v1/loans/{loanId}`, `/v1/loans/{loanId}/transactions`, `/v1/internal/loan/{loanId}/audit` |
| Account transfer | `/v1/accounttransfers`, `/v1/accounttransfers/template`, `/v1/accounttransfers/{accountTransferId}`, `/v1/accounttransfers/refundByTransfer` |
| Audit | `/v1/audits`, `/v1/audits/searchtemplate`, `/v1/audits/{auditId}` |
| Maker-checker | `/v1/makercheckers`, `/v1/makercheckers/searchtemplate`, `/v1/makercheckers/{auditId}` |

This is an index only. Request fields, header spelling, permissions and exact
semantics must be verified in BANK-0003 or integration tests before implementation.
