# ADR-005: Testability is a first-class architecture capability

Status: ACCEPTED
Date: 2026-07-11
Supersedes: None

## Context

The system will be tested by human operators, automated E2E scripts, and later by AI-driven testing tools (Midscene/Playwright in phases 2-3). Without stable, machine-readable page contracts, tests become fragile and depend on guessing DOM structure or database IDs.

## Decision

Testability is a first-class architecture capability. Key pages MUST include the following stable attributes:

```text
data-page-id       # Unique page identifier (e.g., "customer.transfer.create")
data-page-state     # Page state: "LOADING" | "READY" | "ERROR"
data-testid         # Stable element identifier for test targeting
role                # ARIA role for accessibility
aria-label          # Human-readable label for screen readers
label               # Visible label for form inputs
```

Additionally:

- Routes are stable and deterministic.
- Loading states are explicitly rendered in the DOM.
- Error states are readable from the DOM (not only in console).
- Business states (e.g., "SETTLED", "PENDING") are visible as data attributes.

### Stable demo profile

```json
{
  "locale": "zh-CN",
  "timezone": "Asia/Shanghai",
  "viewport": { "width": 1440, "height": 900 },
  "reducedMotion": true,
  "disableProductTour": true,
  "disableRandomTips": true,
  "fixedBusinessDate": "2026-07-10"
}
```

The profile MUST NOT bypass authentication, authorization, or business rules.

## Consequences

- Page Catalog, Action Catalog, and Assertion Catalog are versioned artifacts in `contracts/catalogs/`.
- Fixture Registry uses logical references (e.g., `customer.alice`), not runtime IDs. Runtime IDs are returned by the Seed API.
- Test Support API is only available under `local`/`test` profiles and protected by `TEST_SUPPORT` authority.
- `APP_TESTABILITY_MODE` enables stable test markers but never disables security.
- Midscene `PlaywrightAgent` in later phases will rely on `data-testid` for visual element location when DOM selectors are insufficient.

## Alternatives considered

- **CSS selectors only**: Rejected. Fragile; any UI change breaks tests.
- **XPath only**: Rejected. Brittle and hard to maintain for complex banking pages.
- **AI-only without contracts**: Rejected. Without stable contracts, AI-driven tests cannot reliably locate elements or assert states.
