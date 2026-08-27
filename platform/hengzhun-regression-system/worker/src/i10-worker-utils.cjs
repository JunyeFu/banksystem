'use strict';

const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function credentialEnvironmentName(alias, field) {
  const key = String(alias || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `HENGZHUN_CREDENTIAL_${key}_${field}`;
}

function resolveCredential(alias, environment = process.env) {
  const username = environment[credentialEnvironmentName(alias, 'USERNAME')];
  const password = environment[credentialEnvironmentName(alias, 'PASSWORD')];
  if (!username || !password) {
    const error = new Error('凭据别名未配置。');
    error.code = 'CREDENTIAL_ALIAS_UNAVAILABLE';
    error.category = 'ENVIRONMENT';
    throw error;
  }
  return { username, password };
}

function artifact(artifactType, mediaType, redactionStatus, extension, content, metadata) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return { artifactType, mediaType, redactionStatus, extension, base64Content: bytes.toString('base64'), metadata };
}

function resolveExecutionCredential(task, environment = process.env, options = {}) {
  const supplied = options?.credential;
  if (supplied?.username && supplied?.password) {
    return { username: String(supplied.username), password: String(supplied.password) };
  }
  return resolveCredential(task?.execution?.credentialAlias, environment);
}

function quarantinedScreenshotArtifact(content, metadata = {}) {
  return artifact('SCREENSHOT', 'image/png', 'QUARANTINED', 'png', content, {
    ...metadata,
    pixelRedactionVerified: false,
    quarantineReason: 'PIXEL_REDACTION_NOT_VERIFIED'
  });
}

function throwIfLeaseAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason?.code === 'WORKER_LEASE_CONFLICT'
    ? signal.reason
    : Object.assign(new Error('WORKER_LEASE_CONFLICT'), { code: 'WORKER_LEASE_CONFLICT', cause: signal.reason });
}

function bindLeaseAbortToBrowser(signal, browser) {
  if (!signal) return () => {};
  const close = () => { void browser.close().catch(() => {}); };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) close();
  return () => signal.removeEventListener('abort', close);
}

function normalizeIp(value) {
  const raw = String(value || '').trim().replace(/^\[|\]$/g, '').split('%', 1)[0].toLowerCase();
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : raw;
}

function addressClass(value) {
  const address = normalizeIp(value);
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 127) return 'LOOPBACK';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'PRIVATE';
    if (a === 0 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || a >= 224 || (a === 192 && b === 0) || (a === 198 && [18, 19, 51].includes(b))
      || (a === 203 && b === 0)) return 'FORBIDDEN';
    return 'PUBLIC';
  }
  if (net.isIP(address) === 6) {
    if (address === '::1') return 'LOOPBACK';
    if (address === '::' || /^fe[89ab]/.test(address) || address.startsWith('ff') || address.startsWith('2001:db8:')) return 'FORBIDDEN';
    if (address.startsWith('fc') || address.startsWith('fd')) return 'PRIVATE';
    return 'PUBLIC';
  }
  return 'FORBIDDEN';
}

async function assertTargetUrlResolution(urlValue, targetProfile) {
  const url = new URL(urlValue);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literal = net.isIP(hostname);
  const answers = literal ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
  const observed = [...new Set(answers.map(answer => normalizeIp(answer.address)))].sort();
  const pinned = Array.isArray(targetProfile?.resolvedAddresses?.[url.hostname])
    ? [...new Set(targetProfile.resolvedAddresses[url.hostname].map(normalizeIp))].sort()
    : [];
  if (!observed.length || !pinned.length || observed.join('\0') !== pinned.join('\0')) {
    const error = new Error('目标站点DNS解析与已确认快照不一致。');
    error.code = 'I10_TARGET_DNS_REBINDING_DETECTED';
    error.category = 'AUTHORIZATION';
    throw error;
  }
  const expectedClass = targetProfile.networkMode === 'LOCAL' ? 'LOOPBACK'
    : targetProfile.networkMode === 'INTRANET' ? 'PRIVATE' : 'PUBLIC';
  if (observed.some(address => addressClass(address) !== expectedClass)) {
    const error = new Error('目标站点解析地址越出已确认网络边界。');
    error.code = 'I10_TARGET_ADDRESS_POLICY_REJECTED';
    error.category = 'AUTHORIZATION';
    throw error;
  }
}

function chromiumHostResolverRules(targetProfile) {
  const entries = Object.entries(targetProfile?.resolvedAddresses || {})
    .filter(([hostname, addresses]) => /^[A-Za-z0-9.-]+$/.test(hostname)
      && Array.isArray(addresses) && addresses.length > 0 && net.isIP(normalizeIp(addresses[0])) > 0)
    .map(([hostname, addresses]) => `MAP ${hostname} ${normalizeIp(addresses[0])}`)
    .sort();
  if (entries.length === 0) {
    const error = new Error('目标站点缺少可用于浏览器连接的DNS固定快照。');
    error.code = 'I10_TARGET_RESOLUTION_PIN_MISSING';
    error.category = 'AUTHORIZATION';
    throw error;
  }
  return `--host-resolver-rules=${entries.join(',')}`;
}

module.exports = {
  artifact, quarantinedScreenshotArtifact, throwIfLeaseAborted, bindLeaseAbortToBrowser,
  assertTargetUrlResolution, chromiumHostResolverRules, credentialEnvironmentName, resolveCredential,
  resolveExecutionCredential, sha256
};
