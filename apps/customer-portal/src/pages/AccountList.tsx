import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import type { AccountSummary } from '@localbank/bank-api-client';
import { money } from '@localbank/bank-ui-kit';
import { useNavigate } from 'react-router-dom';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function AccountList(): JSX.Element {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['accounts'], queryFn: () => customerApi.listAccounts() });
  const items = query.data?.items ?? [];
  const columns: TableProps<AccountSummary>['columns'] = [
    { title: '账号', dataIndex: 'maskedAccountNumber', render: (value) => <strong>{value}</strong> },
    { title: '账户类型', dataIndex: 'accountType', render: (value) => value ?? '银行账户' },
    { title: '币种', dataIndex: 'currency', width: 110 },
    { title: '可用余额', width: 210, render: (_, item) => <strong>{money(item.balance, item.currency)}</strong> },
    { title: '状态', dataIndex: 'status', width: 130, render: (value) => <Tag color={value === 'ACTIVE' || !value ? 'green' : 'default'}>{value === 'ACTIVE' || !value ? '正常' : value}</Tag> },
    { title: '操作', width: 100, render: (_, item) => <Button type="link" onClick={(event) => { event.stopPropagation(); navigate(`/accounts/${item.accountId}`); }}>查看</Button> },
  ];
  return <PageContainer pageId="customer.accounts" state="READY">
    <section className="customer-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : items.length ? 'NORMAL' : 'EMPTY'}>
      <div className="customer-page-head"><div><h1>账户列表</h1><p>查看您在复兴银行关联的全部账户。</p></div><Button type="primary" size="large" onClick={() => navigate('/transfers/new')}>新建转账</Button></div>
      {query.isLoading ? <div className="bank-card customer-table-card"><Skeleton active paragraph={{ rows: 8 }} /></div> : null}
      {query.isError ? <Alert type="error" showIcon message="账户列表加载失败" action={<Button onClick={() => void query.refetch()}>重新加载</Button>} /> : null}
      {!query.isLoading && !query.isError && items.length === 0 ? <div className="bank-card customer-empty"><Empty description="暂无账户" /></div> : null}
      {!query.isLoading && !query.isError && items.length ? <div className="bank-card customer-table-card"><Table columns={columns} dataSource={items} rowKey="accountId" pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }} onRow={(item) => ({ tabIndex: 0, onClick: () => navigate(`/accounts/${item.accountId}`), onKeyDown: (event) => { if (event.key === 'Enter') navigate(`/accounts/${item.accountId}`); } })} /></div> : null}
    </section>
  </PageContainer>;
}
