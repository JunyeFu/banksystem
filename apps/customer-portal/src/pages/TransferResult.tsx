import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Skeleton, Tag } from 'antd';
import type { TransferStatus } from '@localbank/bank-api-client';
import { dateTime, money, transferStatusText } from '@localbank/bank-ui-kit';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const terminal = new Set<TransferStatus>(['SETTLED', 'FAILED', 'TIMED_OUT', 'RETURNED', 'REVERSED']);
function presentation(status: TransferStatus): { tone: string; icon: string; title: string; lead: string } {
  if (status === 'SETTLED') return { tone: 'success', icon: '✓', title: '转账已成功', lead: '资金已结算，感谢您的使用！' };
  if (terminal.has(status)) return { tone: 'danger', icon: '×', title: '转账未完成', lead: '本次转账未能完成，请查看失败原因或稍后重试。' };
  return { tone: 'progress', icon: '…', title: '转账处理中', lead: '申请已受理，状态更新后本页面会自动刷新。' };
}
export function TransferResult(): JSX.Element {
  const navigate = useNavigate(); const { transferId = '' } = useParams<{ transferId: string }>();
  const query = useQuery({ queryKey: ['customer-transfer', transferId], queryFn: () => customerApi.getTransfer(transferId), enabled: Boolean(transferId), refetchInterval: (state) => state.state.data && !terminal.has(state.state.data.status) ? 2000 : false });
  if (query.isLoading) return <PageContainer pageId="customer.transfer.result" state="READY"><Skeleton active paragraph={{ rows: 9 }} /></PageContainer>;
  if (query.isError || !query.data) return <PageContainer pageId="customer.transfer.result" state="READY"><Empty description="未找到转账数据"><Button onClick={() => navigate('/transfers')}>返回转账列表</Button></Empty></PageContainer>;
  const item = query.data; const view = presentation(item.status);
  return <PageContainer pageId="customer.transfer.result" state="READY"><div className="customer-breadcrumb">转账列表　/　<strong>转账结果</strong></div><section className="transfer-result" data-view-state={item.status}><span className={`transfer-result__icon transfer-result__icon--${view.tone}`}>{view.icon}</span><h1>{view.title}</h1><p className="transfer-result__lead">{view.lead}</p><div className="bank-card transfer-result__detail"><div className="transfer-result__grid"><div className="transfer-result__field"><label>转账参考号</label><strong>{item.transferId}</strong></div><div className="transfer-result__field"><label>状态</label><Tag className={`bank-status bank-status--${view.tone}`}>{transferStatusText[item.status]}</Tag></div><div className="transfer-result__field"><label>转出账户</label><strong>账户 {item.sourceAccountId}</strong></div><div className="transfer-result__field"><label>核心参考号</label><strong>{item.coreReference ?? '处理中生成'}</strong></div><div className="transfer-result__field"><label>收款账户</label><strong>{item.maskedDestinationAccount ?? `账户 ${item.destinationAccountId ?? '—'}`} {item.beneficiaryName ? `（${item.beneficiaryName}）` : ''}</strong></div><div className="transfer-result__field"><label>创建时间</label><strong>{dateTime(item.createdAt)}</strong></div><div className="transfer-result__field"><label>转账金额</label><strong className="transfer-result__amount">{money(item.amount, item.currency)}</strong></div><div className="transfer-result__field"><label>备注</label><strong>{item.reference ?? '—'}</strong></div>{item.failureDetail ? <div className="transfer-result__field"><label>失败原因</label><strong>{item.failureDetail}</strong></div> : null}</div></div><div className="transfer-result__actions"><Button danger onClick={() => navigate('/transfers/new')}>再转一笔</Button><Button type="primary" onClick={() => navigate('/transfers')}>返回转账列表</Button></div></section></PageContainer>;
}
