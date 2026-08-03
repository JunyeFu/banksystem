import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { LoanSummary } from '@localbank/bank-api-client';
import { money } from '@localbank/bank-ui-kit';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const status = (value: string): JSX.Element => {
  const normalized = value.toUpperCase();
  if (['ACTIVE', 'APPROVED', 'DISBURSED'].includes(normalized)) return <Tag color="green">正常</Tag>;
  if (normalized === 'CLOSED') return <Tag>已结清</Tag>;
  return <Tag color="blue">{value}</Tag>;
};

export function LoanList(): JSX.Element {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['loans'], queryFn: () => customerApi.listLoans() });
  const items = query.data?.items ?? [];
  const columns: ColumnsType<LoanSummary> = [
    { title: '产品名称', dataIndex: 'loanProductName', key: 'product' },
    { title: '贷款编号', dataIndex: 'loanId', key: 'id' },
    { title: '本金', key: 'principal', render: (_, item) => money(item.principal, item.currency) },
    { title: '未还余额', key: 'outstanding', render: (_, item) => money(item.outstandingBalance, item.currency) },
    { title: '状态', dataIndex: 'status', key: 'status', render: status },
    { title: '操作', key: 'action', render: (_, item) => <Button onClick={() => navigate(`/loans/${item.loanId}`)}>查看</Button> },
  ];
  return <PageContainer pageId="customer.loans" state="READY">
    <section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : items.length ? 'NORMAL' : 'EMPTY'}>
      <div className="customer-page-head"><div><h1>我的贷款</h1><p>查看贷款余额、状态和合同详情。</p></div><Button type="primary" size="large" onClick={() => navigate('/loans/apply')}>申请贷款</Button></div>
      {query.isError ? <Alert type="error" showIcon message="贷款列表加载失败" action={<Button onClick={() => query.refetch()}>重新加载</Button>} /> : null}
      <div className="bank-card customer-table-card">
        {query.isLoading ? <Skeleton active paragraph={{ rows: 7 }} /> : items.length ? <Table columns={columns} dataSource={items} rowKey="loanId" pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }} /> : !query.isError ? <div className="customer-empty"><Empty description="暂无贷款记录" /></div> : null}
      </div>
    </section>
  </PageContainer>;
}
