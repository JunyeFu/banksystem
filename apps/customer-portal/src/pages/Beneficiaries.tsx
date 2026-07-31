import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Empty, Form, Input, Modal, Select, Skeleton, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Beneficiary } from '@localbank/bank-api-client';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';
import { useNavigate } from 'react-router-dom';

export function Beneficiaries(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'ALL' | 'VERIFIED'>('ALL');
  const [form] = Form.useForm<{ displayName: string; accountNumber: string }>();
  const query = useQuery({ queryKey: ['beneficiaries'], queryFn: () => customerApi.listBeneficiaries() });
  const create = useMutation({
    mutationFn: (value: { displayName: string; accountNumber: string }) => customerApi.createBeneficiary(value),
    onSuccess: async () => { setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ['beneficiaries'] }); },
  });
  const items = query.data?.items ?? [];
  const filteredItems = useMemo(() => items.filter((item) => {
    if (status === 'VERIFIED' && !item.beneficiaryId) return false;
    const candidate = `${item.displayName} ${item.maskedAccountNumber}`.toLowerCase();
    return !keyword.trim() || candidate.includes(keyword.trim().toLowerCase());
  }), [items, keyword, status]);
  const columns: ColumnsType<Beneficiary> = [
    { title: '姓名', dataIndex: 'displayName', key: 'name' },
    { title: '账户号', dataIndex: 'maskedAccountNumber', key: 'account' },
    { title: '核验状态', key: 'verified', render: () => <Tag color="green">复兴银行已核验</Tag> },
    { title: '添加时间', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => value.slice(0, 10) },
    { title: '操作', key: 'action', render: (_: unknown, item: Beneficiary) => <Button type="link" onClick={() => navigate(`/transfers/new?beneficiaryId=${encodeURIComponent(item.beneficiaryId)}`)} data-testid={`beneficiary-transfer-${item.beneficiaryId}`}>发起转账</Button> },
  ];
  return <PageContainer pageId="customer.beneficiaries" state="READY">
    <section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : items.length ? 'NORMAL' : 'EMPTY'}>
      <div className="customer-page-head"><div><h1>收款人管理</h1><p>维护经过复兴银行账户目录核验的常用收款人。</p></div><Button type="primary" size="large" onClick={() => setOpen(true)}>＋ 新增收款人</Button></div>
      {query.isError ? <Alert type="error" showIcon message="收款人加载失败" action={<Button onClick={() => query.refetch()}>重新加载</Button>} /> : null}
      <div className="bank-card customer-table-card">
        <Space wrap style={{ marginBottom: 16 }}><Input.Search value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索收款人姓名或掩码账号" data-testid="beneficiary-search" style={{ width: 280 }} />
          <Select value={status} onChange={setStatus} options={[{ value: 'ALL', label: '全部状态' }, { value: 'VERIFIED', label: '已核验' }]} data-testid="beneficiary-status-filter" style={{ width: 130 }} />
          <Button onClick={() => { setKeyword(''); setStatus('ALL'); }} data-testid="beneficiary-filter-reset">重置</Button></Space>
        {query.isLoading ? <Skeleton active paragraph={{ rows: 7 }} /> : items.length ? filteredItems.length ? <Table columns={columns} dataSource={filteredItems} rowKey="beneficiaryId" pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }} /> : <Empty description="没有符合筛选条件的收款人" /> : !query.isError ? <div className="customer-empty"><Empty description="暂无收款人" /></div> : null}
      </div>
      <Modal title="新增收款人" open={open} okText="确认添加" cancelText="取消" confirmLoading={create.isPending} onCancel={() => setOpen(false)} onOk={() => form.submit()}>
        {create.isError ? <Alert type="error" message="添加失败，请核对账户信息后重试" showIcon /> : null}
        <Form form={form} layout="vertical" onFinish={(value) => create.mutate(value)}>
          <Form.Item label="收款人姓名" name="displayName" rules={[{ required: true, message: '请输入收款人姓名' }]}><Input maxLength={160} /></Form.Item>
          <Form.Item label="复兴银行账户号" name="accountNumber" rules={[{ required: true, min: 6, message: '请输入至少 6 位账户号' }]}><Input maxLength={64} autoComplete="off" /></Form.Item>
        </Form>
      </Modal>
    </section>
  </PageContainer>;
}
