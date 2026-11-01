import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:18083' } });
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('isolated issuer owns authorization and token exchange', async () => {
  vi.stubEnv('VITE_OIDC_ISSUER', 'http://127.0.0.1:21900/realms/bank-internal');
  const { buildAuthRequest, exchangeCodeForToken } = await import('./oidc');
  expect(new URL((await buildAuthRequest()).authorizationUrl).origin).toBe('http://127.0.0.1:21900');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'synthetic-token' }) });
  vi.stubGlobal('fetch', fetch);
  await exchangeCodeForToken('synthetic-code', 'synthetic-verifier');
  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:21900/realms/bank-internal/protocol/openid-connect/token', expect.objectContaining({ method: 'POST' }));
});

test('operations authorization is isolated and uses fresh S256 PKCE', async () => {
  const { buildAuthRequest } = await import('./oidc');
  const first = await buildAuthRequest();
  const second = await buildAuthRequest('none');
  const url = new URL(first.authorizationUrl);
  expect(url.pathname).toBe('/realms/bank-internal/protocol/openid-connect/auth');
  expect(url.searchParams.get('client_id')).toBe('operations-console');
  expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:18083/ops/login/callback');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(first.verifier).digest('base64url'));
  expect(url.searchParams.get('state')).toBe(first.state);
  expect(first.state).not.toBe(second.state);
  expect(first.verifier).not.toBe(second.verifier);
  expect(url.searchParams.has('prompt')).toBe(false);
  expect(new URL(second.authorizationUrl).searchParams.get('prompt')).toBe('none');
});

test('code exchange binds the operations client callback and verifier', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ access_token: 'synthetic-ops-token' }));
  vi.stubGlobal('fetch', fetch);
  const { exchangeCodeForToken } = await import('./oidc');
  expect(await exchangeCodeForToken('synthetic-code', 'synthetic-verifier')).toBe('synthetic-ops-token');
  expect(fetch).toHaveBeenCalledOnce();
  const [url, request] = fetch.mock.calls[0]!;
  expect(url).toBe('http://127.0.0.1:19000/realms/bank-internal/protocol/openid-connect/token');
  expect(request.method).toBe('POST');
  expect(Object.fromEntries(request.body as URLSearchParams)).toEqual({ grant_type: 'authorization_code', client_id: 'operations-console', redirect_uri: 'http://127.0.0.1:18083/ops/login/callback', code: 'synthetic-code', code_verifier: 'synthetic-verifier' });
});

test('rejected exchange fails without retry', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  const { exchangeCodeForToken } = await import('./oidc');
  await expect(exchangeCodeForToken('code', 'verifier')).rejects.toThrow('OIDC token exchange failed: 401');
  expect(fetch).toHaveBeenCalledOnce();
});

test.each([null, {}, { access_token: 42 }])('malformed token response fails: %j', async payload => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
  const { exchangeCodeForToken } = await import('./oidc');
  await expect(exchangeCodeForToken('code', 'verifier')).rejects.toThrow('missing access_token');
});
