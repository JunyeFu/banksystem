export type TransferStatus =
  | 'CREATED' | 'RISK_PENDING' | 'REVIEW_REQUIRED'
  | 'APPROVED' | 'RESERVED' | 'SUBMITTED' | 'SETTLED'
  | 'FAILED' | 'TIMED_OUT' | 'RETURNED'
  | 'REVERSAL_PENDING' | 'REVERSED';

/** 12 态中文化映射(Q2 决策:前端展示中文化) */
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  CREATED:           '已创建',
  RISK_PENDING:      '风控审核中',
  REVIEW_REQUIRED:   '待人工复核',
  APPROVED:          '已批准',
  RESERVED:          '已预留',
  SUBMITTED:         '已提交',
  SETTLED:           '已结算',
  FAILED:            '失败',
  TIMED_OUT:         '已超时',
  RETURNED:          '已退回',
  REVERSAL_PENDING:  '冲正待审批',
  REVERSED:          '已冲正',
};

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
