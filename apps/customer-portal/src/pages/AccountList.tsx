import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Button, Typography, Tag, Empty, Skeleton } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { AccountListResponse } from '@/types/models';

const { Text } = Typography;

export function AccountList(): JSX.Element {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<AccountListResponse>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get<AccountListResponse>('/accounts'),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  const accounts = data?.items ?? [];

  return (
    <PageContainer
      pageId="customer.accounts"
      state={pageState}
      title="账户列表"
    >
      <div data-testid="account-list" style={{ padding: '24px' }}>
        {isLoading && <Skeleton active />}

        {!isLoading && isError && (
          <Empty description="加载账户列表失败" data-testid="account-list-error" />
        )}

        {!isLoading && !isError && accounts.length === 0 && (
          <Empty description="暂无账户" data-testid="account-list-empty" />
        )}

        <Row gutter={[16, 16]}>
          {accounts.map((account) => (
            <Col span={8} key={account.accountId}>
              <Card
                data-testid={`account-card-${account.accountId}`}
                hoverable
                onClick={() => navigate(`/accounts/${account.accountId}`)}
              >
                <p>
                  <strong data-testid={`account-number-${account.accountId}`}>
                    {account.maskedAccountNumber}
                  </strong>
                </p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  <span data-testid={`account-balance-${account.accountId}`}>
                    {account.balance}{' '}
                    <Tag data-testid={`account-currency-${account.accountId}`}>
                      {account.currency}
                    </Tag>
                  </span>
                </p>
                {account.accountType !== undefined && (
                  <p>
                    <Text type="secondary">类型：</Text>
                    <span data-testid={`account-type-${account.accountId}`}>
                      {account.accountType}
                    </span>
                  </p>
                )}
                <p>
                  <Text type="secondary">账户编号：</Text>
                  <span data-testid={`account-id-${account.accountId}`}>
                    {account.accountId}
                  </span>
                </p>
              </Card>
            </Col>
          ))}
        </Row>

        {!isLoading && !isError && accounts.length > 0 && (
          <Button
            type="primary"
            onClick={() => navigate('/transfers/new')}
            style={{ marginTop: 24 }}
            data-testid="account-list-transfer"
          >
            新建转账
          </Button>
        )}
      </div>
    </PageContainer>
  );
}
