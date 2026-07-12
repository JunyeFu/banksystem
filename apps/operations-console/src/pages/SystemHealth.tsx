import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type { AlertSeverity, AlertStatus, MonitoringAlert } from '@/types/models';

const { Text } = Typography;

const severityColorMap: Record<AlertSeverity, string> = {
  INFO: 'default',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'error',
};

const alertStatusColorMap: Record<AlertStatus, string> = {
  FIRING: 'error',
  RESOLVED: 'success',
};

function useMonitoringAlerts() {
  return useQuery<MonitoringAlert[], ApiError>({
    queryKey: ['monitoring-alerts'],
    queryFn: () => apiClient.get<MonitoringAlert[]>('/internal/monitoring/alerts'),
  });
}

const columns: ColumnsType<MonitoringAlert> = [
  {
    title: '告警ID',
    dataIndex: 'alertId',
    key: 'alertId',
    width: 200,
    render: (value: string) => (
      <Text code copyable data-testid="health-row-alert-id">
        {value}
      </Text>
    ),
  },
  {
    title: '严重级别',
    dataIndex: 'severity',
    key: 'severity',
    width: 120,
    render: (value: AlertSeverity) => (
      <Tag color={severityColorMap[value]} data-testid="health-row-severity">
        {value}
      </Tag>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
    render: (value: AlertStatus) => (
      <Tag color={alertStatusColorMap[value]} data-testid="health-row-status">
        {value}
      </Tag>
    ),
  },
  {
    title: '服务名称',
    dataIndex: 'serviceName',
    key: 'serviceName',
    width: 180,
    render: (value: string) => (
      <span data-testid="health-row-service">{value}</span>
    ),
  },
  {
    title: '消息',
    dataIndex: 'message',
    key: 'message',
    width: 360,
    render: (value: string) => (
      <span data-testid="health-row-message">{value}</span>
    ),
  },
  {
    title: '触发时间',
    dataIndex: 'triggeredAt',
    key: 'triggeredAt',
    width: 200,
  },
  {
    title: '解决时间',
    dataIndex: 'resolvedAt',
    key: 'resolvedAt',
    width: 200,
    render: (value: string | null) => value ?? <Text type="secondary">-</Text>,
  },
  {
    title: '标签',
    dataIndex: 'labels',
    key: 'labels',
    width: 240,
    render: (value: Record<string, string>) => {
      const entries = Object.entries(value);
      return entries.length > 0 ? (
        <Space wrap data-testid="health-row-labels">
          {entries.map(([k, v]) => (
            <Tag key={k} data-testid={`health-row-label-${k}`}>
              {k}={v}
            </Tag>
          ))}
        </Space>
      ) : (
        <Text type="secondary">-</Text>
      );
    },
  },
];

export function SystemHealth(): JSX.Element {
  const { data, isLoading, isError } = useMonitoringAlerts();

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  const firingCount = data?.filter((a) => a.status === 'FIRING').length ?? 0;
  const criticalCount =
    data?.filter((a) => a.severity === 'CRITICAL' && a.status === 'FIRING').length ?? 0;
  const errorCount =
    data?.filter((a) => a.severity === 'ERROR' && a.status === 'FIRING').length ?? 0;
  const resolvedCount =
    data?.filter((a) => a.status === 'RESOLVED').length ?? 0;

  return (
    <PageContainer pageId="operations.system-health" state={pageState} title="系统健康">
      <Row gutter={[16, 16]} data-testid="system-health-metrics">
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="health-card-firing">
            <Statistic
              title="活跃告警"
              value={firingCount}
              valueStyle={{ color: firingCount > 0 ? '#cf1322' : undefined }}
              data-testid="health-firing-count"
            />
            <Text type="secondary">正在触发的告警</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="health-card-critical">
            <Statistic
              title="严重告警"
              value={criticalCount}
              valueStyle={{ color: criticalCount > 0 ? '#cf1322' : undefined }}
              data-testid="health-critical-count"
            />
            <Text type="secondary">CRITICAL 级别活跃告警</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="health-card-error">
            <Statistic
              title="错误告警"
              value={errorCount}
              valueStyle={{ color: errorCount > 0 ? '#fa8c16' : undefined }}
              data-testid="health-error-count"
            />
            <Text type="secondary">ERROR 级别活跃告警</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="health-card-resolved">
            <Statistic
              title="已恢复"
              value={resolvedCount}
              valueStyle={{ color: '#52c41a' }}
              data-testid="health-resolved-count"
            />
            <Text type="secondary">已恢复的告警</Text>
          </Card>
        </Col>
      </Row>

      <Card
        title="监控告警列表"
        style={{ marginTop: 16 }}
        data-testid="system-health-alerts-card"
      >
        <Table<MonitoringAlert>
          columns={columns}
          dataSource={data ?? []}
          rowKey="alertId"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          data-testid="system-health"
          scroll={{ x: 1400 }}
        />
      </Card>
    </PageContainer>
  );
}
