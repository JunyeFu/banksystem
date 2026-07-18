#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const publicPath = path.join(root, 'contracts', 'openapi', 'hengzhun-harness-v1.yaml');
const workerPath = path.join(root, 'contracts', 'openapi', 'hengzhun-worker-internal-v1.yaml');
const failures = [];

function parse(file) {
  const text = fs.readFileSync(file, 'utf8');
  const document = YAML.parse(text);
  if (document.openapi !== '3.0.3') failures.push(`${path.basename(file)}: OpenAPI version must be 3.0.3`);
  if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) failures.push(`${path.basename(file)}: exceeds 2 MiB`);
  return { document, text };
}

const publicContract = parse(publicPath);
const workerContract = parse(workerPath);
const publicOperations = Object.values(publicContract.document.paths ?? {}).flatMap(pathItem =>
  Object.entries(pathItem ?? {}).filter(([method]) => ['get', 'post'].includes(method)).map(([, operation]) => operation.operationId).filter(Boolean)
);
const expectedPublic = [
  'case_create_draft', 'case_get', 'case_import_submit', 'plan_compile', 'run_submit',
  'task_get', 'artifact_get_metadata', 'decision_submit', 'failure_get',
  'repair_candidate_create', 'repair_candidate_get'
];
const missingPublicOperations = expectedPublic.filter(operationId => !publicOperations.includes(operationId));
if (missingPublicOperations.length > 0) failures.push(`public contract is missing I3 operations: ${missingPublicOperations.join(', ')}`);
if (publicContract.document.components?.securitySchemes?.bearerAuth?.scheme !== 'bearer') failures.push('public Bearer authentication is missing');
for (const [route, pathItem] of Object.entries(publicContract.document.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!['get', 'post'].includes(method)) continue;
    if (method !== 'post') failures.push(`${method.toUpperCase()} ${route}: Coze compatibility operations must use POST JSON bodies`);
    const responseCodes = Object.keys(operation.responses ?? {});
    if (responseCodes.length !== 1 || responseCodes[0] !== '200') failures.push(`${method.toUpperCase()} ${route}: Coze import contract supports only a documented 200 response`);
    if ((operation.parameters ?? []).length > 0) failures.push(`${method.toUpperCase()} ${route}: Coze 0.5.1 compatibility contract cannot use parameters`);
    for (const parameter of operation.parameters ?? []) {
      if (parameter.$ref) failures.push(`${method.toUpperCase()} ${route}: Coze 0.5.1 requires inline parameters`);
      if (!parameter.schema || parameter.schema.$ref) failures.push(`${method.toUpperCase()} ${route}: Coze 0.5.1 requires an inline parameter schema`);
    }
  }
}
if (publicContract.document.components?.parameters) failures.push('Coze 0.5.1 contract must not use components.parameters');
if (JSON.stringify(publicContract.document.paths ?? {}).includes('"$ref"')) failures.push('Coze 0.5.1 compatibility operations must not contain schema references');
if (JSON.stringify(publicContract.document.paths ?? {}).includes('"format"')) failures.push('Coze 0.5.1 compatibility operations must not use unsupported format keywords');

const workerOperations = Object.values(workerContract.document.paths ?? {}).flatMap(pathItem =>
  Object.entries(pathItem ?? {}).filter(([method]) => ['get', 'post'].includes(method)).map(([, operation]) => operation.operationId).filter(Boolean)
);
const expectedWorker = [
  'workerClaimTask', 'workerCompleteTask', 'workerClaimAuthoringAction',
  'workerCompleteAuthoringAction', 'workerRecordMidsceneCapability',
  'workerClaimRepairValidation', 'workerCompleteRepairValidation'
];
if (JSON.stringify(workerOperations.sort()) !== JSON.stringify(expectedWorker.sort())) failures.push('worker contract must expose the seven deterministic run/authoring/repair operations');
if (workerContract.document.components?.securitySchemes?.workerBearer?.scheme !== 'bearer') failures.push('worker Bearer authentication is missing');

if (failures.length) {
  console.error('HENGZHUN_I3_OPENAPI_INVALID');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I3_OPENAPI_VERIFIED',
    publicOperationCount: publicOperations.length,
    workerOperationCount: workerOperations.length,
    separateWorkerChannel: true,
    authoringOperationCount: 3
  }, null, 2));
}
