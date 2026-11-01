import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton } from 'antd';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

/** Local demonstration only: no PIN, OTP, or native U-key window is collected. */
export function TransferVerification(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const transferId = params.get('transferId') ?? '';
  const query = useQuery({ queryKey: ['customer-transfer-verification', transferId], queryFn: () => customerApi.getTransfer(transferId), enabled: Boolean(transferId) });
  const confirmation = useMutation({
    mutationFn: () => customerApi.confirmTransfer(transferId),
    onSuccess: (result) => navigate(`/transfers/${encodeURIComponent(result.transferId)}`, { replace: true }),
  });
  if (query.isLoading) return <PageContainer pageId="customer.transfer.verification" state="READY"><Skeleton active paragraph={{ rows: 6 }} /></PageContainer>;
  if (query.isError || !query.data) return <PageContainer pageId="customer.transfer.verification" state="READY"><Empty description="未找到待验证的转账"><Button onClick={() => navigate('/transfers')}>返回转账列表</Button></Empty></PageContainer>;
  return <PageContainer pageId="customer.transfer.verification" state="READY"><section className="customer-page" data-testid="transfer-verification-page">
    <div className="customer-breadcrumb">转账　/　<strong>网页验证</strong></div><h1>持久化 U 盾验证</h1>
    <Alert type="info" showIcon message="本机演示验证" description="已持久化的网页验证只需确认，不会读取、输入或保存 PIN、OTP、验证码，也不会操作原生 U 盾窗口。" />
    {confirmation.isError ? <Alert type="error" showIcon message="转账确认失败" description={confirmation.error instanceof Error ? confirmation.error.message : '确认请求失败'} style={{ marginTop: 20 }} data-testid="verification-error" /> : null}
    <div className="bank-card" style={{ marginTop: 20 }}><p>转账参考号：<strong data-testid="verification-transfer-id">{query.data.transferId}</strong></p>
      <Button type="primary" size="large" loading={confirmation.isPending} data-testid="ukey-verify-control" onClick={() => confirmation.mutate()}>确认验证并查看结果</Button>
    </div>
  </section></PageContainer>;
}
