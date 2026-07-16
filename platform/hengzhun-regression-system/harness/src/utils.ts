import crypto from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}

export function opaqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function requestHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function credentialFingerprint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return sha256(value).slice(0, 16);
}
