'use strict';

const crypto = require('node:crypto');

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

module.exports = { artifact, credentialEnvironmentName, resolveCredential, sha256 };
