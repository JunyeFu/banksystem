import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Empty, Input, Select, Skeleton, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import type { AccountTransaction } from '@localbank/bank-api-client';
import { dateTime, money } from '@localbank/bank-ui-kit';
import { useNavigate, useParams } from 'react-router-dom';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function AccountDetail(): JSX.Element {
  const { accountId = '' } = useParams();
  const navigate = useNavigate();
  const [exportError, setExportError] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<'transactions' | 'information' | 'documents'>('transactions');
  const [transactionType, setTransactionType] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [transactionKeyword, setTransactionKeyword] = useState('');
  const [transactionRange, setTransactionRange] = useState<[string, string] | undefined>();
  const query = useQuery({ queryKey: ['account', accountId], queryFn: () => customerApi.getAccount(accountId), enabled: Boolean(accountId) });
  const columns: TableProps<AccountTransaction>['columns'] = [
    { title: '交易时间', dataIndex: 'transactionDate', width: 190, render: dateTime },
    { title: '交易类型', dataIndex: 'transactionType', width: 110, render: (value) => value === 'DEBIT' ? '转出' : '转入' },
    { title: '交易说明', render: (_, item) => <span><strong>{item.counterparty ?? item.description}</strong><br/><small className="bank-muted">{item.description}</small></span> },
    { title: '金额', width: 180, render: (_, item) => <strong className={item.transactionType === 'DEBIT' ? 'bank-danger' : 'bank-success'}>{item.transactionType === 'DEBIT' ? '−' : '+'}{money(item.amount, item.currency)}</strong> },
    { title: '余额', width: 180, render: (_, item) => item.runningBalance ? money(item.runningBalance, item.currency) : '—' },
  ];
  const downloadStatement = async (): Promise<void> => {
    setExportError(undefined); setExporting(true);
    try {
      const blob = await customerApi.downloadStatement(accountId, 'csv');
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `account-${accountId}-statement.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setExportError(error instanceof Error ? error.message : '账户交易导出失败'); }
    finally { setExporting(false); }
  };
  // Hooks must be called in the same order for the loading and loaded render.
  // Using an empty list until the query resolves prevents the account-detail
  // page from blanking on React's hook-order invariant.
  const transactions = query.data?.transactions ?? [];
  const filteredTransactions = useMemo(() => transactions.filter((item) => {
    if (transactionType !== 'ALL' && item.transactionType !== transactionType) return false;
    const day = String(item.transactionDate).slice(0, 10);
    if (transactionRange && (day < transactionRange[0] || day > transactionRange[1])) return false;
    const haystack = `${item.counterparty ?? ''} ${item.description ?? ''} ${item.amount}`.toLowerCase();
    return !transactionKeyword.trim() || haystack.includes(transactionKeyword.trim().toLowerCase());
  }), [transactions, transactionKeyword, transactionRange, transactionType]);
  if (query.isLoading) return <PageContainer pageId="customer.account.detail" state="READY"><section className="customer-page"><div className="customer-breadcrumb">账户列表　/　<strong>账户详情</strong></div><div className="customer-page-head"><div><h1>账户详情</h1><p>正在读取账户信息与最近交易。</p></div></div><div className="bank-card customer-table-card"><Skeleton active paragraph={{ rows: 12 }} /></div></section></PageContainer>;
  if (query.isError || !query.data) return <PageContainer pageId="customer.account.detail" state="READY"><section className="customer-page"><div className="customer-breadcrumb">账户列表　/　<strong>账户详情</strong></div><div className="customer-page-head"><div><h1>账户详情</h1><p>查看账户信息和交易记录。</p></div></div><Alert type="error" showIcon message="账户详情加载失败" description="账户不存在、无权访问或服务暂时不可用。" action={<Button onClick={() => void query.refetch()}>重新加载</Button>} /></section></PageContainer>;
  const account = query.data;
  return <PageContainer pageId="customer.account.detail" state="READY">
    <section className="customer-page account-detail" data-view-state={account.transactions.length ? 'NORMAL' : 'EMPTY'}>
      <div className="customer-breadcrumb">账户列表　/　<strong>账户详情</strong></div>
      <div className="account-detail-head"><div><Button onClick={() => navigate('/accounts')} aria-label="返回账户列表">←</Button><h1>{account.accountType ?? '银行账户'}（{account.maskedAccountNumber}）</h1><Tag color={account.status === 'ACTIVE' || !account.status ? 'green' : 'default'}>{account.status === 'ACTIVE' || !account.status ? '正常' : account.status}</Tag></div><div><Button loading={exporting} onClick={() => void downloadStatement()}>导出交易</Button><Button type="primary" onClick={() => navigate(`/transfers/new?sourceAccountId=${encodeURIComponent(account.accountId)}`)}>新增转账</Button></div></div>
      {exportError ? <Alert type="error" showIcon message="交易导出失败" description={exportError} closable onClose={() => setExportError(undefined)} /> : null}
      <div className="bank-card account-summary-grid"><div><span>可用余额（{account.currency}）</span><strong className="bank-accent">{money(account.balance, account.currency).replace(` ${account.currency}`, '')}</strong></div><div><span>账户类型</span><strong>{account.accountType ?? '银行账户'}</strong></div><div><span>币种</span><strong>{account.currency}</strong></div><div><span>开户日期</span><strong>{account.openedOn ?? '—'}</strong></div></div>
      <div className="account-tabs" role="tablist"><button className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')} role="tab" aria-selected={tab === 'transactions'}>交易记录</button><button className={tab === 'information' ? 'active' : ''} onClick={() => setTab('information')} role="tab" aria-selected={tab === 'information'}>账户信息</button><button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')} role="tab" aria-selected={tab === 'documents'}>账户文件</button></div>
      {tab === 'transactions' ? <div className="bank-card customer-table-card account-transactions">
        <Space wrap style={{ marginBottom: 16 }}><Select value={transactionType} onChange={setTransactionType} options={[{ value: 'ALL', label: '全部类型' }, { value: 'CREDIT', label: '转入' }, { value: 'DEBIT', label: '转出' }]} data-testid="account-transaction-type-filter" style={{ minWidth: 120 }} />
          <DatePicker.RangePicker onChange={(value) => setTransactionRange(value?.[0] && value[1] ? [value[0].format('YYYY-MM-DD'), value[1].format('YYYY-MM-DD')] : undefined)} data-testid="account-transaction-date-filter" />
          <Input.Search placeholder="搜索交易说明、对手方或金额" value={transactionKeyword} onChange={(event) => setTransactionKeyword(event.target.value)} data-testid="account-transaction-search" style={{ width: 260 }} />
          <Button onClick={() => { setTransactionType('ALL'); setTransactionKeyword(''); setTransactionRange(undefined); }} data-testid="account-transaction-filter-reset">重置</Button></Space>
        {account.transactions.length ? filteredTransactions.length ? <Table columns={columns} dataSource={filteredTransactions} rowKey="transactionId" pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 条` }} /> : <Empty description="没有符合筛选条件的交易" /> : <Empty description="暂无交易记录" />}
      </div> : null}
      {tab === 'information' ? <div className="bank-card account-information" role="tabpanel"><dl><div><dt>账户编号</dt><dd data-testid="account-detail-id">{account.accountId}</dd></div><div><dt>账号</dt><dd>{account.maskedAccountNumber}</dd></div><div><dt>账户类型</dt><dd>{account.accountType ?? '银行账户'}</dd></div><div><dt>账户状态</dt><dd>{account.status ?? 'ACTIVE'}</dd></div><div><dt>币种</dt><dd>{account.currency}</dd></div><div><dt>开户日期</dt><dd>{account.openedOn ?? '—'}</dd></div></dl></div> : null}
      {tab === 'documents' ? <div className="bank-card account-documents" role="tabpanel"><div><h2>账户文件</h2><p>对账单和账户相关业务文件统一保存在文档中心。</p></div><Button type="primary" onClick={() => navigate('/documents')}>前往文档中心</Button></div> : null}
    </section>
  </PageContainer>;
}
