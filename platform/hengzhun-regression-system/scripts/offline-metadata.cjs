#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function files(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'manifest.json' || entry.name === 'SHA256SUMS') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...files(absolute));
    else output.push(absolute);
  }
  return output.sort();
}

function relative(root, file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function writeManifest(root, version, sourceCommit, imagesJson) {
  const entries = files(root).map(file => ({ path: relative(root, file), bytes: fs.statSync(file).size, sha256: sha256(file) }));
  const images = imagesJson && fs.existsSync(imagesJson) ? JSON.parse(fs.readFileSync(imagesJson, 'utf8').replace(/^\uFEFF/, '')) : [];
  const manifest = {
    schemaVersion: 'hengzhun-offline-manifest-v1', packageVersion: version, sourceCommit,
    createdAt: new Date().toISOString(), databaseEngine: 'sqlite', secretMaterialIncluded: false,
    images, files: entries
  };
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), entries.map(item => `${item.sha256}  ${item.path}`).join('\n') + '\n');
}

function verify(root) {
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('OFFLINE_MANIFEST_MISSING');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 'hengzhun-offline-manifest-v1' || manifest.databaseEngine !== 'sqlite' || manifest.secretMaterialIncluded !== false) {
    throw new Error('OFFLINE_MANIFEST_CONTRACT_INVALID');
  }
  for (const entry of manifest.files) {
    if (path.isAbsolute(entry.path) || entry.path.includes('..')) throw new Error('OFFLINE_MANIFEST_PATH_INVALID');
    const absolute = path.join(root, ...entry.path.split('/'));
    if (!fs.existsSync(absolute)) throw new Error(`OFFLINE_FILE_MISSING:${entry.path}`);
    if (fs.statSync(absolute).size !== entry.bytes || sha256(absolute) !== entry.sha256) throw new Error(`OFFLINE_HASH_MISMATCH:${entry.path}`);
  }
  process.stdout.write(JSON.stringify({ status: 'OFFLINE_PACKAGE_VERIFIED', packageVersion: manifest.packageVersion, fileCount: manifest.files.length }) + '\n');
}

function writeSbom(lockPath, outputPath) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const components = Object.entries(lock.packages ?? {}).filter(([key]) => key.startsWith('node_modules/')).map(([key, value]) => ({
    type: 'library', name: key.slice('node_modules/'.length), version: value.version ?? 'unknown',
    ...(value.integrity ? { hashes: [{ alg: 'SHA-512', content: String(value.integrity).replace(/^sha512-/, '') }] } : {})
  }));
  const sbom = {
    bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:uuid:${crypto.randomUUID()}`, version: 1,
    metadata: { timestamp: new Date().toISOString(), component: { type: 'application', name: lock.name, version: lock.version } },
    components
  };
  fs.writeFileSync(outputPath, JSON.stringify(sbom, null, 2) + '\n');
}

const [command, ...args] = process.argv.slice(2);
if (command === 'manifest') writeManifest(args[0], args[1], args[2], args[3]);
else if (command === 'verify') verify(args[0]);
else if (command === 'sbom') writeSbom(args[0], args[1]);
else throw new Error('USAGE: offline-metadata.cjs manifest|verify|sbom ...');
