import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { LoanApplication, LoanSummary } from '@localbank/bank-api-client';
import { money } from '@localbank/bank-ui-kit';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const status = (value: string): JSX.Element => {
  const normalized = value.toUpperCase();
  if (['ACTIVE', 'APPROVED', 'DISBURSED'].includes(normalized)) return <Tag color="green">正常</Tag>;
  if (normalized === 'CLOSED') return <Tag>已结清</Tag>;
  return <Tag color="blue">{value}</Tag>;
};

const applicationStatus: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '已提交', SCORED: '已评分', APPROVED: '已审批',
  CORE_SUBMITTED: '已进入核心', DISBURSED: '已放款', CLOSED: '已结清', REJECTED: '已拒绝',
};

export function LoanList(): JSX.Element {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['loans'], queryFn: () => customerApi.listLoans() });
  const applications = useQuery({ queryKey: ['loan-applications'], queryFn: () => customerApi.listLoanApplications() });
  const items = query.data?.items ?? [];
  const applicationItems = applications.data?.items ?? [];
  const columns: ColumnsType<LoanSummary> = [
    { title: '产品名称', dataIndex: 'loanProductName', key: 'product' },
    { title: '贷款编号', dataIndex: 'loanId', key: 'id' },
    { title: '本金', key: 'principal', render: (_, item) => money(item.principal, item.currency) },
    { title: '未还余额', key: 'outstanding', render: (_, item) => money(item.outstandingBalance, item.currency) },
    { title: '状态', dataIndex: 'status', key: 'status', render: status },
    { title: '操作', key: 'action', render: (_, item) => <Button onClick={() => navigate(`/loans/${item.loanId}`)}>查看</Button> },
  ];
  const applicationColumns: ColumnsType<LoanApplication> = [
    { title: '申请编号', dataIndex: 'applicationId', key: 'id', ellipsis: true },
    { title: '申请金额', key: 'amount', render: (_, item) => money(item.amount, item.currency) },
    { title: '期限', dataIndex: 'termMonths', key: 'term', render: (value) => `${value} 个月` },
    { title: '用途', dataIndex: 'purpose', key: 'purpose' },
    { title: '报价年利率', dataIndex: 'quotedAnnualInterestRate', key: 'rate', render: (value) => `${value}%` },
    { title: '进度', dataIndex: 'status', key: 'status', render: (value) => <Tag color={value === 'CORE_SUBMITTED' ? 'green' : 'blue'}>{applicationStatus[value] ?? value}</Tag> },
    { title: '核心贷款号', dataIndex: 'coreLoanId', key: 'coreLoanId', render: (value) => value ?? '—' },
  ];
  return <PageContainer pageId="customer.loans" state="READY">
    <section className="customer-page experience-page" data-view-state={query.isLoading || applications.isLoading ? 'LOADING' : query.isError || applications.isError ? 'ERROR' : items.length || applicationItems.length ? 'NORMAL' : 'EMPTY'}>
      <div className="customer-page-head"><div><h1>我的贷款</h1><p>查看贷款余额、状态和合同详情。</p></div><Button type="primary" size="large" onClick={() => navigate('/loans/apply')}>申请贷款</Button></div>
      {query.isError ? <Alert type="error" showIcon message="贷款列表加载失败" action={<Button onClick={() => query.refetch()}>重新加载</Button>} /> : null}
      <div className="bank-card customer-table-card">
        {query.isLoading ? <Skeleton active paragraph={{ rows: 7 }} /> : items.length ? <Table columns={columns} dataSource={items} rowKey="loanId" pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }} /> : !query.isError ? <div className="customer-empty"><Empty description="暂无贷款记录" /></div> : null}
      </div>
      <div className="customer-page-head"><div><h2>贷款申请进度</h2><p>从本地申请到核心贷款的完整处理状态。</p></div></div>
      {applications.isError ? <Alert type="error" showIcon message="贷款申请进度加载失败" action={<Button onClick={() => applications.refetch()}>重新加载</Button>} /> : null}
      <div className="bank-card customer-table-card">
        {applications.isLoading ? <Skeleton active paragraph={{ rows: 5 }} /> : applicationItems.length ? <Table columns={applicationColumns} dataSource={applicationItems} rowKey="applicationId" pagination={false} /> : !applications.isError ? <Empty description="暂无贷款申请" /> : null}
      </div>
    </section>
  </PageContainer>;
}
