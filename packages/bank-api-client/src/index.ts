import type { components as CustomerComponents, operations as CustomerOperations } from './generated/customer';
import type { components as OperationsComponents, operations as OperationsOperations } from './generated/operations';

export type TransferStatus = CustomerComponents['schemas']['TransferStatus'];
export type Customer = CustomerComponents['schemas']['Customer'];
export type AccountSummary = CustomerComponents['schemas']['AccountSummary'];
export type AccountDetail = CustomerComponents['schemas']['AccountDetail'];
export type AccountTransaction = CustomerComponents['schemas']['AccountTransaction'];
export type Beneficiary = CustomerComponents['schemas']['Beneficiary'];
export type LoanSummary = CustomerComponents['schemas']['LoanSummary'];
export type LoanDetail = CustomerComponents['schemas']['LoanDetail'];
export type RepaymentInstallment = CustomerComponents['schemas']['RepaymentInstallment'];
export type Message = CustomerComponents['schemas']['Message'];
export type CustomerProfile = CustomerComponents['schemas']['CustomerProfile'];
export type SecuritySettings = CustomerComponents['schemas']['SecuritySettings'];
export type CustomerDocument = CustomerComponents['schemas']['CustomerDocument'];
export type LoanApplication = CustomerComponents['schemas']['LoanApplication'];
export type LoanApplicationDetail = CustomerComponents['schemas']['LoanApplicationDetail'];
export type LoanDocument = CustomerComponents['schemas']['LoanDocument'];
export type LoanApplicationRequest = CustomerComponents['schemas']['LoanApplicationRequest'];
export type Transfer = CustomerComponents['schemas']['Transfer'];
export type TransferPage = CustomerComponents['schemas']['TransferPage'];
export type OperationsTransferPage = OperationsComponents['schemas']['TransferPage'];
export type OperationsTransfer = OperationsComponents['schemas']['Transfer'];
export type TransferSummary = OperationsComponents['schemas']['TransferSummary'];
export type TransferStateHistoryEntry = OperationsComponents['schemas']['TransferStateHistoryEntry'];
export type OutboxEvent = OperationsComponents['schemas']['OutboxEvent'];
export type TransferDetail = OperationsComponents['schemas']['TransferDetail'];
export type OperationsDashboard = OperationsComponents['schemas']['OperationsDashboard'];
export type OperationsRiskAlert = OperationsComponents['schemas']['RiskAlert'];
export type OperationsRiskCase = OperationsComponents['schemas']['RiskCase'];
export type OperationsRiskAlertStatus = OperationsComponents['schemas']['RiskAlertStatus'];
export type OperationsRiskCaseStatus = OperationsComponents['schemas']['RiskCaseStatus'];
export type OperationsApproval = OperationsComponents['schemas']['ApprovalRecord'];
export type OperationsApprovalStatus = OperationsComponents['schemas']['ApprovalStatus'];
export type OperationsApprovalActionResult = OperationsComponents['schemas']['ApprovalActionResult'];
export type OperationsLoanApplication = OperationsComponents['schemas']['OperationsLoanApplication'];
export type OperationsLoanApplicationDetail = OperationsComponents['schemas']['OperationsLoanApplicationDetail'];
export type OperationsLoanApproval = OperationsComponents['schemas']['LoanApproval'];
export type OperationsCoreLoanReference = OperationsComponents['schemas']['CoreLoanReference'];
export type OperationsClearingBatch = OperationsComponents['schemas']['ClearingBatch'];
export type OperationsClearingBatchStatus = OperationsComponents['schemas']['ClearingBatchStatus'];
export type OperationsReconciliationRun = OperationsComponents['schemas']['ReconciliationRun'];
export type OperationsReconciliationType = OperationsComponents['schemas']['ReconciliationType'];
export type OperationsReconciliationStatus = OperationsComponents['schemas']['ReconciliationStatus'];
export type OperationsEodRun = OperationsComponents['schemas']['EodRun'];
export type OperationsEodStatus = OperationsComponents['schemas']['EodStatus'];
export type OperationsDocument = OperationsComponents['schemas']['OperationsDocument'];
export type OperationsDocumentCategory = OperationsComponents['schemas']['DocumentCategory'];
export type OperationsDocumentStatus = OperationsComponents['schemas']['DocumentStatus'];
export type OperationsDocumentStatusRequest = NonNullable<OperationsOperations['updateOperationsDocumentStatus']['requestBody']>['content']['application/json'];
export type OperationsAuditEvent = OperationsComponents['schemas']['AuditEvent'];
export type OperationsAuditOutcome = OperationsComponents['schemas']['AuditOutcome'];
export type OperationsHashChainVerification = OperationsComponents['schemas']['HashChainVerification'];
export type OperationsSystemHealth = OperationsComponents['schemas']['SystemHealthSnapshot'];
export type OperationsMonitoringAlert = OperationsComponents['schemas']['MonitoringAlert'];
export type OperationsExternalServices = OperationsComponents['schemas']['ExternalServiceSnapshot'];
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
    if (init.body !== undefined && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
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
  getCurrentCustomer(): Promise<Customer> {
    return this.request('/customers/me');
  }
  listAccounts(): Promise<{ items: AccountSummary[] }> {
    return this.request('/accounts');
  }
  getAccount(accountId: string): Promise<AccountDetail> {
    return this.request(`/accounts/${encodeURIComponent(accountId)}`);
  }
  downloadStatement(accountId: string, format: 'csv' | 'pdf' = 'csv'): Promise<Blob> {
    return this.request(`/statements${queryString({ accountId, format })}`, {}, 'blob');
  }
  listBeneficiaries(): Promise<{ items: Beneficiary[] }> {
    return this.request('/beneficiaries');
  }
  createBeneficiary(request: CustomerComponents['schemas']['CreateBeneficiaryRequest']): Promise<Beneficiary> {
    return this.request('/beneficiaries', { method: 'POST', body: JSON.stringify(request) });
  }
  listLoans(): Promise<{ items: LoanSummary[] }> {
    return this.request('/loans');
  }
  getLoan(loanId: string): Promise<LoanDetail> {
    return this.request(`/loans/${encodeURIComponent(loanId)}`);
  }
  createLoanApplication(request: LoanApplicationRequest): Promise<LoanApplication> {
    return this.request('/loans/applications', { method: 'POST', body: JSON.stringify(request) });
  }
  listLoanApplications(): Promise<{ items: LoanApplication[] }> {
    return this.request('/loans/applications');
  }
  getLoanApplication(applicationId: string): Promise<LoanApplicationDetail> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}`);
  }
  submitLoanApplication(applicationId: string, version: number): Promise<LoanApplication> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}/submit`, { method: 'POST', body: JSON.stringify({ version }) });
  }
  addLoanDocument(applicationId: string, documentType: string): Promise<LoanDocument> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}/documents`, { method: 'POST', body: JSON.stringify({ documentType }) });
  }
  listLoanDocuments(applicationId: string): Promise<{ items: LoanDocument[] }> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}/documents`);
  }
  listDocuments(): Promise<{ items: CustomerDocument[] }> {
    return this.request('/documents');
  }
  listMessages(): Promise<{ items: Message[] }> {
    return this.request('/notifications');
  }
  markMessageRead(messageId: string): Promise<{ messageId: string; read: boolean }> {
    return this.request(`/notifications/${encodeURIComponent(messageId)}/read`, { method: 'POST' });
  }
  getProfile(): Promise<CustomerProfile> {
    return this.request('/profile');
  }
  getSecuritySettings(): Promise<SecuritySettings> {
    return this.request('/security/settings');
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
  createTransfer(request: CustomerTransferRequest, idempotencyKey: string, correlationId: string): Promise<TransferAccepted> {
    return this.request('/transfers', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey, 'X-Correlation-Id': correlationId }, body: JSON.stringify(request),
    });
  }
  confirmTransfer(transferId: string): Promise<Transfer> {
    return this.request(`/transfers/${encodeURIComponent(transferId)}/confirm`, { method: 'POST' });
  }
}

export class OperationsApiClient extends BaseClient {
  getDashboard(): Promise<OperationsDashboard> {
    return this.request('/dashboard');
  }
  listRiskAlerts(status?: OperationsRiskAlertStatus): Promise<OperationsRiskAlert[]> {
    return this.request(`/risk/alerts${queryString({ status })}`);
  }
  listRiskCases(status?: OperationsRiskCaseStatus): Promise<OperationsRiskCase[]> {
    return this.request(`/risk/cases${queryString({ status })}`);
  }
  listApprovals(status?: OperationsApprovalStatus): Promise<OperationsApproval[]> {
    return this.request(`/approvals${queryString({ status })}`);
  }
  listLoanApplications(): Promise<{ items: OperationsLoanApplication[] }> {
    return this.request('/loans/applications');
  }
  getLoanApplication(applicationId: string): Promise<OperationsLoanApplicationDetail> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}`);
  }
  scoreLoanApplication(applicationId: string, version: number): Promise<OperationsLoanApplication> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}/score`, { method: 'POST', body: JSON.stringify({ version }) });
  }
  requestLoanApproval(applicationId: string, version: number, reason: string): Promise<OperationsLoanApproval> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}/approval`, { method: 'POST', body: JSON.stringify({ version, reason }) });
  }
  approveLoanApplication(approvalId: string, input: { version: number; approvedAmount: string; annualInterestRate: string; reason: string }): Promise<OperationsLoanApplication> {
    return this.request(`/loans/approvals/${encodeURIComponent(approvalId)}/approve`, { method: 'POST', body: JSON.stringify(input) });
  }
  submitLoanApplicationToCore(applicationId: string, idempotencyKey: string): Promise<OperationsCoreLoanReference> {
    return this.request(`/loans/applications/${encodeURIComponent(applicationId)}/core-submit`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } });
  }
  approveReversal(reversalId: string, version: number, reason: string, idempotencyKey: string): Promise<OperationsApprovalActionResult> {
    return this.request(`/transfers/reversals/${encodeURIComponent(reversalId)}/approve${queryString({ version })}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ reason }) });
  }
  rejectReversal(reversalId: string, version: number, reason: string, idempotencyKey: string): Promise<OperationsApprovalActionResult> {
    return this.request(`/transfers/reversals/${encodeURIComponent(reversalId)}/reject${queryString({ version })}`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ reason }) });
  }
  listClearingBatches(): Promise<OperationsClearingBatch[]> {
    return this.request('/clearing/batches');
  }
  listReconciliations(): Promise<OperationsReconciliationRun[]> {
    return this.request('/reconciliations');
  }
  runReconciliation(type: OperationsReconciliationType): Promise<OperationsReconciliationRun> {
    return this.request('/reconciliations', { method: 'POST', body: JSON.stringify({ type }) });
  }
  getLatestEodRun(): Promise<OperationsEodRun> {
    return this.request('/eod/latest');
  }
  runEod(idempotencyKey: string): Promise<OperationsEodRun> {
    return this.request('/eod/run', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } });
  }
  listDocuments(options: { category?: OperationsDocumentCategory; status?: OperationsDocumentStatus; query?: string } = {}): Promise<OperationsDocument[]> {
    return this.request(`/documents${queryString(options)}`);
  }
  uploadDocument(input: { file: File; title: string; category: OperationsDocumentCategory; description?: string }): Promise<OperationsDocument> {
    const form = new FormData(); form.set('file', input.file); form.set('title', input.title); form.set('category', input.category); if (input.description) form.set('description', input.description);
    return this.request('/documents', { method: 'POST', body: form });
  }
  updateDocumentStatus(documentId: string, input: OperationsDocumentStatusRequest): Promise<OperationsDocument> {
    return this.request(`/documents/${encodeURIComponent(documentId)}/status`, { method: 'PATCH', body: JSON.stringify(input) });
  }
  downloadDocument(documentId: string): Promise<Blob> {
    return this.request(`/documents/${encodeURIComponent(documentId)}/download`, {}, 'blob');
  }
  listAuditEvents(options: { eventType?: string; actorId?: string; outcome?: OperationsAuditOutcome; correlationId?: string } = {}): Promise<OperationsAuditEvent[]> {
    return this.request(`/audit/events${queryString(options)}`);
  }
  verifyAuditHashChain(): Promise<OperationsHashChainVerification> {
    return this.request('/audit/verify');
  }
  getSystemHealth(): Promise<OperationsSystemHealth> {
    return this.request('/system-health');
  }
  getExternalServices(): Promise<OperationsExternalServices> {
    return this.request('/external-services');
  }
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
