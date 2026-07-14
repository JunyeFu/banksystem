export type TransferStatus =
  | 'CREATED'
  | 'VALIDATING'
  | 'RISK_REVIEW'
  | 'PENDING_APPROVAL'
  | 'PENDING_CORE_POSTING'
  | 'PENDING_CLEARING'
  | 'SETTLED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'RETURNED'
  | 'REVERSAL_PENDING'
  | 'REVERSED';

export interface Transfer {
  transferId: string;
  status: TransferStatus;
  amount: string;
  currency: string;
  coreReference: string | null;
  correlationId: string | null;
}

export interface TransferRequest {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  reference?: string;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type StateValue = string | number | boolean | null;

export type StateSnapshot = Record<string, StateValue>;

export interface AuditRecord {
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId: string;
  correlationId: string;
  timestamp: string;
  before: StateSnapshot | null;
  after: StateSnapshot | null;
}

export interface ApprovalRecord {
  approvalId: string;
  reversalId: string;
  transferId: string;
  creator: string;
  status: ApprovalStatus;
  businessImpact: string;
  risk: RiskLevel;
  before: StateSnapshot;
  after: StateSnapshot;
  audit: AuditRecord;
  reviewReason: string;
  version: number;
  createdAt: string;
}

export interface DashboardSummary {
  pendingApprovals: number;
  clearingStatus: string;
  reconciliationStatus: string;
  activePayments: number;
  failedPayments: number;
  systemHealth: string;
}

export interface TransferStateHistoryEntry {
  id: string;
  fromStatus: TransferStatus | null;
  toStatus: TransferStatus;
  reasonCode: string | null;
  actorType: string;
  actorId: string;
  createdAt: string;
}

export interface OutboxEvent {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface TransferDetail extends Transfer {
  stateHistory: TransferStateHistoryEntry[];
  outboxEvents: OutboxEvent[];
  auditCount: number;
}

export type ReconciliationBatchType =
  | 'CHANNEL_TO_CORE'
  | 'CHANNEL_TO_CLEARING'
  | 'CORE_TO_GENERAL_LEDGER';

export type ReconciliationStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'MATCHED'
  | 'DIFFERENCE_FOUND'
  | 'FAILED';

export interface ReconciliationBatch {
  id: string;
  batchType: ReconciliationBatchType;
  businessDate: string;
  status: ReconciliationStatus;
  sourceCount: number;
  sourceAmount: string;
  targetCount: number;
  targetAmount: string;
  differenceCount: number;
  differenceAmount: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type EodRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface EodRunResult {
  runId: string;
  businessDate: string;
  status: EodRunStatus;
  stepsCompleted: string[];
  reconciliationStatus: ReconciliationStatus | null;
  startedAt: string;
  completedAt: string | null;
}

export type RiskDecisionValue = 'ALLOW' | 'REVIEW' | 'BLOCK';

export type RiskCaseStatus = 'OPEN' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface RiskDecision {
  id: string;
  transferId: string | null;
  customerSubject: string;
  decision: RiskDecisionValue;
  status: RiskCaseStatus;
  score: number;
  triggeredRules: string[];
  maker: string;
  checker: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export type RiskAlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface RiskAlert {
  alertId: string;
  severity: RiskLevel;
  status: RiskAlertStatus;
  ruleName: string;
  entityType: string;
  entityId: string;
  description: string;
  score: number;
  triggeredAt: string;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
}

export type ClearingBatchStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ClearingBatch {
  batchId: string;
  businessDate: string;
  status: ClearingBatchStatus;
  totalItems: number;
  totalAmount: string;
  currency: string;
  settledItems: number;
  failedItems: number;
  startedAt: string | null;
  completedAt: string | null;
}

export type DocumentCategory =
  | 'POLICY'
  | 'PROCEDURE'
  | 'REPORT'
  | 'COMPLIANCE'
  | 'OTHER';

export type DocumentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface OpsDocument {
  documentId: string;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
  fileSize: number;
  checksum: string;
  description: string | null;
}

export type AuditEventType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'EXECUTE'
  | 'SYSTEM';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: AuditEventType;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: AuditOutcome;
  recordHash: string;
  previousHash: string | null;
  correlationId: string | null;
}

export interface HashChainVerification {
  verified: boolean;
  totalEvents: number;
  brokenAtEventId: string | null;
  lastVerifiedHash: string | null;
}

export type AlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type AlertStatus = 'FIRING' | 'RESOLVED';

export interface MonitoringAlert {
  code: string;
  alertId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  serviceName: string;
  message: string;
  triggeredAt: string;
  resolvedAt: string | null;
  labels: Record<string, string>;
}
