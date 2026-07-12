import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  Descriptions,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type {
  OutboxEvent,
  TransferDetail,
  TransferStateHistoryEntry,
  TransferStatus,
} from '@/types/models';

const { Text } = Typography;

const statusColorMap: Record<TransferStatus, string> = {
  CREATED: 'default',
  RISK_PENDING: 'processing',
  REVIEW_REQUIRED: 'warning',
  APPROVED: 'processing',
  RESERVED: 'processing',
  SUBMITTED: 'processing',
  SETTLED: 'success',
  FAILED: 'error',
  TIMED_OUT: 'error',
  RETURNED: 'error',
  REVERSAL_PENDING: 'warning',
  REVERSED: 'error',
};

function useTransferDetail(paymentId: string) {
  return useQuery<TransferDetail, ApiError>({
    queryKey: ['transfer-detail', paymentId],
    queryFn: () => apiClient.get<TransferDetail>(`/transfers/${paymentId}`),
  });
}

function StatusTimeline({
  history,
}: {
  history: TransferStateHistoryEntry[];
}): JSX.Element {
  const items = history.map((entry) => ({
    color:
      entry.toStatus === 'SETTLED'
        ? 'green'
        : entry.toStatus === 'FAILED' ||
            entry.toStatus === 'TIMED_OUT' ||
            entry.toStatus === 'REVERSED'
          ? 'red'
          : 'blue',
    children: (
      <div data-testid={`state-history-item-${entry.id}`}>
        <Space direction="vertical" size={0}>
          <Space>
            <Tag color={statusColorMap[entry.toStatus]}>{entry.toStatus}</Tag>
            {entry.fromStatus && (
              <Text type="secondary">from {entry.fromStatus}</Text>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {entry.actorType}: {entry.actorId} &middot; {entry.createdAt}
          </Text>
          {entry.reasonCode && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              reason: {entry.reasonCode}
            </Text>
          )}
        </Space>
      </div>
    ),
  }));

  return (
    <Timeline
      items={items}
      data-testid="state-history-timeline"
      mode="left"
    />
  );
}

const outboxColumns: ColumnsType<OutboxEvent> = [
  {
    title: '事件类型',
    dataIndex: 'eventType',
    key: 'eventType',
    width: 240,
    render: (value: string) => (
      <Text code data-testid="outbox-event-type">
        {value}
      </Text>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
    render: (value: string) => (
      <Tag
        color={
          value === 'PUBLISHED' ? 'success' : value === 'FAILED' ? 'error' : 'processing'
        }
        data-testid="outbox-event-status"
      >
        {value}
      </Tag>
    ),
  },
  {
    title: '尝试次数',
    dataIndex: 'attemptCount',
    key: 'attemptCount',
    width: 100,
    align: 'right',
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 200,
  },
  {
    title: '发布时间',
    dataIndex: 'publishedAt',
    key: 'publishedAt',
    width: 200,
    render: (value: string | null) => value ?? <Text type="secondary">-</Text>,
  },
];

export function PaymentDetail(): JSX.Element {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useTransferDetail(paymentId ?? '');

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  return (
    <PageContainer pageId="operations.payments.detail" state={pageState} title="支付详情">
      <Space style={{ marginBottom: 16 }}>
        <Button
          onClick={() => navigate('/payments')}
          data-testid="payment-detail-back-btn"
          aria-label="返回支付列表"
        >
          返回列表
        </Button>
      </Space>

      <Card
        style={{ marginBottom: 16 }}
        data-testid="payment-detail-summary"
      >
        <Descriptions
          column={2}
          bordered
          size="small"
          data-testid="payment-detail-descriptions"
        >
          <Descriptions.Item label="转账ID" data-testid="payment-detail-transfer-id">
            <Text code copyable>{data?.transferId ?? '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="状态" data-testid="payment-detail-status">
            {data ? (
              <Tag color={statusColorMap[data.status]}>{data.status}</Tag>
            ) : (
              <Text type="secondary">-</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="金额" data-testid="payment-detail-amount">
            {data ? `${data.amount} ${data.currency}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="核心参考号" data-testid="payment-detail-core-reference">
            {data?.coreReference ?? <Text type="secondary">-</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="关联ID" data-testid="payment-detail-correlation-id">
            {data?.correlationId ? (
              <Text code copyable>{data.correlationId}</Text>
            ) : (
              <Text type="secondary">-</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="审计记录数" data-testid="payment-detail-audit-count">
            {data?.auditCount ?? 0}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="状态历史时间线"
        style={{ marginBottom: 16 }}
        data-testid="payment-detail-history-card"
      >
        {data && data.stateHistory.length > 0 ? (
          <StatusTimeline history={data.stateHistory} />
        ) : (
          <Text type="secondary">暂无状态历史记录</Text>
        )}
      </Card>

      <Card
        title="Outbox 事件"
        data-testid="payment-detail-outbox-card"
      >
        <Table<OutboxEvent>
          columns={outboxColumns}
          dataSource={data?.outboxEvents ?? []}
          rowKey="id"
          pagination={false}
          size="small"
          data-testid="payment-detail-outbox-table"
          scroll={{ x: 860 }}
        />
      </Card>
    </PageContainer>
  );
}
