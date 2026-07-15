# Backend Service Rules

- Applies to services under `services/`.
- Java baseline is 21; Spring Boot and dependency versions follow the repository lock/configuration.
- Implement OpenAPI and JSON Schema contracts without silently changing request, response, error, or authorization semantics.
- All writes enforce authorization, validation, idempotency where required, correlation, audit, and deterministic state transitions.
- Money uses `BigDecimal`; database changes use Liquibase.
- Never write directly to Fineract-owned databases. Use `FineractAdapter` and Fineract REST APIs.
- Test hooks remain isolated to `local`/`test` profiles and `ROLE_TEST_SUPPORT`.
- Run relevant unit and integration tests. For the bank channel service use `mvnw.cmd test` with Java 21.
