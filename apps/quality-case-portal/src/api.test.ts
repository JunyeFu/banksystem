import { afterEach, expect, test, vi } from 'vitest';
import { qualityApi } from './api';

afterEach(() => vi.unstubAllGlobals());

const reads = [
  ['overview', '/overview'], ['cases', '/cases?limit=20'],
  ['baselines', '/baselines'], ['runs', '/runs'], ['schedules', '/schedules'],
  ['incidents', '/incidents'], ['knowledge', '/knowledge'], ['releases', '/releases'],
] as const;

test.each(reads)('%s uses a same-origin credential-free GET and preserves the projection', async (name, path) => {
  const projection = { source: 'synthetic-harness-projection', releaseIdentity: 'synthetic-identity', status: 'BLOCKED' };
  const fetch = vi.fn().mockResolvedValue(Response.json(projection));
  vi.stubGlobal('fetch', fetch);
  expect(await qualityApi[name]()).toEqual(projection);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, request] = fetch.mock.calls[0]!;
  expect(url).toBe(`/api/quality/v1${path}`);
  expect(request.method ?? 'GET').toBe('GET');
  expect(request.body).toBeUndefined();
  expect(new Headers(request.headers).has('Authorization')).toBe(false);
  expect(new Headers(request.headers).get('Accept')).toBe('application/json');
});

test('case detail encodes the ID without changing the read-only boundary', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ caseId: 'case/with ? characters' }));
  vi.stubGlobal('fetch', fetch);
  await qualityApi.caseDetail('case/with ? characters');
  const [url, request] = fetch.mock.calls[0]!;
  expect(url).toBe('/api/quality/v1/cases/case%2Fwith%20%3F%20characters');
  expect(request.method ?? 'GET').toBe('GET');
  expect(request.body).toBeUndefined();
  expect(new Headers(request.headers).has('Authorization')).toBe(false);
});

test('case query encodes filters and cursor and omits blank filters', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ items: [] }));
  vi.stubGlobal('fetch', fetch);
  await qualityApi.cases({ q: 'transfer & balance', cursor: 'next/1', status: '' });
  const [url] = fetch.mock.calls[0]!;
  expect(new URL(url as string, 'http://127.0.0.1:18788').searchParams).toEqual(new URLSearchParams({ limit: '20', q: 'transfer & balance', cursor: 'next/1' }));
});

test('the public client exposes only the nine query capabilities', () => {
  expect(Object.keys(qualityApi).sort()).toEqual(['overview', 'cases', 'caseDetail', 'baselines', 'runs', 'schedules', 'incidents', 'knowledge', 'releases'].sort());
});

test.each([401, 409, 500])('HTTP %i remains a failure without replay or synthetic success', async status => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ detail: 'synthetic failure', status }, { status }));
  vi.stubGlobal('fetch', fetch);
  await expect(qualityApi.overview()).rejects.toThrow('synthetic failure');
  expect(fetch).toHaveBeenCalledOnce();
});

test('non-JSON server error is reported, not converted to a successful projection', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  await expect(qualityApi.releases()).rejects.toThrow('服务暂不可用');
  expect(fetch).toHaveBeenCalledOnce();
});

test('network failure propagates without retry', async () => {
  const failure = new TypeError('synthetic network failure');
  const fetch = vi.fn().mockRejectedValue(failure);
  vi.stubGlobal('fetch', fetch);
  await expect(qualityApi.runs()).rejects.toBe(failure);
  expect(fetch).toHaveBeenCalledOnce();
});
