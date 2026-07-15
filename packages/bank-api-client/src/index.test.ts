import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankApiError, CustomerApiClient, OperationsApiClient } from './index';

const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

afterEach(() => vi.unstubAllGlobals());

describe('generated-contract API clients', () => {
  it('builds the customer status page query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => 'synthetic-token' });
    await client.listTransfers({ status: 'RISK_REVIEW', page: 0, size: 20 });
    expect(fetchMock).toHaveBeenCalledWith('/api/customer/v1/transfers?status=RISK_REVIEW&page=0&size=20', expect.objectContaining({ headers: expect.any(Headers) }));
  });

  it('sends the idempotency key and beneficiary reference', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ transferId: crypto.randomUUID(), status: 'CREATED', amount: '1.00', currency: 'CNY', correlationId: 'corr' }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    await client.createTransfer({ sourceAccountId: '1', beneficiaryId: crypto.randomUUID(), amount: '1.00', currency: 'CNY' }, '1234567890abcdef');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('1234567890abcdef');
    expect(String(init.body)).toContain('beneficiaryId');
  });

  it('uses the operations detail route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({})); vi.stubGlobal('fetch', fetchMock);
    const client = new OperationsApiClient({ baseUrl: '/api/operations/v1', getAccessToken: () => null });
    await client.getTransfer('transfer-1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/operations/v1/transfers/transfer-1');
  });

  it('surfaces RFC 9457 problem details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ type: 'about:blank', title: 'Conflict', status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' }, 409)));
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    await expect(client.getTransfer('missing')).rejects.toMatchObject<Partial<BankApiError>>({ status: 409 });
  });
});
