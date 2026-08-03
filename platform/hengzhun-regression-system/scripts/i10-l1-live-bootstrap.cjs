#!/usr/bin/env node
'use strict';

// Creates one isolated controlled-portal session for a focused L1 live run.
// Credentials are generated in process memory, saved only through the normal
// local DPAPI capture endpoint, and never printed or written to this file.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const node = path.join(root, 'runtime', 'node-v20.20.2-win-x64', 'node.exe');
// A focused live run may coexist with a prior diagnostic portal.  Never
// replace a listener simply because it owns the historical default port:
// doing so can pair newly generated credentials with an old in-memory portal
// and make a login failure look like a Midscene failure.  The caller can
// select an unused local port for every isolated run.
const port = Number(process.env.I10_STAGE8_PORT || 28884);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw Object.assign(new Error('I10_L1_PORT_INVALID'), { code: 'I10_L1_PORT_INVALID' });
}
const portalUrl = `http://127.0.0.1:${port}`;
const scenarioPath = path.join(root, '.data', 'tests', 'i10-stage8-live', 'scenario.json');

function fail(code) { const error = new Error(code); error.code = code; throw error; }
async function assertControlledPortalPortAvailable() {
  // A running fixture retains its generated in-memory login credentials.  If
  // a new bootstrap merely observes that old listener as healthy, then stores
  // new DPAPI credentials, the following browser run can only fail login and
  // will misleadingly look like a visual-location failure.  Probe ownership
  // before creating *any* credential material and fail closed instead.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', () => {
      const error = Object.assign(new Error('I10_L1_PORT_IN_USE'), { code: 'I10_L1_PORT_IN_USE' });
      reject(error);
    });
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(resolve));
  });
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) fail(`I10_L1_HTTP_${response.status}`);
  return body;
}
async function waitForPortal() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { await request(`${portalUrl}/__health`, { timeoutMs: 1_000 }); return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  fail('I10_L1_PORTAL_START_TIMEOUT');
}
function loadLocalRuntimeEnvironment() {
  const source = path.join(root, '.data', 'runtime.env');
  if (!fs.existsSync(source)) return;
  for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
async function main() {
  loadLocalRuntimeEnvironment();
  await assertControlledPortalPortAvailable();
  const serviceToken = String(process.env.HENGZHUN_SERVICE_TOKEN || '');
  if (serviceToken.length < 32) fail('I10_L1_SERVICE_TOKEN_MISSING');
  const username = `l1-${crypto.randomUUID()}`;
  const password = crypto.randomBytes(32).toString('base64url');
  const logs = path.join(root, '.data', 'logs', 'i10');
  fs.mkdirSync(logs, { recursive: true });
  const child = spawn(node, [path.join(root, 'scripts', 'i10-stage8-controlled-portal.cjs')], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', fs.openSync(path.join(logs, 'l1-portal.stdout.log'), 'a'), fs.openSync(path.join(logs, 'l1-portal.stderr.log'), 'a')],
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, HENGZHUN_I10_STAGE8_PORT: String(port), I10_STAGE8_FIXTURE_USERNAME: username, I10_STAGE8_FIXTURE_PASSWORD: password, I10_STAGE8_PORTAL_BRAND: String(process.env.I10_LIVE_PORTAL_BRAND || '复兴银行门户') }
  });
  child.unref();
  await waitForPortal();
  const created = await request('http://127.0.0.1:18788/v1/i10/credentials:sessions-create', {
    method: 'POST',
    headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ namespace: 'hengzhun-local', idempotencyKey: `i10-l1-${crypto.randomUUID()}`, label: 'L1受控门户凭据' })
  });
  const token = new URLSearchParams(new URL(String(created.captureUrl)).hash.slice(1)).get('token');
  if (!token || !/^credsession_[0-9a-f-]{36}$/.test(String(created.sessionId))) fail('I10_L1_CREDENTIAL_SESSION_INVALID');
  const stored = await request(`http://127.0.0.1:18788/v1/i10/credentials/${created.sessionId}:store`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ captureToken: token, username, password })
  });
  if (!/^credential_[0-9a-f-]{36}$/.test(String(stored.credentialRef))) fail('I10_L1_CREDENTIAL_STORE_INVALID');
  const prior = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
  fs.writeFileSync(scenarioPath, `${JSON.stringify({ ...prior, credentialRef: stored.credentialRef, portalUrl, failureControlUrl: portalUrl }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(root, '.data', 'tests', 'i10-stage8-live', 'l1-bootstrap.json'), `${JSON.stringify({ schemaVersion: 'hengzhun-i10-l1-bootstrap-v1', portalPid: child.pid, portalUrl, createdAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  process.stdout.write(JSON.stringify({ status: 'READY', portalPid: child.pid, scenarioPath: path.relative(root, scenarioPath).replaceAll('\\', '/') }) + '\n');
}
main().catch(error => { process.stderr.write(JSON.stringify({ status: 'FAILED', errorCode: error.code || 'I10_L1_BOOTSTRAP_FAILED' }) + '\n'); process.exitCode = 2; });
