# Frontend Rules

- Applies to all applications under `apps/`.
- Use React, TypeScript strict mode, Vite, Ant Design, and the project design tokens.
- Do not add a second base component system without an accepted ADR.
- Do not handwrite new API DTOs or string endpoints when an OpenAPI-generated client can own them.
- Every page implements applicable loading, empty, error, forbidden, submitting, and business-result states.
- Preserve keyboard navigation, visible focus, semantic labels, and stable `data-testid` values.
- Frontend code must not modify database migrations or call Fineract directly.
- Verify changed apps with `npm.cmd run build`, relevant unit tests, and Playwright/visual checks when behavior or rendering changes.
