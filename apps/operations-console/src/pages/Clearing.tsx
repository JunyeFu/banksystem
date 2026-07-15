import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Skeleton, Table, Tag } from 'antd';
import type { OperationsClearingBatch, OperationsClearingBatchStatus } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const statusLabels: Record<OperationsClearingBatchStatus, string> = { PROCESSING: '处理中', COMPLETED: '已完成', FAILED: '失败' };
const statusColors: Record<OperationsClearingBatchStatus, string> = { PROCESSING: 'processing', COMPLETED: 'success', FAILED: 'error' };
const money = (value: string, currency: string) => `${currency} ${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
const time = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';

export function Clearing(): JSX.Element {
  const query = useQuery({ queryKey: ['operations-clearing-batches'], queryFn: () => operationsApi.listClearingBatches(), retry: false });
  const rows = query.data ?? [];
  const state = query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : rows.length === 0 ? 'EMPTY' : rows.some((item) => item.status === 'PROCESSING') ? 'PROCESSING' : rows.some((item) => item.status === 'FAILED') ? 'FAILED' : 'COMPLETED';
  const total = rows.reduce((sum, item) => sum + item.totalItems, 0);
  const settled = rows.reduce((sum, item) => sum + item.settledItems, 0);
  const failed = rows.reduce((sum, item) => sum + item.failedItems, 0);

  return <section className="ops-settlement-page" data-page-id="operations.clearing" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">复兴银行运营控制台　/　资金运营</p><h1>清算监控</h1><span>按业务日期汇总支付清算进度，实时定位未结算与失败交易。</span></div><Button onClick={() => void query.refetch()}>↻　刷新</Button></div>
    {query.isError ? <Alert type="error" showIcon message="清算数据加载失败" description="暂时无法读取清算批次，请检查服务状态后重试。" action={<Button onClick={() => void query.refetch()}>重试</Button>} /> : <>
      <div className="ops-risk-metrics ops-risk-metrics--three">
        {query.isLoading ? [0, 1, 2].map((key) => <Card key={key}><Skeleton active paragraph={false} /></Card>) : <>
          <Card><span>清算交易</span><strong>{total}</strong><small>当前业务窗口</small></Card>
          <Card><span>已结算</span><strong className="success">{settled}</strong><small>已完成资金交割</small></Card>
          <Card><span>失败交易</span><strong className={failed ? 'danger' : 'success'}>{failed}</strong><small>需要运营人员关注</small></Card>
        </>}
      </div>
      <Card className="ops-risk-table" title="清算批次" extra={<span>共 {rows.length} 个批次</span>}>
        {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前尚无清算批次" /> : <Table<OperationsClearingBatch> rowKey="batchId" dataSource={rows} pagination={{ pageSize: 10 }} scroll={{ x: 1080 }} columns={[
          { title: '批次编号', dataIndex: 'batchId', width: 170, render: (value: string) => <code>{value}</code> },
          { title: '业务日期', dataIndex: 'businessDate', width: 120 },
          { title: '状态', dataIndex: 'status', width: 105, render: (value: OperationsClearingBatchStatus) => <Tag color={statusColors[value]}>{statusLabels[value]}</Tag> },
          { title: '交易总数', dataIndex: 'totalItems', width: 100, align: 'right' },
          { title: '已结算', dataIndex: 'settledItems', width: 90, align: 'right' },
          { title: '失败', dataIndex: 'failedItems', width: 80, align: 'right', render: (value: number) => <b className={value ? 'danger' : ''}>{value}</b> },
          { title: '清算金额', width: 150, align: 'right', render: (_: unknown, item) => money(item.totalAmount, item.currency) },
          { title: '开始时间', dataIndex: 'startedAt', width: 175, render: time },
          { title: '完成时间', dataIndex: 'completedAt', width: 175, render: time },
        ]} />}
      </Card>
    </>}
  </section>;
}
