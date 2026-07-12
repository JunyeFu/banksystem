import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Col,
  Row,
  Statistic,
  Table,
  Button,
  Typography,
  Tag,
  Space,
  Empty,
} from 'antd';
import type { TableProps } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { AccountDetailResponse, Transaction } from '@/types/models';

const { Title } = Typography;

const transactionColumns: TableProps<Transaction>['columns'] = [
  {
    title: '日期',
    dataIndex: 'transactionDate',
    key: 'transactionDate',
    width: 180,
  },
  {
    title: '描述',
    dataIndex: 'description',
    key: 'description',
  },
  {
    title: '类型',
    dataIndex: 'transactionType',
    key: 'transactionType',
    width: 100,
    render: (value: string) => <Tag>{value}</Tag>,
  },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    width: 140,
    render: (value: string, record: Transaction) => {
      const prefix = record.transactionType === 'DEBIT' ? '-' : '+';
      return `${prefix}${value} ${record.currency}`;
    },
  },
];

export function AccountDetail(): JSX.Element {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<AccountDetailResponse>({
    queryKey: ['account', accountId],
    queryFn: () => apiClient.get<AccountDetailResponse>(`/accounts/${accountId}`),
    enabled: !!accountId,
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  const transactions = data?.transactions ?? [];

  return (
    <PageContainer
      pageId="customer.account.detail"
      state={pageState}
      title="账户详情"
    >
      <div data-testid="account-detail" style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button onClick={() => navigate(-1)} data-testid="account-detail-back">
            返回
          </Button>

          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card>
                <Statistic
                  title="账户余额"
                  value={data?.balance ?? '0'}
                  precision={2}
                  prefix={data?.currency ?? 'CNY'}
                  data-testid="account-detail-balance"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="账户类型"
                  value={data?.accountType ?? '—'}
                  data-testid="account-detail-type"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="账户状态"
                  value={data?.status ?? 'ACTIVE'}
                  data-testid="account-detail-status"
                />
              </Card>
            </Col>
          </Row>

          <Card>
            <p>
              <strong>账户编号：</strong>
              <span data-testid="account-detail-id">{data?.accountId ?? '—'}</span>
            </p>
            <p>
              <strong>账号：</strong>
              <span data-testid="account-detail-masked-number">
                {data?.maskedAccountNumber ?? '—'}
              </span>
            </p>
          </Card>

          <Card title={<Title level={4}>交易记录</Title>}>
            {transactions.length === 0 ? (
              <Empty
                description="暂无交易记录"
                data-testid="account-detail-no-transactions"
              />
            ) : (
              <Table
                columns={transactionColumns}
                dataSource={transactions}
                rowKey="transactionId"
                pagination={{ pageSize: 10 }}
                data-testid="account-detail-transactions"
              />
            )}
          </Card>
        </Space>
      </div>
    </PageContainer>
  );
}
