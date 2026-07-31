import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Skeleton, Tag } from 'antd';
import { customerApi } from '@/api/client';
import { money, transferStatusText } from '@localbank/bank-ui-kit';
import { PageContainer } from '@/components/PageContainer';

export function OrderQuery(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const transferId = params.get('transferId') ?? '';
  const query = useQuery({ queryKey: ['customer-order-query', transferId], queryFn: () => customerApi.getTransfer(transferId), enabled: Boolean(transferId), refetchInterval: 1500 });
  if (query.isLoading) return <PageContainer pageId="customer.transfer.order.query" state="READY"><Skeleton active paragraph={{ rows: 6 }} /></PageContainer>;
  if (query.isError || !query.data) return <PageContainer pageId="customer.transfer.order.query" state="READY"><Empty description="未找到转账单号"><Button onClick={() => navigate('/transfers')}>返回转账列表</Button></Empty></PageContainer>;
  const item = query.data;
  return <PageContainer pageId="customer.transfer.order.query" state="READY"><section className="customer-page" data-testid="order-query-page">
    <div className="customer-breadcrumb">转账　/　<strong>单号查询</strong></div><h1>转账单号查询</h1>
    <div className="bank-card"><dl className="account-information"><div><dt>转账单号</dt><dd data-testid="transfer-order-number">{item.transferId}</dd></div><div><dt>当前状态</dt><dd data-testid="transfer-order-status"><Tag>{transferStatusText[item.status]}</Tag></dd></div><div><dt>收款人</dt><dd data-testid="order-beneficiary">{item.beneficiaryName ?? item.maskedDestinationAccount ?? '处理中'}</dd></div><div><dt>转账金额</dt><dd data-testid="order-amount">{money(item.amount, item.currency)}</dd></div></dl>
      <Button type="primary" onClick={() => navigate(`/transfers/${encodeURIComponent(transferId)}`)}>查看转账详情</Button>
    </div>
  </section></PageContainer>;
}
