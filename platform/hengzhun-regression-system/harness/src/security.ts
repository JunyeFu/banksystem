import crypto from 'node:crypto';
import { HarnessError } from './errors';
import { credentialFingerprint } from './utils';

function ipv4ToNumber(address: string): number | undefined {
  const parts = address.split('.');
  if (parts.length !== 4) return undefined;
  const values = parts.map(part => Number(part));
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return undefined;
  return values.reduce((total, value) => ((total << 8) | value) >>> 0, 0);
}

function normalizeRemoteAddress(address: string | undefined): string {
  if (!address) return 'unknown';
  if (address.startsWith('::ffff:')) return address.slice(7);
  return address;
}

function matchesCidr(address: string, rule: string): boolean {
  if (!rule.includes('/')) return address === rule;
  const [network, prefixText] = rule.split('/');
  if (!network || !prefixText) return false;
  const candidate = ipv4ToNumber(address);
  const base = ipv4ToNumber(network);
  const prefix = Number(prefixText);
  if (candidate === undefined || base === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (candidate & mask) === (base & mask);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export interface SecurityConfig {
  serviceToken: string;
  allowedClients: string[];
}

export interface SecurityResult {
  remoteAddress: string;
  credentialFingerprint?: string;
}

export function loadSecurityConfig(environment: NodeJS.ProcessEnv = process.env): SecurityConfig {
  const serviceToken = environment.HENGZHUN_SERVICE_TOKEN ?? '';
  if (serviceToken.length < 32) throw new Error('HENGZHUN_SERVICE_TOKEN must contain at least 32 characters');
  const allowedClients = (environment.HENGZHUN_ALLOWED_CLIENTS ?? '127.0.0.1,::1')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (allowedClients.length === 0) throw new Error('HENGZHUN_ALLOWED_CLIENTS must not be empty');
  return { serviceToken, allowedClients };
}

export function authorizeRequest(
  authorizationHeader: string | undefined,
  remoteAddressValue: string | undefined,
  config: SecurityConfig
): SecurityResult {
  const remoteAddress = normalizeRemoteAddress(remoteAddressValue);
  if (!config.allowedClients.some(rule => matchesCidr(remoteAddress, rule))) {
    throw new HarnessError(403, 'CLIENT_NOT_ALLOWED', 'AUTHORIZATION', '调用方网络地址不在允许范围内。');
  }
  const prefix = 'Bearer ';
  const suppliedToken = authorizationHeader?.startsWith(prefix) ? authorizationHeader.slice(prefix.length) : '';
  const fingerprint = credentialFingerprint(suppliedToken);
  if (!suppliedToken || !safeEqual(suppliedToken, config.serviceToken)) {
    throw new HarnessError(401, 'INVALID_SERVICE_TOKEN', 'AUTHENTICATION', '服务令牌无效。');
  }
  return { remoteAddress, credentialFingerprint: fingerprint };
}

export function remoteAddressForAudit(value: string | undefined): string {
  return normalizeRemoteAddress(value);
}
