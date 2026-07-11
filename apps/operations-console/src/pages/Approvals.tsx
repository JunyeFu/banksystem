import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from './zodResolver';
import { z } from 'zod';
import {
  Badge,
  Button,
  Descriptions,
  Form as AntForm,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type {
  ApprovalRecord,
  ApprovalStatus,
  AuditRecord,
  RiskLevel,
  StateSnapshot,
} from '@/types/models';

const { Text, Paragraph } = Typography;

const approvalSchema = z.object({
  reason: z
    .string()
    .min(1, '审批必须提供理由')
    .max(240, '理由不超过 240 字'),
});

type ApprovalFormData = z.infer<typeof approvalSchema>;

const statusBadgeMap: Record<ApprovalStatus, 'processing' | 'success' | 'error' | 'default'> = {
  PENDING: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  EXPIRED: 'default',
};

const riskColorMap: Record<RiskLevel, string> = {
  LOW: 'green',
  MEDIUM: 'gold',
  HIGH: 'orange',
  CRITICAL: 'red',
};

function useApprovals() {
  return useQuery<ApprovalRecord[], ApiError>({
    queryKey: ['approvals'],
    queryFn: () => apiClient.get<ApprovalRecord[]>('/approvals'),
  });
}

function formatStateSnapshot(snapshot: StateSnapshot): string {
  return Object.entries(snapshot)
    .map(([key, value]) => `${key}: ${value ?? 'null'}`)
    .join('\n');
}

function AuditTrailSection({ audit }: { audit: AuditRecord }): JSX.Element {
  return (
    <Descriptions
      column={1}
      bordered
      size="small"
      data-testid="approval-audit-trail"
    >
      <Descriptions.Item label="审计操作者" data-testid="approval-audit-actor">
        {audit.actor}
      </Descriptions.Item>
      <Descriptions.Item label="审计动作" data-testid="approval-audit-action">
        {audit.action}
      </Descriptions.Item>
      <Descriptions.Item label="审计资源" data-testid="approval-audit-resource">
        {audit.resourceType} / {audit.resourceId}
      </Descriptions.Item>
      <Descriptions.Item label="请求ID" data-testid="approval-audit-request-id">
        <Text code>{audit.requestId}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="关联ID" data-testid="approval-audit-correlation-id">
        <Text code>{audit.correlationId}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="时间戳" data-testid="approval-audit-timestamp">
        {audit.timestamp}
      </Descriptions.Item>
    </Descriptions>
  );
}

function ApprovalDetailModal({
  record,
  open,
  onClose,
  onApprove,
  onReject,
  submitting,
}: {
  record: ApprovalRecord | null;
  open: boolean;
  onClose: () => void;
  onApprove: (reason: string) => void;
  onReject: (reason: string) => void;
  submitting: boolean;
}): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApprovalFormData>({
    resolver: zodResolver(approvalSchema),
    defaultValues: { reason: '' },
  });

  if (!record) {
    return <></>;
  }

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleApprove = (data: ApprovalFormData) => {
    onApprove(data.reason);
  };

  const handleReject = (data: ApprovalFormData) => {
    onReject(data.reason);
  };

  return (
    <Modal
      title={`审批详情 - ${record.transferId}`}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={800}
      data-testid="approval-detail-modal"
    >
      <Descriptions
        column={2}
        bordered
        size="small"
        style={{ marginBottom: 16 }}
        data-testid="approval-detail-descriptions"
      >
        <Descriptions.Item
          label="创建人 (Creator)"
          data-testid="approval-creator"
        >
          {record.creator}
        </Descriptions.Item>
        <Descriptions.Item
          label="当前状态 (Status)"
          data-testid="approval-status"
        >
          <Badge status={statusBadgeMap[record.status]} text={record.status} />
        </Descriptions.Item>
        <Descriptions.Item
          label="业务影响 (Impact)"
          data-testid="approval-impact"
          span={2}
        >
          {record.businessImpact}
        </Descriptions.Item>
        <Descriptions.Item
          label="风险 (Risk)"
          data-testid="approval-risk"
        >
          <Tag color={riskColorMap[record.risk]}>{record.risk}</Tag>
        </Descriptions.Item>
        <Descriptions.Item
          label="版本 (Version)"
          data-testid="approval-version"
        >
          {record.version}
        </Descriptions.Item>
      </Descriptions>

      <div style={{ marginBottom: 16 }}>
        <h4>变更前后 (Before / After)</h4>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div data-testid="approval-before">
            <Text strong>Before:</Text>
            <Paragraph
              style={{
                whiteSpace: 'pre-wrap',
                background: '#f5f5f5',
                padding: 8,
                borderRadius: 4,
                fontFamily: 'monospace',
              }}
            >
              {formatStateSnapshot(record.before)}
            </Paragraph>
          </div>
          <div data-testid="approval-after">
            <Text strong>After:</Text>
            <Paragraph
              style={{
                whiteSpace: 'pre-wrap',
                background: '#f5f5f5',
                padding: 8,
                borderRadius: 4,
                fontFamily: 'monospace',
              }}
            >
              {formatStateSnapshot(record.after)}
            </Paragraph>
          </div>
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4>审计 (Audit)</h4>
        <AuditTrailSection audit={record.audit} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <h4>复核原因 (Review Reason)</h4>
        <Paragraph
          data-testid="approval-review-reason"
          style={{ background: '#fffbe6', padding: 8, borderRadius: 4 }}
        >
          {record.reviewReason}
        </Paragraph>
      </div>

      {record.status === 'PENDING' && (
        <AntForm layout="vertical" data-testid="approval-form">
          <AntForm.Item
            label="审批理由 (必须填写)"
            validateStatus={errors.reason ? 'error' : ''}
            help={errors.reason?.message}
          >
            <Input.TextArea
              rows={3}
              maxLength={240}
              showCount
              placeholder="请输入审批理由"
              data-testid="approval-reason-input"
              aria-label="审批理由"
              {...register('reason')}
            />
          </AntForm.Item>
          <Space>
            <Button
              type="primary"
              loading={submitting}
              onClick={handleSubmit(handleApprove)}
              data-testid="approval-approve-btn"
              aria-label="批准"
            >
              批准 (Approve)
            </Button>
            <Button
              danger
              loading={submitting}
              onClick={handleSubmit(handleReject)}
              data-testid="approval-reject-btn"
              aria-label="拒绝"
            >
              拒绝 (Reject)
            </Button>
            <Button onClick={handleClose} data-testid="approval-cancel-btn">
              取消
            </Button>
          </Space>
        </AntForm>
      )}
    </Modal>
  );
}

export function Approvals(): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useApprovals();
  const [selectedRecord, setSelectedRecord] = useState<ApprovalRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const mutation = useMutation<void, ApiError, { action: 'approve' | 'reject'; reason: string }>({
    mutationFn: async ({ action, reason }) => {
      if (!selectedRecord) return;
      if (action === 'approve') {
        await apiClient.post(
          `/transfers/reversals/${selectedRecord.reversalId}/approve?version=${selectedRecord.version}`,
          { reason },
          { idempotencyKey: crypto.randomUUID() },
        );
      } else {
        await apiClient.post(
          `/transfers/reversals/${selectedRecord.reversalId}/reject?version=${selectedRecord.version}`,
          { reason },
          { idempotencyKey: crypto.randomUUID() },
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setModalOpen(false);
      setSelectedRecord(null);
    },
  });

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  const columns: ColumnsType<ApprovalRecord> = [
    {
      title: '转账ID',
      dataIndex: 'transferId',
      key: 'transferId',
      width: 200,
      render: (value: string) => (
        <Text code copyable data-testid={`approval-row-${value}-transfer`}>
          {value}
        </Text>
      ),
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
      width: 140,
      render: (value: string) => (
        <span data-testid="approval-row-creator">{value}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: ApprovalStatus) => (
        <Badge status={statusBadgeMap[value]} text={value} />
      ),
    },
    {
      title: '风险',
      dataIndex: 'risk',
      key: 'risk',
      width: 100,
      render: (value: RiskLevel) => (
        <Tag color={riskColorMap[value]} data-testid="approval-row-risk">
          {value}
        </Tag>
      ),
    },
    {
      title: '业务影响',
      dataIndex: 'businessImpact',
      key: 'businessImpact',
      ellipsis: true,
      width: 240,
    },
    {
      title: '复核原因',
      dataIndex: 'reviewReason',
      key: 'reviewReason',
      ellipsis: true,
      width: 240,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: ApprovalRecord) => (
        <Button
          type="link"
          onClick={() => {
            setSelectedRecord(record);
            setModalOpen(true);
          }}
          data-testid={`approval-view-btn-${record.approvalId}`}
          aria-label={`查看审批 ${record.transferId}`}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <PageContainer pageId="ops.approvals" state={pageState} title="审批队列">
      <Table<ApprovalRecord>
        columns={columns}
        dataSource={data ?? []}
        rowKey="approvalId"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        data-testid="approvals-table"
        scroll={{ x: 1040 }}
      />

      <ApprovalDetailModal
        record={selectedRecord}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedRecord(null);
        }}
        onApprove={(reason) => {
          void mutation.mutate({ action: 'approve', reason });
        }}
        onReject={(reason) => {
          void mutation.mutate({ action: 'reject', reason });
        }}
        submitting={mutation.isPending}
      />

      {mutation.isError && (
        <div
          data-testid="approval-mutation-error"
          role="alert"
          style={{ marginTop: 16, color: '#cf1322' }}
        >
          操作失败: {mutation.error?.message}
        </div>
      )}
    </PageContainer>
  );
}
