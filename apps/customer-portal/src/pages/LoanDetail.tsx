import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RepaymentInstallment } from '@localbank/bank-api-client';
import { money } from '@localbank/bank-ui-kit';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function LoanDetail(): JSX.Element {
  const { loanId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['loan', loanId], queryFn: () => customerApi.getLoan(loanId), enabled: !!loanId, retry: false });
  const data = query.data;
  const columns: ColumnsType<RepaymentInstallment> = [
    { title: '期数', dataIndex: 'period', key: 'period' }, { title: '还款日', dataIndex: 'dueDate', key: 'date' },
    { title: '应还本金', key: 'principal', render: (_, row) => money(row.principalDue, data?.currency ?? 'CNY') },
    { title: '应还利息', key: 'interest', render: (_, row) => money(row.interestDue, data?.currency ?? 'CNY') },
    { title: '应还总额', key: 'total', render: (_, row) => money(row.totalDue, data?.currency ?? 'CNY') },
    { title: '状态', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'PAID' ? 'green' : 'orange'}>{value === 'PAID' ? '已还款' : '待还款'}</Tag> },
  ];
  return <PageContainer pageId="customer.loan.detail" state="READY">
    <section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : 'NORMAL'}>
      <div className="customer-breadcrumb">贷款　/　贷款详情</div>
      <div className="customer-page-head"><div><h1>贷款详情</h1><p>{data?.loanProductName ?? '正在读取复兴银行贷款信息'}</p></div><div><Button onClick={() => window.print()}>打印</Button>　<Button type="primary" disabled={!data || Number(data.outstandingBalance) <= 0}>提前还款</Button></div></div>
      {query.isError ? <Alert type="error" showIcon message="贷款详情加载失败" action={<Button onClick={() => query.refetch()}>重新加载</Button>} /> : null}
      {query.isLoading ? <Skeleton active paragraph={{ rows: 14 }} /> : null}
      {data ? <>
        <div className="loan-metric-grid"><div className="bank-card"><span>本金（{data.currency}）</span><strong>{money(data.principal, data.currency)}</strong></div><div className="bank-card"><span>未还余额（{data.currency}）</span><strong>{money(data.outstandingBalance, data.currency)}</strong></div><div className="bank-card"><span>期限</span><strong>{data.termMonths} 个月</strong></div><div className="bank-card"><span>利率</span><strong>{data.interestRate ?? '-'}%</strong><small>年利率</small></div></div>
        <div className="bank-card loan-information"><h2>贷款信息</h2><dl><div><dt>贷款产品</dt><dd>{data.loanProductName}</dd></div><div><dt>贷款编号</dt><dd>{data.loanId}</dd></div><div><dt>状态</dt><dd><Tag color="green">{data.status}</Tag></dd></div><div><dt>贷款金额</dt><dd>{money(data.principal, data.currency)}</dd></div><div><dt>起息日</dt><dd>{data.startDate ?? '-'}</dd></div><div><dt>到期日</dt><dd>{data.endDate ?? '-'}</dd></div></dl></div>
        <div className="bank-card customer-table-card loan-schedule"><h2>还款计划</h2>{data.repaymentSchedule.length ? <Table columns={columns} dataSource={data.repaymentSchedule} rowKey="period" pagination={false} /> : <Empty description="暂无还款计划" />}</div>
      </> : null}
      <Button className="detail-back" onClick={() => navigate('/loans')}>返回我的贷款</Button>
    </section>
  </PageContainer>;
}
