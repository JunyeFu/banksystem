export type TransferStatus =
  | 'CREATED' | 'VALIDATING' | 'RISK_REVIEW' | 'PENDING_APPROVAL'
  | 'PENDING_CORE_POSTING' | 'PENDING_CLEARING' | 'SETTLED'
  | 'FAILED' | 'TIMED_OUT' | 'RETURNED'
  | 'REVERSAL_PENDING' | 'REVERSED';

export type LoanStatus =
  | 'DRAFT' | 'SUBMITTED' | 'SCORED' | 'APPROVED'
  | 'DISBURSED' | 'CLOSED' | 'REJECTED';

export type RiskDecision = 'ALLOW' | 'REVIEW' | 'BLOCK';

export type ClearingScenario =
  | 'SUCCESS_IMMEDIATE' | 'SUCCESS_DELAYED'
  | 'REJECT_ACCOUNT_INVALID' | 'REJECT_BANK_UNAVAILABLE'
  | 'TIMEOUT_THEN_SUCCESS' | 'TIMEOUT_THEN_FAIL'
  | 'RETURN_AFTER_SETTLEMENT'
  | 'DUPLICATE_CALLBACK' | 'OUT_OF_ORDER_CALLBACK';

export interface Money {
  currency: string;
  value: string;
}

export interface TransferStateHistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  reasonCode?: string | null;
  actorType: string;
  actorId: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorType: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  action: string;
  outcome: string;
  requestId?: string;
  correlationId?: string;
  previousHash?: string | null;
  recordHash: string;
  createdAt: string;
}
