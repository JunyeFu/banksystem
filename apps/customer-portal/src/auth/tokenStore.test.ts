import { afterEach, expect, test, vi } from 'vitest';
import { clearAccessToken, getAccessToken, isAuthenticated, setAccessToken } from './tokenStore';

afterEach(() => { clearAccessToken(); vi.unstubAllEnvs(); });

test('normal authentication requires the in-memory access token and logout clears it', () => {
  vi.stubEnv('VITE_E2E_AUTH_BYPASS', 'false');
  clearAccessToken();
  expect(isAuthenticated()).toBe(false);
  expect(getAccessToken()).toBeNull();
  setAccessToken('synthetic-unit-token');
  expect(getAccessToken()).toBe('synthetic-unit-token');
  expect(isAuthenticated()).toBe(true);
  clearAccessToken();
  expect(isAuthenticated()).toBe(false);
  expect(getAccessToken()).toBeNull();
});

test('test-only bypass is explicit and never creates a bearer token', () => {
  clearAccessToken();
  vi.stubEnv('VITE_E2E_AUTH_BYPASS', 'true');
  expect(isAuthenticated()).toBe(true);
  expect(getAccessToken()).toBeNull();
  vi.stubEnv('VITE_E2E_AUTH_BYPASS', 'TRUE');
  expect(isAuthenticated()).toBe(false);
});
