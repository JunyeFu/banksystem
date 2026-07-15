# Contract Rules

- `contracts/` is the executable source for API and shared data contracts.
- OpenAPI operations require stable, unique `operationId`, authentication, request/response schemas, examples, and Problem Details errors.
- JSON Schemas require explicit versioning, required fields, enums, and additional-property policy.
- Monetary and timestamp representations must be unambiguous.
- Update fixtures, generated clients, producer tests, consumer tests, and frontend/backend mappings with every breaking contract change.
- Breaking changes require a versioning decision and migration path; do not overwrite an accepted contract silently.
