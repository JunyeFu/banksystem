import { useQuery } from '@tanstack/react-query';
import { Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type { RiskAlert, RiskAlertStatus, RiskLevel } from '@/types/models';

const { Text } = Typography;

const severityColorMap: Record<RiskLevel, string> = {
  LOW: 'default',
  MEDIUM: 'processing',
  HIGH: 'warning',
  CRITICAL: 'error',
};

const alertStatusColorMap: Record<RiskAlertStatus, string> = {
  ACTIVE: 'error',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'success',
};

function useRiskAlerts() {
  return useQuery<RiskAlert[], ApiError>({
    queryKey: ['risk-alerts'],
    queryFn: () => apiClient.get<RiskAlert[]>('/risk-alerts'),
  });
}

const columns: ColumnsType<RiskAlert> = [
  {
    title: '告警ID',
    dataIndex: 'alertId',
    key: 'alertId',
    width: 200,
    render: (value: string) => (
      <Text code copyable data-testid="risk-alert-row-id">
        {value}
      </Text>
    ),
  },
  {
    title: '严重级别',
    dataIndex: 'severity',
    key: 'severity',
    width: 120,
    render: (value: RiskLevel) => (
      <Tag color={severityColorMap[value]} data-testid="risk-alert-row-severity">
        {value}
      </Tag>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 140,
    render: (value: RiskAlertStatus) => (
      <Tag color={alertStatusColorMap[value]} data-testid="risk-alert-row-status">
        {value}
      </Tag>
    ),
  },
  {
    title: '规则名称',
    dataIndex: 'ruleName',
    key: 'ruleName',
    width: 180,
    render: (value: string) => (
      <span data-testid="risk-alert-row-rule">{value}</span>
    ),
  },
  {
    title: '实体类型',
    dataIndex: 'entityType',
    key: 'entityType',
    width: 140,
  },
  {
    title: '实体ID',
    dataIndex: 'entityId',
    key: 'entityId',
    width: 200,
    render: (value: string) => (
      <Text code data-testid="risk-alert-row-entity-id">{value}</Text>
    ),
  },
  {
    title: '描述',
    dataIndex: 'description',
    key: 'description',
    width: 280,
    render: (value: string) => (
      <span data-testid="risk-alert-row-description">{value}</span>
    ),
  },
  {
    title: '风险评分',
    dataIndex: 'score',
    key: 'score',
    width: 100,
    align: 'right',
    render: (value: number) => (
      <span
        data-testid="risk-alert-row-score"
        style={{ color: value >= 80 ? '#cf1322' : value >= 50 ? '#fa8c16' : undefined }}
      >
        {value}
      </span>
    ),
  },
  {
    title: '触发时间',
    dataIndex: 'triggeredAt',
    key: 'triggeredAt',
    width: 200,
  },
  {
    title: '确认人',
    dataIndex: 'acknowledgedBy',
    key: 'acknowledgedBy',
    width: 140,
    render: (value: string | null) =>
      value ? (
        <span data-testid="risk-alert-row-ack">{value}</span>
      ) : (
        <Text type="secondary">-</Text>
      ),
  },
  {
    title: '解决时间',
    dataIndex: 'resolvedAt',
    key: 'resolvedAt',
    width: 200,
    render: (value: string | null) => value ?? <Text type="secondary">-</Text>,
  },
];

export function RiskAlerts(): JSX.Element {
  const { data, isLoading, isError } = useRiskAlerts();

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  const activeCount = data?.filter((a) => a.status === 'ACTIVE').length ?? 0;

  return (
    <PageContainer pageId="ops.risk.alerts" state={pageState} title="风险告警">
      <div style={{ marginBottom: 16 }} data-testid="risk-alerts-summary">
        <Space>
          <Text>实时告警总数: </Text>
          <Text strong data-testid="risk-alerts-total">{data?.length ?? 0}</Text>
          <Text>·</Text>
          <Text>活跃告警: </Text>
          <Text strong style={{ color: activeCount > 0 ? '#cf1322' : undefined }} data-testid="risk-alerts-active">
            {activeCount}
          </Text>
        </Space>
      </div>

      <Table<RiskAlert>
        columns={columns}
        dataSource={data ?? []}
        rowKey="alertId"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        data-testid="risk-alerts"
        scroll={{ x: 1700 }}
      />
    </PageContainer>
  );
}
