import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Table, Button, Tag, Empty, Skeleton, Space } from 'antd';
import type { TableProps } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { TransferListResponse, Transfer } from '@/types/models';

function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
      return 'green';
    case 'PENDING':
    case 'PROCESSING':
      return 'blue';
    case 'FAILED':
    case 'REJECTED':
      return 'red';
    default:
      return 'default';
  }
}

function statusText(status: string): string {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
      return '已完成';
    case 'PENDING':
      return '待处理';
    case 'PROCESSING':
      return '处理中';
    case 'FAILED':
      return '失败';
    case 'REJECTED':
      return '已拒绝';
    default:
      return status;
  }
}

const transferColumns = (
  navigate: (path: string) => void,
): TableProps<Transfer>['columns'] => [
  {
    title: '转账编号',
    dataIndex: 'paymentId',
    key: 'paymentId',
    width: 160,
    render: (value: string) => (
      <Button
        type="link"
        onClick={() => navigate(`/transfers/${value}`)}
        data-testid={`transfer-item-${value}`}
      >
        {value}
      </Button>
    ),
  },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    width: 140,
    render: (value: string, record: Transfer) => `${value} ${record.currency}`,
  },
  {
    title: '收款账户',
    dataIndex: 'toAccount',
    key: 'toAccount',
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
    render: (value: string, record: Transfer) => (
      <Tag
        color={statusColor(value)}
        data-testid={`transfer-status-${record.paymentId}`}
      >
        {statusText(value)}
      </Tag>
    ),
  },
  {
    title: '创建时间',
    dataIndex: 'createdDate',
    key: 'createdDate',
    width: 180,
  },
];

export function TransferList(): JSX.Element {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<TransferListResponse>({
    queryKey: ['transfers'],
    queryFn: () => apiClient.get<TransferListResponse>('/transfers'),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  const transfers = data?.items ?? [];

  return (
    <PageContainer
      pageId="customer.transfers"
      state={pageState}
      title="转账列表"
    >
      <div data-testid="transfer-list" style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button
            type="primary"
            onClick={() => navigate('/transfers/new')}
            disabled={isLoading}
            data-testid="transfer-list-new"
          >
            新建转账
          </Button>

          {isLoading && <Skeleton active />}

          {!isLoading && isError && (
            <Empty description="加载转账列表失败" data-testid="transfer-list-error" />
          )}

          {!isLoading && !isError && transfers.length === 0 && (
            <Empty description="暂无转账记录" data-testid="transfer-list-empty" />
          )}

          {!isLoading && !isError && transfers.length > 0 && (
            <Table
              columns={transferColumns(navigate)}
              dataSource={transfers}
              rowKey="paymentId"
              pagination={{ pageSize: 10 }}
              data-testid="transfer-list-table"
            />
          )}
        </Space>
      </div>
    </PageContainer>
  );
}
