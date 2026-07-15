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

  it('encodes account identifiers when loading account detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      accountId: 'account/1', maskedAccountNumber: '****0001', currency: 'CNY', balance: '10.00', transactions: [],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    await client.getAccount('account/1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/customer/v1/accounts/account%2F1');
  });

  it('uses customer-scoped experience routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({ items: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    await client.listLoans();
    await client.getLoan('loan/81');
    await client.listDocuments();
    await client.listMessages();
    await client.getProfile();
    await client.getSecuritySettings();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/customer/v1/loans',
      '/api/customer/v1/loans/loan%2F81',
      '/api/customer/v1/documents',
      '/api/customer/v1/notifications',
      '/api/customer/v1/profile',
      '/api/customer/v1/security/settings',
    ]);
  });

  it('marks only the encoded customer message as read', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ messageId: 'message/1', read: true }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    await client.markMessageRead('message/1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/customer/v1/notifications/message%2F1/read');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
  });

  it('sends the customer creation date range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    await client.listTransfers({ from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T23:59:59.999Z' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-31T23%3A59%3A59.999Z');
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

  it('uses generated operations dashboard and risk routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response([])));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OperationsApiClient({ baseUrl: '/api/operations/v1', getAccessToken: () => null });
    await client.getDashboard();
    await client.listRiskAlerts('RESOLVED');
    await client.listRiskCases('UNDER_REVIEW');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/operations/v1/dashboard',
      '/api/operations/v1/risk/alerts?status=RESOLVED',
      '/api/operations/v1/risk/cases?status=UNDER_REVIEW',
    ]);
  });

  it('uses approval filters and idempotent maker-checker actions', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({ status: 'APPROVED', version: 2 })));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OperationsApiClient({ baseUrl: '/api/operations/v1', getAccessToken: () => null });
    await client.listApprovals('PENDING');
    await client.approveReversal('reversal/1', 1, '复核通过', '1234567890abcdef');
    await client.rejectReversal('reversal/2', 3, '资料不符', 'abcdef1234567890');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/operations/v1/approvals?status=PENDING');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/operations/v1/transfers/reversals/reversal%2F1/approve?version=1');
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get('Idempotency-Key')).toBe('1234567890abcdef');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/reversal%2F2/reject?version=3');
  });

  it('uses settlement monitoring and execution routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response([])));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OperationsApiClient({ baseUrl: '/api/operations/v1', getAccessToken: () => null });
    await client.listClearingBatches();
    await client.listReconciliations();
    await client.runReconciliation('CHANNEL_TO_CORE');
    await client.getLatestEodRun();
    await client.runEod('1234567890abcdef');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/operations/v1/clearing/batches',
      '/api/operations/v1/reconciliations',
      '/api/operations/v1/reconciliations',
      '/api/operations/v1/eod/latest',
      '/api/operations/v1/eod/run',
    ]);
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).body).toBe('{"type":"CHANNEL_TO_CORE"}');
    expect(new Headers((fetchMock.mock.calls[4]?.[1] as RequestInit).headers).get('Idempotency-Key')).toBe('1234567890abcdef');
  });

  it('uses document, audit, and system-health routes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response([])));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OperationsApiClient({ baseUrl: '/api/operations/v1', getAccessToken: () => null });
    await client.listDocuments({ category: 'POLICY', status: 'PUBLISHED', query: '制度' });
    await client.updateDocumentStatus('document/1', 'ARCHIVED');
    await client.listAuditEvents({ actorId: 'auditor', outcome: 'SUCCESS', correlationId: 'CORR-1' });
    await client.verifyAuditHashChain();
    await client.getSystemHealth();
    await client.getExternalServices();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/documents?category=POLICY&status=PUBLISHED&query=');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/documents/document%2F1/status');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('PATCH');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/audit/events?actorId=auditor&outcome=SUCCESS&correlationId=CORR-1');
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/operations/v1/audit/verify');
    expect(fetchMock.mock.calls[4]?.[0]).toBe('/api/operations/v1/system-health');
    expect(fetchMock.mock.calls[5]?.[0]).toBe('/api/operations/v1/external-services');
  });

  it('downloads a customer receipt as a PDF blob', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    const receipt = await client.getTransferReceiptPdf('transfer-1');
    expect(receipt.type).toBe('application/pdf');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/customer/v1/transfers/transfer-1/receipt?format=pdf');
  });

  it('sends operations filters and downloads the matching CSV', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [], page: 0, size: 20, totalItems: 0, totalPages: 0, summary: { total: 0, settled: 0, processing: 0, riskReview: 0, failed: 0 } }))
      .mockResolvedValueOnce(new Response('transferId,status\r\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OperationsApiClient({ baseUrl: '/api/operations/v1', getAccessToken: () => null });
    const filters = { status: 'FAILED' as const, currency: 'CNY', query: 'CORR-42', from: '2026-07-01T00:00:00Z', to: '2026-07-31T23:59:59Z' };
    await client.listTransfers({ ...filters, page: 0, size: 10 });
    const csv = await client.exportTransfersCsv(filters);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('currency=CNY&query=CORR-42');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/transfers/export?status=FAILED&currency=CNY&query=CORR-42');
    expect(csv.type).toBe('text/csv');
  });

  it('surfaces RFC 9457 problem details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ type: 'about:blank', title: 'Conflict', status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' }, 409)));
    const client = new CustomerApiClient({ baseUrl: '/api/customer/v1', getAccessToken: () => null });
    await expect(client.getTransfer('missing')).rejects.toMatchObject<Partial<BankApiError>>({ status: 409 });
  });
});
