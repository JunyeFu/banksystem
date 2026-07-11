import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type {
  AuditEvent,
  AuditEventType,
  AuditOutcome,
  HashChainVerification,
} from '@/types/models';

const { Text } = Typography;

const eventTypeColorMap: Record<AuditEventType, string> = {
  CREATE: 'blue',
  UPDATE: 'cyan',
  DELETE: 'red',
  APPROVE: 'green',
  REJECT: 'orange',
  EXECUTE: 'purple',
  SYSTEM: 'default',
};

const outcomeColorMap: Record<AuditOutcome, string> = {
  SUCCESS: 'success',
  FAILURE: 'error',
  DENIED: 'warning',
};

function truncateHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

function useAuditEvents() {
  return useQuery<AuditEvent[], ApiError>({
    queryKey: ['audit-events'],
    queryFn: () => apiClient.get<AuditEvent[]>('/audit/events'),
  });
}

function useHashChainVerification() {
  return useQuery<HashChainVerification, ApiError>({
    queryKey: ['audit-hash-chain-verification'],
    queryFn: () => apiClient.get<HashChainVerification>('/audit/verify'),
  });
}

const columns: ColumnsType<AuditEvent> = [
  {
    title: '时间戳',
    dataIndex: 'timestamp',
    key: 'timestamp',
    width: 200,
    render: (value: string) => (
      <Text data-testid="audit-row-timestamp">{value}</Text>
    ),
  },
  {
    title: '事件类型',
    dataIndex: 'eventType',
    key: 'eventType',
    width: 120,
    render: (value: AuditEventType) => (
      <Tag color={eventTypeColorMap[value]} data-testid="audit-row-event-type">
        {value}
      </Tag>
    ),
  },
  {
    title: '操作人',
    dataIndex: 'actorId',
    key: 'actorId',
    width: 160,
    render: (value: string) => (
      <span data-testid="audit-row-actor-id">{value}</span>
    ),
  },
  {
    title: '操作',
    dataIndex: 'action',
    key: 'action',
    width: 200,
    render: (value: string) => (
      <span data-testid="audit-row-action">{value}</span>
    ),
  },
  {
    title: '资源类型',
    dataIndex: 'resourceType',
    key: 'resourceType',
    width: 140,
  },
  {
    title: '资源ID',
    dataIndex: 'resourceId',
    key: 'resourceId',
    width: 200,
    render: (value: string) => (
      <Text code data-testid="audit-row-resource-id">{value}</Text>
    ),
  },
  {
    title: '结果',
    dataIndex: 'outcome',
    key: 'outcome',
    width: 100,
    render: (value: AuditOutcome) => (
      <Tag color={outcomeColorMap[value]} data-testid="audit-row-outcome">
        {value}
      </Tag>
    ),
  },
  {
    title: '记录哈希',
    dataIndex: 'recordHash',
    key: 'recordHash',
    width: 200,
    render: (value: string) => (
      <Tooltip title={value} data-testid="audit-row-hash-tooltip">
        <Text code copyable={{ text: value }} data-testid="audit-row-record-hash">
          {truncateHash(value)}
        </Text>
      </Tooltip>
    ),
  },
  {
    title: '前序哈希',
    dataIndex: 'previousHash',
    key: 'previousHash',
    width: 180,
    render: (value: string | null) =>
      value ? (
        <Tooltip title={value}>
          <Text code type="secondary" data-testid="audit-row-previous-hash">
            {truncateHash(value)}
          </Text>
        </Tooltip>
      ) : (
        <Text type="secondary">GENESIS</Text>
      ),
  },
  {
    title: '关联ID',
    dataIndex: 'correlationId',
    key: 'correlationId',
    width: 200,
    render: (value: string | null) =>
      value ? (
        <Text code data-testid="audit-row-correlation-id">{value}</Text>
      ) : (
        <Text type="secondary">-</Text>
      ),
  },
];

export function AuditViewer(): JSX.Element {
  const { data, isLoading, isError } = useAuditEvents();
  const { data: verification } = useHashChainVerification();

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  const chainVerified = verification?.verified ?? false;
  const brokenAt = verification?.brokenAtEventId ?? null;

  return (
    <PageContainer pageId="ops.audit" state={pageState} title="审计追踪">
      <Card style={{ marginBottom: 16 }} data-testid="audit-hash-chain-card">
        <Alert
          type={chainVerified ? 'success' : 'error'}
          showIcon
          message={
            chainVerified
              ? '哈希链验证通过'
              : '哈希链验证失败 — 链条完整性被破坏'
          }
          description={
            <Space direction="vertical">
              <span data-testid="audit-chain-verified">
                验证状态: {chainVerified ? '通过' : '失败'}
              </span>
              <span data-testid="audit-chain-total-events">
                事件总数: {verification?.totalEvents ?? 0}
              </span>
              {verification?.lastVerifiedHash && (
                <span data-testid="audit-chain-last-hash">
                  最后验证哈希:{' '}
                  <Text code>{truncateHash(verification.lastVerifiedHash)}</Text>
                </span>
              )}
              {brokenAt && (
                <span
                  style={{ color: '#cf1322' }}
                  data-testid="audit-chain-broken-at"
                >
                  断裂事件ID: <Text code>{brokenAt}</Text>
                </span>
              )}
            </Space>
          }
          data-testid="audit-chain-alert"
        />
      </Card>

      <Table<AuditEvent>
        columns={columns}
        dataSource={data ?? []}
        rowKey="eventId"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        data-testid="audit-viewer"
        scroll={{ x: 1700 }}
        rowClassName={(record: AuditEvent) =>
          brokenAt === record.eventId
            ? 'audit-row-broken'
            : ''
        }
      />
    </PageContainer>
  );
}
