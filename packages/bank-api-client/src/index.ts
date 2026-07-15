import type { components as CustomerComponents, operations as CustomerOperations } from './generated/customer';
import type { components as OperationsComponents } from './generated/operations';

export type TransferStatus = CustomerComponents['schemas']['TransferStatus'];
export type AccountSummary = CustomerComponents['schemas']['AccountSummary'] & { accountType?: string };
export type Beneficiary = CustomerComponents['schemas']['Beneficiary'];
export type Transfer = CustomerComponents['schemas']['Transfer'];
export type TransferPage = CustomerComponents['schemas']['TransferPage'];
export type OperationsTransferPage = OperationsComponents['schemas']['TransferPage'];
export type OperationsTransfer = OperationsComponents['schemas']['Transfer'];
export type TransferSummary = OperationsComponents['schemas']['TransferSummary'];
export type TransferStateHistoryEntry = OperationsComponents['schemas']['TransferStateHistoryEntry'];
export type OutboxEvent = OperationsComponents['schemas']['OutboxEvent'];
export type TransferDetail = OperationsComponents['schemas']['TransferDetail'];
export type CustomerTransferRequest = NonNullable<CustomerOperations['createCustomerTransfer']['requestBody']>['content']['application/json'];
export type TransferAccepted = CustomerComponents['schemas']['TransferAccepted'];
export type ProblemDetail = CustomerComponents['schemas']['Problem'] & {
  requestId?: string;
  correlationId?: string;
  fieldErrors?: Array<{ field: string; message: string }>;
};

export class BankApiError extends Error {
  constructor(public readonly status: number, public readonly problem: ProblemDetail) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
    this.name = 'BankApiError';
  }
}

export interface ClientConfiguration {
  baseUrl: string;
  getAccessToken: () => string | null;
}

class BaseClient {
  constructor(private readonly configuration: ClientConfiguration) {}

  protected async request<T>(path: string, init: RequestInit = {}, responseType: 'json' | 'blob' = 'json'): Promise<T> {
    const headers = new Headers(init.headers);
    const token = this.configuration.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${this.configuration.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      let problem: ProblemDetail = { type: 'about:blank', title: response.statusText, status: response.status, code: 'HTTP_ERROR' };
      try { problem = await response.json() as ProblemDetail; } catch { /* keep transport problem */ }
      throw new BankApiError(response.status, problem);
    }
    if (response.status === 204) return undefined as T;
    if (responseType === 'blob') return await response.blob() as T;
    return response.json() as Promise<T>;
  }
}

export class CustomerApiClient extends BaseClient {
  listAccounts(): Promise<{ items: AccountSummary[] }> {
    return this.request('/accounts');
  }
  listBeneficiaries(): Promise<{ items: Beneficiary[] }> {
    return this.request('/beneficiaries');
  }
  listTransfers(options: { status?: TransferStatus; from?: string; to?: string; page?: number; size?: number } = {}): Promise<TransferPage> {
    return this.request(`/transfers${queryString(options)}`);
  }
  getTransfer(transferId: string): Promise<Transfer> {
    return this.request(`/transfers/${encodeURIComponent(transferId)}`);
  }
  getTransferReceiptPdf(transferId: string): Promise<Blob> {
    return this.request(`/transfers/${encodeURIComponent(transferId)}/receipt?format=pdf`, {}, 'blob');
  }
  createTransfer(request: CustomerTransferRequest, idempotencyKey: string): Promise<TransferAccepted> {
    return this.request('/transfers', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(request),
    });
  }
}

export class OperationsApiClient extends BaseClient {
  listTransfers(options: { status?: TransferStatus; currency?: string; query?: string; from?: string; to?: string; page?: number; size?: number } = {}): Promise<OperationsTransferPage> {
    return this.request(`/transfers${queryString(options)}`);
  }
  exportTransfersCsv(options: { status?: TransferStatus; currency?: string; query?: string; from?: string; to?: string } = {}): Promise<Blob> {
    return this.request(`/transfers/export${queryString(options)}`, {}, 'blob');
  }
  getTransfer(transferId: string): Promise<TransferDetail> {
    return this.request(`/transfers/${encodeURIComponent(transferId)}`);
  }
}

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}
