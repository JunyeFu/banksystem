import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Typography } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type { DashboardSummary } from '@/types/models';

const { Text } = Typography;

function useDashboardSummary() {
  return useQuery<DashboardSummary, ApiError>({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiClient.get<DashboardSummary>('/dashboard'),
  });
}

export function Dashboard(): JSX.Element {
  const { data, isLoading, isError } = useDashboardSummary();

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  return (
    <PageContainer pageId="ops.dashboard" state={pageState} title="运营仪表盘">
      <Row gutter={[16, 16]} data-testid="dashboard-metrics">
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="dashboard-card-approvals">
            <Statistic
              title="待审核"
              value={data?.pendingApprovals ?? 0}
              data-testid="dashboard-pending-approvals"
            />
            <Text type="secondary">需要 Maker-Checker 复核</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="dashboard-card-clearing">
            <Statistic
              title="清算状态"
              value={data?.clearingStatus ?? '—'}
              data-testid="dashboard-clearing-status"
            />
            <Text type="secondary">重复和乱序回调受 Inbox 保护</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="dashboard-card-recon">
            <Statistic
              title="对账差异"
              value={data?.reconciliationStatus ?? '—'}
              data-testid="dashboard-recon-status"
            />
            <Text type="secondary">渠道与核心 reference 对齐</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="dashboard-card-health">
            <Statistic
              title="系统健康"
              value={data?.systemHealth ?? '—'}
              data-testid="dashboard-system-health"
            />
            <Text type="secondary">服务运行状态</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="dashboard-card-active-payments">
            <Statistic
              title="活跃支付"
              value={data?.activePayments ?? 0}
              data-testid="dashboard-active-payments"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card data-testid="dashboard-card-failed-payments">
            <Statistic
              title="失败支付"
              value={data?.failedPayments ?? 0}
              valueStyle={{ color: '#cf1322' }}
              data-testid="dashboard-failed-payments"
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} data-testid="dashboard-card-constraints">
        <h3>审批约束</h3>
        <ul>
          <li>审批必须提供理由。</li>
          <li>Maker 与 Checker 不得是同一主体。</li>
          <li>审批请求必须携带当前 version。</li>
        </ul>
      </Card>
    </PageContainer>
  );
}
