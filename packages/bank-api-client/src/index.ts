export interface Money {
  currency: string;
  value: string;
}

export interface Transfer {
  transferId: string;
  status: TransferStatus;
  amount: string;
  currency: string;
  coreReference?: string | null;
  correlationId?: string | null;
}

export type TransferStatus =
  | 'CREATED' | 'VALIDATING' | 'RISK_REVIEW'
  | 'PENDING_APPROVAL' | 'PENDING_CORE_POSTING' | 'PENDING_CLEARING' | 'SETTLED'
  | 'FAILED' | 'TIMED_OUT' | 'RETURNED'
  | 'REVERSAL_PENDING' | 'REVERSED';

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  requestId?: string;
  correlationId?: string;
  fieldErrors?: Array<{ field: string; message: string }>;
}

export interface AccountSummary {
  accountId: string;
  maskedAccountNumber: string;
  currency: string;
  balance: Money;
}

export interface CustomerProfile {
  customerId: string;
  displayName: string;
}
