import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Table, Button, Tag, Empty, Skeleton, Space } from 'antd';
import type { TableProps } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { LoanListResponse, Loan } from '@/types/models';

function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'APPROVED':
    case 'ACTIVE':
    case 'DISBURSED':
      return 'green';
    case 'PENDING':
    case 'REVIEW':
      return 'blue';
    case 'REJECTED':
    case 'CLOSED':
      return 'red';
    default:
      return 'default';
  }
}

function statusText(status: string): string {
  switch (status.toUpperCase()) {
    case 'APPROVED':
      return '已批准';
    case 'ACTIVE':
      return '活跃';
    case 'DISBURSED':
      return '已放款';
    case 'PENDING':
      return '待审核';
    case 'REVIEW':
      return '审核中';
    case 'REJECTED':
      return '已拒绝';
    case 'CLOSED':
      return '已结清';
    default:
      return status;
  }
}

const loanColumns = (
  navigate: (path: string) => void,
): TableProps<Loan>['columns'] => [
  {
    title: '贷款产品',
    dataIndex: 'loanProductName',
    key: 'loanProductName',
  },
  {
    title: '本金',
    dataIndex: 'principal',
    key: 'principal',
    width: 140,
    render: (value: string, record: Loan) => `${value} ${record.currency}`,
  },
  {
    title: '未还余额',
    dataIndex: 'outstandingBalance',
    key: 'outstandingBalance',
    width: 140,
    render: (value: string, record: Loan) => `${value} ${record.currency}`,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
    render: (value: string, record: Loan) => (
      <Tag
        color={statusColor(value)}
        data-testid={`loan-status-${record.loanId}`}
      >
        {statusText(value)}
      </Tag>
    ),
  },
  {
    title: '操作',
    key: 'action',
    width: 100,
    render: (_: unknown, record: Loan) => (
      <Button
        type="link"
        onClick={() => navigate(`/loans/${record.loanId}`)}
        data-testid={`loan-view-${record.loanId}`}
      >
        查看
      </Button>
    ),
  },
];

export function LoanList(): JSX.Element {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<LoanListResponse>({
    queryKey: ['loans'],
    queryFn: () => apiClient.get<LoanListResponse>('/loans'),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  const loans = data?.items ?? [];

  return (
    <PageContainer
      pageId="customer.loans"
      state={pageState}
      title="贷款列表"
    >
      <div data-testid="loan-list" style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button
            type="primary"
            onClick={() => navigate('/loans/apply')}
            disabled={isLoading}
            data-testid="loan-list-apply"
          >
            申请贷款
          </Button>

          {isLoading && <Skeleton active />}

          {!isLoading && isError && (
            <Empty description="加载贷款列表失败" data-testid="loan-list-error" />
          )}

          {!isLoading && !isError && loans.length === 0 && (
            <Empty description="暂无贷款记录" data-testid="loan-list-empty" />
          )}

          {!isLoading && !isError && loans.length > 0 && (
            <Table
              columns={loanColumns(navigate)}
              dataSource={loans}
              rowKey="loanId"
              pagination={{ pageSize: 10 }}
              data-testid="loan-list-table"
            />
          )}
        </Space>
      </div>
    </PageContainer>
  );
}
