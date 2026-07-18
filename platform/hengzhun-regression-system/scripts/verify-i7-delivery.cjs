#!/usr/bin/env node
'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const productRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(productRoot, '..', '..');

function fail(code) {
  throw new Error(code);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function parseArgs(argv) {
  const parsed = { record: false, requireClean: false, packageDirectory: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--record') parsed.record = true;
    else if (item === '--require-clean') parsed.requireClean = true;
    else if (item === '--package-dir') parsed.packageDirectory = path.resolve(argv[++index] ?? fail('PACKAGE_DIRECTORY_REQUIRED'));
    else if (item === '--output') parsed.output = path.resolve(argv[++index] ?? fail('OUTPUT_PATH_REQUIRED'));
    else if (item !== '--check') fail(`UNKNOWN_ARGUMENT:${item}`);
  }
  return parsed;
}

function git(args) {
  return childProcess.execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

function assertVerifiedEvidence(relativePath) {
  const absolute = path.join(repoRoot, ...relativePath.split('/'));
  if (!fs.existsSync(absolute)) fail(`DELIVERY_EVIDENCE_MISSING:${relativePath}`);
  const head = fs.readFileSync(absolute, 'utf8').slice(0, 2048);
  if (!/^status:\s*verified\s*$/mi.test(head)) fail(`DELIVERY_EVIDENCE_NOT_VERIFIED:${relativePath}`);
}

function assertPackage(packageDirectory, sourceCommit) {
  const manifestPath = path.join(packageDirectory, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail('DELIVERY_OFFLINE_MANIFEST_MISSING');
  const manifest = readJson(manifestPath);
  if (manifest.schemaVersion !== 'hengzhun-offline-manifest-v1') fail('DELIVERY_OFFLINE_SCHEMA_INVALID');
  if (manifest.databaseEngine !== 'sqlite' || manifest.secretMaterialIncluded !== false) fail('DELIVERY_OFFLINE_SAFETY_INVALID');
  if (manifest.sourceCommit !== sourceCommit) fail('DELIVERY_SOURCE_COMMIT_MISMATCH');
  if (!Array.isArray(manifest.images) || manifest.images.length !== 3) fail('DELIVERY_IMAGE_SET_INCOMPLETE');
  return { packageVersion: manifest.packageVersion, imageCount: manifest.images.length, fileCount: manifest.files.length };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const freeze = readJson(path.join(productRoot, 'config', 'internship-delivery-freeze.json'));
  if (freeze.schemaVersion !== 'hengzhun-internship-delivery-v1' || freeze.implementationBatch !== 'I7') fail('DELIVERY_FREEZE_CONTRACT_INVALID');
  if (freeze.databaseEngine !== 'sqlite') fail('DELIVERY_DATABASE_ENGINE_INVALID');

  const publicConfig = YAML.parse(fs.readFileSync(path.join(productRoot, 'coze', 'public-ui-configuration.yaml'), 'utf8'));
  if (publicConfig?.i6?.plugin?.currentPublishedVersion !== freeze.requiredPluginVersion) fail('DELIVERY_PLUGIN_VERSION_MISMATCH');
  if (publicConfig?.i6?.plugin?.currentPublishedOperationCount !== freeze.requiredOperationCount) fail('DELIVERY_PLUGIN_OPERATION_COUNT_MISMATCH');
  if (publicConfig?.i6?.acceptance?.platformExitGate !== freeze.requiredPlatformExitGate) fail('DELIVERY_PLATFORM_EXIT_GATE_OPEN');
  if (publicConfig?.i6?.acceptance?.publicPlatformNaturalLanguageScheduling !== 'VERIFIED_CREATE_GET_DISABLE_GET') fail('DELIVERY_NATURAL_LANGUAGE_SCHEDULING_UNVERIFIED');

  const openapi = YAML.parse(fs.readFileSync(path.join(productRoot, 'contracts', 'openapi', 'hengzhun-harness-v1.yaml'), 'utf8'));
  const operations = Object.values(openapi.paths ?? {}).flatMap(route => Object.values(route ?? {})).map(operation => operation?.operationId).filter(Boolean);
  if (operations.length !== freeze.requiredOperationCount || new Set(operations).size !== operations.length) fail('DELIVERY_OPENAPI_OPERATION_SET_INVALID');

  for (const evidence of freeze.requiredEvidence) assertVerifiedEvidence(evidence);
  const productPrefix = `${freeze.productRoot}/`;
  const tracked = git(['ls-files']).split(/\r?\n/).filter(Boolean).map(file => file.replaceAll('\\', '/')).filter(file => file.startsWith(productPrefix));
  const forbidden = freeze.forbiddenTrackedPathPatterns.map(pattern => new RegExp(pattern, 'i'));
  const forbiddenCount = tracked.filter(file => forbidden.some(pattern => pattern.test(file))).length;
  if (forbiddenCount !== 0) fail('DELIVERY_FORBIDDEN_TRACKED_PATH_FOUND');

  const sourceCommit = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain', '--untracked-files=no']).length > 0;
  if (args.requireClean && dirty) fail('DELIVERY_SOURCE_NOT_CLEAN');
  const packageResult = args.packageDirectory ? assertPackage(args.packageDirectory, sourceCommit) : null;

  const record = {
    schemaVersion: freeze.schemaVersion,
    deliveryId: freeze.deliveryId,
    runId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    sourceCommit,
    sourceClean: !dirty,
    databaseEngine: freeze.databaseEngine,
    checks: {
      verifiedEvidenceCount: freeze.requiredEvidence.length,
      openapiOperationCount: operations.length,
      publicPluginVersion: publicConfig.i6.plugin.currentPublishedVersion,
      publicPlatformExitGate: publicConfig.i6.acceptance.platformExitGate,
      forbiddenTrackedPathCount: forbiddenCount,
      offlinePackage: packageResult
    },
    deferredExternalClaims: freeze.deferredExternalClaims,
    status: 'HENGZHUN_I7_INTERNSHIP_DELIVERY_VERIFIED'
  };

  if (args.record) {
    const output = args.output ?? path.join(productRoot, '.data', 'delivery-runs', `${freeze.deliveryId}-${record.runId}`, 'summary.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(record) + '\n');
}

main();
