'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const productRoot = path.resolve(__dirname, '../..');
const node = path.join(productRoot, 'runtime', 'node-v20.20.2-win-x64', 'node.exe');
const tool = path.join(productRoot, 'scripts', 'offline-metadata.cjs');

test('I6 offline manifest verifies hashes, SQLite ownership and secret exclusion declaration', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengzhun-i6-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'backup'));
  fs.writeFileSync(path.join(root, 'backup', 'regression_platform.sqlite'), 'synthetic-sqlite');
  fs.writeFileSync(path.join(root, 'hengzhun-product.tar'), 'synthetic-product');
  fs.writeFileSync(path.join(root, 'image-metadata.json'), '[]');
  childProcess.execFileSync(node, [tool, 'sbom', path.join(productRoot, 'package-lock.json'), path.join(root, 'sbom.cdx.json')]);
  childProcess.execFileSync(node, [tool, 'manifest', root, 'test-v1', '0'.repeat(40), path.join(root, 'image-metadata.json')]);
  const verified = JSON.parse(childProcess.execFileSync(node, [tool, 'verify', root], { encoding: 'utf8' }));
  assert.equal(verified.status, 'OFFLINE_PACKAGE_VERIFIED');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.databaseEngine, 'sqlite');
  assert.equal(manifest.secretMaterialIncluded, false);
  assert.ok(manifest.files.some(file => file.path === 'sbom.cdx.json'));
  assert.ok(manifest.files.every(file => !/(^|\/)\.env($|\.)|runtime\.env|secret/i.test(file.path)));
  fs.appendFileSync(path.join(root, 'hengzhun-product.tar'), 'tamper');
  assert.throws(() => childProcess.execFileSync(node, [tool, 'verify', root], { stdio: 'pipe' }), /Command failed/);
});
