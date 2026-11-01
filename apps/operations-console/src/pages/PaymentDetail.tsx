import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Skeleton, Table, Tag, Timeline } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { OutboxEvent, TransferStatus } from '@localbank/bank-api-client';
import { dateTime, money, transferStatusText } from '@localbank/bank-ui-kit';
import { operationsApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const tone = (status: TransferStatus): string => status === 'SETTLED' ? 'success' : ['FAILED','TIMED_OUT','RETURNED','REVERSED'].includes(status) ? 'danger' : ['RISK_REVIEW','PENDING_APPROVAL','CORE_RESULT_UNKNOWN','RETURN_PENDING','RETURN_RESULT_UNKNOWN','REVERSAL_PENDING'].includes(status) ? 'warning' : 'progress';
const outboxColumns: ColumnsType<OutboxEvent> = [
  { title: '事件 ID', dataIndex: 'eventId', width: 210, ellipsis: true }, { title: '事件类型', dataIndex: 'eventType', width: 220 },
  { title: '投递状态', dataIndex: 'status', width: 110, render: (value: string) => <Tag className={`bank-status bank-status--${value === 'PUBLISHED' ? 'success' : value === 'FAILED' ? 'danger' : 'progress'}`}>{value}</Tag> },
  { title: '尝试次数', dataIndex: 'attemptCount', width: 90, align: 'right' }, { title: '创建时间', dataIndex: 'createdAt', width: 175, render: dateTime },
  { title: '发布时间', dataIndex: 'publishedAt', width: 175, render: dateTime },
];
export function PaymentDetail(): JSX.Element {
  const navigate = useNavigate(); const { transferId = '' } = useParams<{ transferId: string }>();
  const query = useQuery({ queryKey: ['ops-transfer-detail', transferId], queryFn: () => operationsApi.getTransfer(transferId), enabled: Boolean(transferId), refetchInterval: 10_000 });
  if (query.isLoading) return <PageContainer pageId="operations.payments.detail" state="READY"><Skeleton active paragraph={{ rows: 14 }} /></PageContainer>;
  if (query.isError || !query.data) return <PageContainer pageId="operations.payments.detail" state="READY"><Empty description="支付详情不存在或无权访问"><Button onClick={() => navigate('/payments')}>返回支付监控</Button></Empty></PageContainer>;
  const item = query.data;
  return <PageContainer pageId="operations.payments.detail" state="READY"><section data-view-state="NORMAL"><div className="ops-breadcrumb">支付监控　/　支付详情</div><div className="ops-detail-head"><div><h1 className="ops-page-title">支付详情</h1><p className="ops-page-lead">查看交易状态、处理轨迹和安全投递证据。</p></div><Button onClick={() => navigate('/payments')}>←　返回列表</Button></div>
    <div className="ops-detail-grid"><div className="bank-card ops-detail-card"><h2>交易摘要</h2><div className="ops-detail-kpis"><div className="ops-detail-kpi"><label>转账 ID</label><strong data-testid="ops-transfer-id">{item.transferId}</strong></div><div className="ops-detail-kpi"><label>当前状态</label><Tag className={`bank-status bank-status--${tone(item.status)}`} data-testid="ops-transfer-status">{transferStatusText[item.status]}</Tag></div><div className="ops-detail-kpi"><label>交易金额</label><strong data-testid="ops-transfer-amount">{money(item.amount,item.currency)}</strong></div><div className="ops-detail-kpi"><label>转出账户</label><strong>{item.sourceAccountId}</strong></div><div className="ops-detail-kpi"><label>目标账户</label><strong>{item.maskedDestinationAccount ?? item.destinationAccountId ?? '—'}</strong></div><div className="ops-detail-kpi"><label>创建时间</label><strong>{dateTime(item.createdAt)}</strong></div><div className="ops-detail-kpi"><label>核心参考号</label><strong data-testid="ops-core-reference">{item.coreReference ?? '—'}</strong></div><div className="ops-detail-kpi"><label>关联 ID</label><strong data-testid="ops-correlation-id">{item.correlationId ?? '—'}</strong></div><div className="ops-detail-kpi"><label>备注</label><strong>{item.reference ?? '—'}</strong></div></div>{item.failureDetail ? <div style={{ marginTop: 16 }}><Tag color="error">{item.failureCode ?? 'FAILED'}</Tag> {item.failureDetail}</div> : null}</div><div className="bank-card ops-detail-card"><h2>审计证据</h2><div className="ops-evidence-count">{item.auditCount}</div><p className="bank-muted">条安全审计链记录</p><p>状态轨迹：<strong data-testid="ops-state-history-count">{item.stateHistory.length}</strong> 条</p><p>Outbox 事件：<strong>{item.outboxEvents.length}</strong> 条</p><p className="bank-muted">页面仅展示安全元数据，不返回事件载荷和敏感凭据。</p></div></div>
    <div className="bank-card ops-timeline-card"><h2>状态历史时间线</h2>{item.stateHistory.length ? <Timeline items={item.stateHistory.map((entry) => ({ color: tone(entry.toStatus) === 'success' ? 'green' : tone(entry.toStatus) === 'danger' ? 'red' : tone(entry.toStatus) === 'warning' ? 'orange' : 'blue', children: <div><Tag className={`bank-status bank-status--${tone(entry.toStatus)}`}>{transferStatusText[entry.toStatus]}</Tag><strong>{entry.fromStatus ? ` ${transferStatusText[entry.fromStatus]} → ` : ' 初始状态 → '}{transferStatusText[entry.toStatus]}</strong><p className="bank-muted">{entry.actorType} · {entry.actorId}　{dateTime(entry.createdAt)}{entry.reasonCode ? `　原因：${entry.reasonCode}` : ''}</p></div> }))} /> : <Empty description="暂无状态历史记录" />}</div>
    <div className="bank-card ops-outbox-card"><h2>Outbox 投递记录</h2><Table columns={outboxColumns} dataSource={item.outboxEvents} rowKey="eventId" pagination={false} scroll={{ x: 980 }} className="bank-table" data-testid="payment-detail-outbox-table" /></div>
  </section></PageContainer>;
}
