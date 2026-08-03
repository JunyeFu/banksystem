import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Empty, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import type { Transfer, TransferStatus } from '@localbank/bank-api-client';
import { dateTime, money, transferStatusText } from '@localbank/bank-ui-kit';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const { RangePicker } = DatePicker;
const statusClass = (status: TransferStatus): string => {
  if (status === 'SETTLED') return 'success';
  if (['FAILED', 'TIMED_OUT', 'RETURNED', 'REVERSED'].includes(status)) return 'danger';
  if (['RISK_REVIEW', 'PENDING_APPROVAL', 'REVERSAL_PENDING'].includes(status)) return 'warning';
  return 'progress';
};

export function TransferList(): JSX.Element {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TransferStatus | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customer-transfers', status, dateRange?.[0]?.valueOf(), dateRange?.[1]?.valueOf(), page],
    queryFn: () => customerApi.listTransfers({ status, from: dateRange?.[0]?.startOf('day').toISOString(), to: dateRange?.[1]?.endOf('day').toISOString(), page, size: 20 }),
  });
  const columns = useMemo<ColumnsType<Transfer>>(() => [
    { title: '转账编号', dataIndex: 'transferId', width: 220, ellipsis: true },
    { title: '金额', width: 150, render: (_, item) => money(item.amount, item.currency) },
    { title: '状态', dataIndex: 'status', width: 130, render: (value: TransferStatus) => <Tag className={`bank-status bank-status--${statusClass(value)}`}>{transferStatusText[value]}</Tag> },
    { title: '转出账户', dataIndex: 'sourceAccountId', width: 145, render: (value: string) => `账户 ${value}` },
    { title: '收款账户', width: 190, render: (_, item) => item.maskedDestinationAccount ? `${item.beneficiaryName ?? ''} ${item.maskedDestinationAccount}` : `账户 ${item.destinationAccountId ?? '—'}` },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: dateTime },
    { title: '操作', width: 90, fixed: 'right', render: (_, item) => <Button onClick={(event) => { event.stopPropagation(); navigate(`/transfers/${item.transferId}`); }} data-testid={`transfer-item-${item.transferId}`}>查看</Button> },
  ], [navigate]);
  return (
    <PageContainer pageId="customer.transfers" state="READY">
      <section className="bank-page" data-view-state={isLoading ? 'LOADING' : isError ? 'ERROR' : data?.items.length ? 'NORMAL' : 'EMPTY'}>
        <div className="transfer-list-head"><h1>转账记录</h1><Button type="primary" className="bank-primary-btn" onClick={() => navigate('/transfers/new?i10Scenario=1')} data-testid="transfer-list-new">新建转账</Button></div>
        <div className="bank-toolbar">
          <span className="transfer-filter-label">状态：</span>
          <Select value={status} onChange={(value) => { setStatus(value); setPage(0); }} allowClear placeholder="全部状态" style={{ width: 230 }} options={Object.entries(transferStatusText).map(([value, label]) => ({ value, label }))} data-testid="transfer-status-filter" />
          <span className="transfer-filter-label">日期：</span><RangePicker value={dateRange} onChange={(value) => { setDateRange(value); setPage(0); }} style={{ width: 360 }} placeholder={['开始日期', '结束日期']} data-testid="transfer-date-filter" />
          <Button type="link" onClick={() => { setStatus(undefined); setDateRange(null); setPage(0); }}>重置</Button>
        </div>
        <div className="bank-card bank-table">
          {isLoading ? <div style={{ padding: 28 }}><Skeleton active paragraph={{ rows: 6 }} /></div> : isError ? <div className="bank-error-panel"><Empty description="转账记录加载失败"><Button onClick={() => void refetch()}>重新加载</Button></Empty></div> : data?.items.length === 0 ? <div className="bank-error-panel"><Empty description="暂无转账记录"><Button type="primary" onClick={() => navigate('/transfers/new')}>发起第一笔转账</Button></Empty></div> : <Table columns={columns} dataSource={data?.items ?? []} rowKey="transferId" onRow={(item) => ({ onClick: () => navigate(`/transfers/${item.transferId}`), onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/transfers/${item.transferId}`); }, tabIndex: 0, style: { cursor: 'pointer' } })} scroll={{ x: 1200 }} pagination={{ current: page + 1, pageSize: 20, total: data?.totalItems, showSizeChanger: false, showTotal: (total) => `共 ${total} 条`, onChange: (next) => setPage(next - 1) }} data-testid="transfer-list-table" />}
        </div>
      </section>
    </PageContainer>
  );
}
