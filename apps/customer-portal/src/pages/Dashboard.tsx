import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic, Button, Typography, Space, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import { setAccessToken } from '@/auth/tokenStore';
import type { AccountListResponse } from '@/types/models';

const { Title } = Typography;

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<AccountListResponse>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get<AccountListResponse>('/accounts'),
  });

  function handleLogout(): void {
    setAccessToken(null);
    navigate('/login');
  }

  const accounts = data?.items ?? [];
  const totalBalance = accounts.reduce(
    (sum, a) => sum + Number(a.balance || '0'),
    0,
  );
  const currency = accounts[0]?.currency ?? 'CNY';

  return (
    <PageContainer
      pageId="customer.dashboard"
      state={isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY'}
      title="账户概览"
    >
      <div style={{ padding: '24px' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Title level={3} data-testid="dashboard-welcome">
            欢迎
          </Title>
          <Space>
            <Button data-testid="dashboard-refresh" disabled={isLoading}>
              刷新
            </Button>
            <Button
              data-testid="dashboard-logout"
              onClick={handleLogout}
              danger
            >
              退出
            </Button>
          </Space>
        </Row>

        {isError && (
          <Alert
            type="error"
            message="加载账户数据失败"
            description="请检查网络连接后重试。"
            style={{ marginBottom: 24 }}
            data-testid="dashboard-error"
          />
        )}

        <Row gutter={[16, 16]}>
          <Col span={8}>
            <Card>
              <Statistic
                title="账户总数"
                value={accounts.length}
                data-testid="dashboard-account-count"
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="总余额"
                value={totalBalance}
                precision={2}
                prefix={currency}
                data-testid="dashboard-total-balance"
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="活跃账户"
                value={accounts.length}
                data-testid="dashboard-active-accounts"
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {accounts.length === 0 && !isLoading && (
            <Col span={24}>
              <Card>
                <p data-testid="dashboard-no-accounts">
                  当前客户暂无已关联账户。
                </p>
              </Card>
            </Col>
          )}
          {accounts.map((account) => (
            <Col span={8} key={account.accountId}>
              <Card
                data-testid={`dashboard-account-${account.accountId}`}
                hoverable
                onClick={() => navigate(`/accounts/${account.accountId}`)}
              >
                <p>
                  <strong>{account.maskedAccountNumber}</strong>
                </p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {account.balance} {account.currency}
                </p>
                <p>
                  <small>账户编号：{account.accountId}</small>
                </p>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </PageContainer>
  );
}
