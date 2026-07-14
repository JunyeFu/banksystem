export type TransferStatus =
  | 'CREATED' | 'VALIDATING' | 'RISK_REVIEW'
  | 'PENDING_APPROVAL' | 'PENDING_CORE_POSTING' | 'PENDING_CLEARING' | 'SETTLED'
  | 'FAILED' | 'TIMED_OUT' | 'RETURNED'
  | 'REVERSAL_PENDING' | 'REVERSED';

/** 12 态中文化映射(Q2 决策:前端展示中文化) */
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  CREATED:           '已创建',
  VALIDATING:        '校验中',
  RISK_REVIEW:       '风控审核中',
  PENDING_APPROVAL:  '待批准',
  PENDING_CORE_POSTING: '待核心记账',
  PENDING_CLEARING:  '待清算',
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
