import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Dropdown, Empty, Input, Select, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import type { OperationsTransfer, TransferStatus } from '@localbank/bank-api-client';
import { dateTime, money, transferStatusText } from '@localbank/bank-ui-kit';
import { operationsApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const tone = (status: TransferStatus): string => status === 'SETTLED' ? 'success' : ['FAILED','TIMED_OUT','RETURNED','REVERSED'].includes(status) ? 'danger' : ['RISK_REVIEW','PENDING_APPROVAL','CORE_RESULT_UNKNOWN','RETURN_PENDING','RETURN_RESULT_UNKNOWN','REVERSAL_PENDING'].includes(status) ? 'warning' : 'progress';
export function PaymentMonitoring(): JSX.Element {
  const navigate = useNavigate(); const [status, setStatus] = useState<TransferStatus>(); const [currency, setCurrency] = useState<string>(); const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null); const [searchDraft, setSearchDraft] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(0); const [exporting, setExporting] = useState(false); const [exportError, setExportError] = useState<string>();
  const filters = { status, currency, query: search || undefined, from: dateRange?.[0]?.startOf('day').toISOString(), to: dateRange?.[1]?.endOf('day').toISOString() };
  const query = useQuery({ queryKey: ['ops-transfers', filters, page], queryFn: () => operationsApi.listTransfers({ ...filters, page, size: 10 }), refetchInterval: 10_000 });
  const metrics = query.data?.summary ?? { total: 0, settled: 0, processing: 0, riskReview: 0, failed: 0 };
  const applySearch = (): void => { setSearch(searchDraft.trim()); setPage(0); };
  const exportCsv = async (): Promise<void> => {
    setExporting(true); setExportError(undefined);
    try {
      const blob = await operationsApi.exportTransfersCsv(filters); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `transfer-monitoring-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setExportError(error instanceof Error ? error.message : '支付数据导出失败，请稍后重试。'); }
    finally { setExporting(false); }
  };
  const columns: ColumnsType<OperationsTransfer> = useMemo(() => [
    { title: '转账 ID', dataIndex: 'transferId', width: 210, ellipsis: true },
    { title: '金额', width: 135, align: 'right', render: (_, item) => money(item.amount, item.currency).replace(` ${item.currency}`, '') },
    { title: '币种', dataIndex: 'currency', width: 75 },
    { title: '状态', dataIndex: 'status', width: 130, render: (value: TransferStatus) => <Tag className={`bank-status bank-status--${tone(value)}`}>{transferStatusText[value]}</Tag> },
    { title: '核心参考号', dataIndex: 'coreReference', width: 185, render: (value?: string) => value ?? <span className="bank-muted">—</span> },
    { title: '关联 ID', dataIndex: 'correlationId', width: 160, ellipsis: true, render: (value?: string) => value ?? <span className="bank-muted">—</span> },
    { title: '交易时间', dataIndex: 'createdAt', width: 170, render: dateTime },
    { title: '操作', width: 72, fixed: 'right', render: (_, item) => <Button type="link" className="ops-detail-link" data-testid={`payment-detail-${item.transferId}`} onClick={() => navigate(`/payments/${item.transferId}`)}>详情</Button> },
  ], [navigate]);
  return <PageContainer pageId="operations.payments" state="READY"><section data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : query.data?.items.length ? 'NORMAL' : 'EMPTY'}><div className="ops-breadcrumb">首页　/　支付监控</div><h1 className="ops-page-title">支付监控</h1><p className="ops-page-lead">实时监控支付与转账业务处理状态，及时发现并处理异常交易。</p>
    <div className="bank-card ops-filter-card"><div className="ops-filters"><div className="ops-filter">状态<Select value={status} allowClear placeholder="全部" onChange={(value) => { setStatus(value); setPage(0); }} options={Object.entries(transferStatusText).map(([value,label]) => ({ value,label }))} data-testid="payment-status-filter" /></div><div className="ops-filter">币种<Select value={currency} allowClear placeholder="全部" onChange={(value) => { setCurrency(value); setPage(0); }} options={[{value:'CNY',label:'CNY'},{value:'USD',label:'USD'},{value:'HKD',label:'HKD'}]} data-testid="payment-currency-filter" /></div><div className="ops-filter">交易日期<DatePicker.RangePicker value={dateRange} onChange={(value) => { setDateRange(value); setPage(0); }} showTime style={{ width: '100%' }} data-testid="payment-date-filter" /></div><Input.Search value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onSearch={applySearch} placeholder="请输入转账 ID / 核心参考号 / 关联 ID" allowClear data-testid="payment-search" /><Button type="primary" className="ops-search-btn" loading={query.isFetching} onClick={applySearch} data-testid="payment-query">查询</Button><Button onClick={() => { setStatus(undefined); setCurrency(undefined); setDateRange(null); setSearchDraft(''); setSearch(''); setPage(0); }}>重置</Button></div>
      <div className="ops-metrics"><div className="ops-metric"><span>全部</span><strong>{metrics.total.toLocaleString()}</strong></div><div className="ops-metric ops-metric--success"><span>已结算</span><strong>{metrics.settled}</strong></div><div className="ops-metric"><span>处理中</span><strong>{metrics.processing}</strong></div><div className="ops-metric ops-metric--warning"><span>风险复核</span><strong>{metrics.riskReview}</strong></div><div className="ops-metric ops-metric--danger"><span>失败</span><strong>{metrics.failed}</strong></div></div></div>
    <div className="bank-card ops-table-card"><div className="ops-table-actions"><Button loading={exporting} onClick={() => void exportCsv()} data-testid="payment-export">⇩　导出</Button><Dropdown menu={{ items: [{ key: 'SETTLED', label: '仅看已结算' }, { key: 'RISK_REVIEW', label: '仅看风险复核' }, { key: 'FAILED', label: '仅看失败' }], onClick: ({ key }) => { setStatus(key as TransferStatus); setPage(0); } }}><Button data-testid="payment-more-filters">更多筛选⌄</Button></Dropdown></div>{exportError ? <Alert type="error" showIcon closable message="导出失败" description={exportError} onClose={() => setExportError(undefined)} style={{ marginBottom: 16 }} /> : null}{query.isLoading ? <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 8 }} /></div> : query.isError ? <div className="bank-error-panel"><Empty description="支付数据加载失败"><Button onClick={() => void query.refetch()}>重新加载</Button></Empty></div> : query.data?.items.length === 0 ? <div className="bank-error-panel"><Empty description="当前筛选条件下没有支付记录" /></div> : <Table columns={columns} dataSource={query.data?.items ?? []} rowKey="transferId" size="middle" className="bank-table" onRow={(item) => ({ onClick: () => navigate(`/payments/${item.transferId}`), tabIndex: 0, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/payments/${item.transferId}`); }, style: { cursor: 'pointer' } })} scroll={{ x: 1180 }} pagination={{ current: page + 1, pageSize: 10, total: query.data?.totalItems, showSizeChanger: false, showTotal: (total) => `共 ${total.toLocaleString()} 条`, onChange: (value) => setPage(value - 1) }} data-testid="payment-table" />}</div>
  </section></PageContainer>;
}
