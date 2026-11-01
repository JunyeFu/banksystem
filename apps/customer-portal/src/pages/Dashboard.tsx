import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { money } from '@localbank/bank-ui-kit';
import { useNavigate } from 'react-router-dom';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const customer = useQuery({ queryKey: ['current-customer'], queryFn: () => customerApi.getCurrentCustomer() });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => customerApi.listAccounts() });
  const items = accounts.data?.items ?? [];
  const currency = items[0]?.currency ?? 'CNY';
  const total = items.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const loading = customer.isLoading || accounts.isLoading;
  const error = customer.isError || accounts.isError;
  const refresh = (): void => { void customer.refetch(); void accounts.refetch(); };

  return <PageContainer pageId="customer.dashboard" state="READY">
    <section className="customer-page" data-view-state={loading ? 'LOADING' : error ? 'ERROR' : items.length ? 'NORMAL' : 'EMPTY'}>
      <div className="customer-page-head customer-page-head--dashboard">
        <div><h1>您好，{customer.data?.displayName ?? '客户'}</h1><p>欢迎回来，以下是您在复兴银行的账户概况。</p></div>
        <Button size="large" onClick={refresh} disabled={loading} data-testid="dashboard-refresh">↻　刷新</Button>
      </div>
      {error ? <Alert type="error" showIcon message="账户概览加载失败" description="请检查网络连接后重试。" action={<Button onClick={refresh}>重新加载</Button>} data-testid="dashboard-error" /> : null}
      {loading ? <Skeleton active paragraph={{ rows: 12 }} /> : !error && items.length === 0 ? <div className="bank-card customer-empty"><Empty description="当前没有可展示的账户" /></div> : null}
      {!loading && !error && items.length > 0 ? <>
        <div className="dashboard-stat-grid">
          <div className="bank-card dashboard-stat"><span>我的资产（等值 {currency}）</span><strong className="bank-accent" data-testid="dashboard-total-assets">{money(total.toFixed(2), currency).replace(` ${currency}`, '')}</strong></div>
          <div className="bank-card dashboard-stat"><span>账户数量</span><strong data-testid="dashboard-account-count">{items.length}</strong><small>个已关联账户</small></div>
          <div className="bank-card dashboard-stat"><span role="heading" aria-level={2}>可用余额（{currency}）</span><strong data-testid="dashboard-available-balance">{money(total.toFixed(2), currency).replace(` ${currency}`, '')}</strong></div>
          <button className="bank-card dashboard-stat dashboard-stat--action" onClick={() => navigate('/documents')}><span>银行文件</span><strong>▤</strong><small>查看账单与业务文件</small></button>
        </div>
        <div className="dashboard-quick bank-card" aria-label="快捷入口">
          <button onClick={() => navigate('/transfers/new')}><b>↗</b><span>新建转账</span></button>
          <button onClick={() => navigate('/beneficiaries')}><b>人</b><span>管理收款人</span></button>
          <button onClick={() => navigate('/loans/apply')}><b>▧</b><span>申请贷款</span></button>
          <button onClick={() => navigate('/documents')}><b>↓</b><span>下载文档</span></button>
        </div>
        <div className="dashboard-account-head"><h2>我的账户</h2><Button type="link" onClick={() => navigate('/accounts')}>查看全部　›</Button></div>
        <div className="bank-card dashboard-account-list">
          {items.map((item) => {
            const active = !item.status || item.status.toUpperCase() === 'ACTIVE';
            return <button key={item.accountId} data-testid={`dashboard-account-${item.accountId}`} onClick={() => navigate(`/accounts/${item.accountId}`)}>
              <span className="account-roundel">◉</span><span><strong>{item.accountType ?? '银行账户'}</strong><small>{item.maskedAccountNumber}</small></span>
              <Tag color={active ? 'green' : 'default'}>{active ? '正常' : item.status}</Tag>
              <strong className="dashboard-account-balance">{money(item.balance, item.currency)}</strong><span>›</span>
            </button>;
          })}
        </div>
        <Button className="dashboard-transfer-cta" size="large" onClick={() => navigate('/transfers/new')}>＋　新建转账</Button>
      </> : null}
    </section>
  </PageContainer>;
}
