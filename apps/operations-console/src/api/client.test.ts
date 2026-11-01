import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { operationsApi } from './client';
import { clearAccessToken, getAccessToken, setAccessToken } from '../auth/tokenStore';

beforeEach(() => clearAccessToken());
afterEach(() => { clearAccessToken(); vi.unstubAllGlobals(); });

test('document transition sends the displayed version and operations bearer through Gateway', async () => {
  const document = { documentId: 'synthetic-document', title: 'Policy', category: 'POLICY', status: 'PUBLISHED', version: 5, uploadedBy: 'synthetic-operator', uploadedAt: '2026-10-09T00:00:00Z', fileName: 'policy.txt', contentType: 'text/plain', fileSize: 12, checksum: 'synthetic-checksum' };
  const fetch = vi.fn().mockResolvedValue(Response.json(document));
  vi.stubGlobal('fetch', fetch);
  setAccessToken('synthetic-operations-token');
  expect(await operationsApi.updateDocumentStatus(document.documentId, { status: 'PUBLISHED', version: 4 })).toEqual(document);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, request] = fetch.mock.calls[0]!;
  expect(url).toBe('/api/operations/v1/documents/synthetic-document/status');
  expect(request.method).toBe('PATCH');
  expect(JSON.parse(request.body as string)).toEqual({ status: 'PUBLISHED', version: 4 });
  expect(new Headers(request.headers).get('Authorization')).toBe('Bearer synthetic-operations-token');
});

test('version conflict remains a failure and is not automatically replayed', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ type: 'about:blank', title: 'version conflict', status: 409, code: 'DOCUMENT_CONFLICT' }, { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  await expect(operationsApi.updateDocumentStatus('document', { status: 'ARCHIVED', version: 4 })).rejects.toMatchObject({ status: 409 });
  expect(fetch).toHaveBeenCalledOnce();
});

test('logout clears the token and does not fabricate a bearer', async () => {
  setAccessToken('synthetic-token');
  clearAccessToken();
  expect(getAccessToken()).toBeNull();
  const fetch = vi.fn().mockResolvedValue(Response.json([]));
  vi.stubGlobal('fetch', fetch);
  await operationsApi.listDocuments();
  const [, request] = fetch.mock.calls[0]!;
  expect(new Headers(request.headers).has('Authorization')).toBe(false);
});
