#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const failures = [];
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const openapiPath = 'contracts/openapi/i1-conformance.yaml';
const openapi = read(openapiPath);
for (const marker of [
  'openapi: 3.0.3', 'operationId: echoLocations', 'operationId: echoJsonTypes',
  'operationId: measureSynchronousWindow', 'in: query', 'in: path', 'in: header',
  'requestBody:', 'type: string', 'type: integer', 'type: number', 'type: boolean',
  'type: array', 'type: object', 'scheme: bearer'
]) {
  if (!openapi.includes(marker)) failures.push(`${openapiPath} missing marker: ${marker}`);
}
if (Buffer.byteLength(openapi) > 2 * 1024 * 1024) failures.push(`${openapiPath} exceeds 2 MiB`);
if (/https?:\/\/(?!hengzhun-conformance:18787)/.test(openapi)) failures.push(`${openapiPath} exposes a non-local server`);

const skillFiles = [
  'coze/skills/i1-conformance-skill/SKILL.md',
  'coze/skills/i1-conformance-skill/references/marker.md',
  'coze/skills/i1-conformance-skill/scripts/marker.cjs'
];
for (const relative of skillFiles) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`missing Skill source: ${relative}`);
}

const overlay = read('coze/studio/docker-compose.hengzhun.yml');
if (overlay.includes(':latest')) failures.push('Coze Studio override contains a mutable latest tag');
const immutableImages = overlay.match(/image:\s+[^\s]+@sha256:[a-f0-9]{64}/g) || [];
if (immutableImages.length !== 11) failures.push(`expected 11 immutable Coze images, found ${immutableImages.length}`);

const manifest = read('coze/public-ui-configuration.yaml');
for (const marker of ['public_ui_only', 'Coze Knowledge Base', 'publicUploadRequired: true']) {
  if (!manifest.includes(marker)) failures.push(`public UI manifest missing marker: ${marker}`);
}

if (failures.length) {
  console.error('HENGZHUN_I1_ARTIFACTS_INVALID');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    status: 'HENGZHUN_I1_ARTIFACTS_READY',
    openapiSha256: crypto.createHash('sha256').update(openapi).digest('hex'),
    immutableCozeImages: immutableImages.length,
    skillSourceFiles: skillFiles.length
  }, null, 2));
}
