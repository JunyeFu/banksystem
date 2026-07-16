#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const openapiPath = path.join(root, 'contracts', 'openapi', 'hengzhun-harness-v1.yaml');
const text = fs.readFileSync(openapiPath, 'utf8');
const document = YAML.parse(text);
const failures = [];
const expected = [
  'case_create_draft', 'case_get', 'plan_compile', 'run_submit',
  'task_get', 'artifact_get_metadata', 'decision_submit'
];
const operations = [];

if (document.openapi !== '3.0.3') failures.push('OpenAPI version must be 3.0.3');
if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) failures.push('OpenAPI file exceeds HiAgent 2 MiB import limit');
if (document.components?.securitySchemes?.bearerAuth?.scheme !== 'bearer') failures.push('Bearer Token security scheme missing');
if (document.servers?.[0]?.url !== 'http://hengzhun-harness:18788') failures.push('unexpected internal server URL');

for (const pathItem of Object.values(document.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method) && operation.operationId) operations.push(operation.operationId);
  }
}
if (new Set(operations).size !== operations.length) failures.push('duplicate operationId');
for (const operation of expected) if (!operations.includes(operation)) failures.push(`missing operationId: ${operation}`);
for (const operation of operations) if (!expected.includes(operation)) failures.push(`unexpected operationId: ${operation}`);

if (failures.length) {
  console.error('HENGZHUN_I2_OPENAPI_INVALID');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I2_OPENAPI_READY',
    operationCount: operations.length,
    operations,
    byteLength: Buffer.byteLength(text, 'utf8'),
    authentication: 'BEARER_TOKEN',
    sideEffectsDuringValidation: false
  }, null, 2));
}
