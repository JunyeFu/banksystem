import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Empty, Input, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Transfer, TransferStatus } from '@localbank/bank-api-client';
import { dateTime, money, transferStatusText } from '@localbank/bank-ui-kit';
import { operationsApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const tone = (status: TransferStatus): string => status === 'SETTLED' ? 'success' : ['FAILED','TIMED_OUT','RETURNED','REVERSED'].includes(status) ? 'danger' : ['RISK_REVIEW','PENDING_APPROVAL','REVERSAL_PENDING'].includes(status) ? 'warning' : 'progress';
const processing = new Set<TransferStatus>(['CREATED','VALIDATING','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING','REVERSAL_PENDING']);

export function PaymentMonitoring(): JSX.Element {
  const navigate = useNavigate(); const [status, setStatus] = useState<TransferStatus>(); const [page, setPage] = useState(0);
  const query = useQuery({ queryKey: ['ops-transfers', status, page], queryFn: () => operationsApi.listTransfers({ status, page, size: 10 }), refetchInterval: 10_000 });
  const metrics = useMemo(() => { const items = query.data?.items ?? []; return { total: query.data?.totalItems ?? 0, settled: items.filter((x) => x.status === 'SETTLED').length, active: items.filter((x) => processing.has(x.status)).length, risk: items.filter((x) => x.status === 'RISK_REVIEW').length, failed: items.filter((x) => x.status === 'FAILED').length }; }, [query.data]);
  const columns: ColumnsType<Transfer> = useMemo(() => [
    { title: '转账 ID', dataIndex: 'transferId', width: 210, ellipsis: true },
    { title: '金额', width: 135, align: 'right', render: (_, item) => money(item.amount, item.currency).replace(` ${item.currency}`, '') },
    { title: '币种', dataIndex: 'currency', width: 75 },
    { title: '状态', dataIndex: 'status', width: 130, render: (value: TransferStatus) => <Tag className={`bank-status bank-status--${tone(value)}`}>{transferStatusText[value]}</Tag> },
    { title: '核心参考号', dataIndex: 'coreReference', width: 185, render: (value?: string) => value ?? <span className="bank-muted">—</span> },
    { title: '关联 ID', dataIndex: 'correlationId', width: 160, ellipsis: true, render: (value?: string) => value ?? <span className="bank-muted">—</span> },
    { title: '交易时间', dataIndex: 'createdAt', width: 170, render: dateTime },
    { title: '操作', width: 72, fixed: 'right', render: (_, item) => <Button type="link" className="ops-detail-link" onClick={() => navigate(`/payments/${item.transferId}`)}>详情</Button> },
  ], [navigate]);
  return <PageContainer pageId="operations.payments" state="READY"><section data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : query.data?.items.length ? 'NORMAL' : 'EMPTY'}><div className="ops-breadcrumb">首页　/　支付监控</div><h1 className="ops-page-title">支付监控</h1><p className="ops-page-lead">实时监控支付与转账业务处理状态，及时发现并处理异常交易。</p>
    <div className="bank-card ops-filter-card"><div className="ops-filters"><div className="ops-filter">状态<Select value={status} allowClear placeholder="全部" onChange={(value) => { setStatus(value); setPage(0); }} options={Object.entries(transferStatusText).map(([value,label]) => ({ value,label }))} data-testid="payment-status-filter" /></div><div className="ops-filter">币种<Select placeholder="全部" options={[{value:'CNY',label:'CNY'},{value:'USD',label:'USD'},{value:'HKD',label:'HKD'}]} /></div><div className="ops-filter">交易日期<DatePicker.RangePicker showTime style={{ width: '100%' }} /></div><Input.Search placeholder="请输入转账 ID / 核心参考号 / 关联 ID" allowClear data-testid="payment-search" /><Button type="primary" className="ops-search-btn" onClick={() => void query.refetch()}>查询</Button><Button onClick={() => { setStatus(undefined); setPage(0); }}>重置</Button></div>
      <div className="ops-metrics"><div className="ops-metric"><span>全部</span><strong>{metrics.total.toLocaleString()}</strong></div><div className="ops-metric ops-metric--success"><span>已结算</span><strong>{metrics.settled}</strong></div><div className="ops-metric"><span>处理中</span><strong>{metrics.active}</strong></div><div className="ops-metric ops-metric--warning"><span>风险复核</span><strong>{metrics.risk}</strong></div><div className="ops-metric ops-metric--danger"><span>失败</span><strong>{metrics.failed}</strong></div></div></div>
    <div className="bank-card ops-table-card"><div className="ops-table-actions"><Button>⇩　导出</Button><Button>更多筛选⌄</Button></div>{query.isLoading ? <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div> : query.isError ? <div className="bank-error-panel"><Empty description="支付数据加载失败"><Button onClick={() => void query.refetch()}>重新加载</Button></Empty></div> : query.data?.items.length === 0 ? <div className="bank-error-panel"><Empty description="当前筛选条件下没有支付记录" /></div> : <Table columns={columns} dataSource={query.data?.items ?? []} rowKey="transferId" size="middle" className="bank-table" scroll={{ x: 1180 }} pagination={{ current: page + 1, pageSize: 10, total: query.data?.totalItems, showSizeChanger: false, showTotal: (total) => `共 ${total.toLocaleString()} 条`, onChange: (value) => setPage(value - 1) }} data-testid="payment-table" />}</div>
  </section></PageContainer>;
}
