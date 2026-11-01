import { webcrypto, createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:18082' } });
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('isolated issuer owns authorization and token exchange', async () => {
  vi.stubEnv('VITE_OIDC_ISSUER', 'http://127.0.0.1:21900/realms/bank-customer');
  const { buildAuthRequest, exchangeCodeForToken } = await import('./oidc');
  expect(new URL((await buildAuthRequest()).authorizationUrl).origin).toBe('http://127.0.0.1:21900');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'synthetic-token' }) });
  vi.stubGlobal('fetch', fetch);
  await exchangeCodeForToken('synthetic-code', 'synthetic-verifier');
  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:21900/realms/bank-customer/protocol/openid-connect/token', expect.objectContaining({ method: 'POST' }));
});

test('authorization uses a new state and verified S256 challenge, not browser passwords', async () => {
  const { buildAuthRequest } = await import('./oidc');
  const request = await buildAuthRequest();
  const url = new URL(request.authorizationUrl);
  expect(url.origin).toBe('http://127.0.0.1:19000');
  expect(url.pathname).toBe('/realms/bank-customer/protocol/openid-connect/auth');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    client_id: 'customer-portal', redirect_uri: 'http://127.0.0.1:18082/portal/login/callback',
    response_type: 'code', scope: 'openid profile', state: request.state, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(request.verifier).digest('base64url'),
  });
  expect(url.searchParams.has('prompt')).toBe(false);
  expect(url.searchParams.has('password')).toBe(false);
  expect(request.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  const next = await buildAuthRequest('none');
  expect(new URL(next.authorizationUrl).searchParams.get('prompt')).toBe('none');
  expect(next.state).not.toBe(request.state);
  expect(next.verifier).not.toBe(request.verifier);
});

test('code exchange sends only the authorization code and matching PKCE verifier', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'synthetic-unit-token' })));
  vi.stubGlobal('fetch', fetch);
  const { exchangeCodeForToken } = await import('./oidc');
  await expect(exchangeCodeForToken('synthetic-code', 'synthetic-verifier')).resolves.toBe('synthetic-unit-token');
  expect(fetch).toHaveBeenCalledOnce();
  const [url, request] = fetch.mock.calls[0]!;
  expect(url).toBe('http://127.0.0.1:19000/realms/bank-customer/protocol/openid-connect/token');
  expect(request.method).toBe('POST');
  expect(Object.fromEntries(request.body as URLSearchParams)).toEqual({
    grant_type: 'authorization_code', client_id: 'customer-portal',
    redirect_uri: 'http://127.0.0.1:18082/portal/login/callback',
    code: 'synthetic-code', code_verifier: 'synthetic-verifier',
  });
});

test('issuer rejection stops after one exchange attempt', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('rejected', { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  const { exchangeCodeForToken } = await import('./oidc');
  await expect(exchangeCodeForToken('code', 'verifier')).rejects.toThrow('OIDC token exchange failed: 401');
  expect(fetch).toHaveBeenCalledOnce();
});

test.each([null, {}, { access_token: 42 }])('invalid issuer payload %j cannot authenticate', async payload => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
  const { exchangeCodeForToken } = await import('./oidc');
  await expect(exchangeCodeForToken('code', 'verifier')).rejects.toThrow('OIDC token response missing access_token');
});
