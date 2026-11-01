import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Drawer, Empty, Input, Modal, Result, Select, Skeleton, Table, Tag } from 'antd';
import type { OperationsApproval, OperationsApprovalActionResult, OperationsApprovalStatus } from '@localbank/bank-api-client';
import { BankApiError } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

type Action = 'approve' | 'reject';
const statusLabels: Record<string, string> = { PENDING: '待审批', CORE_RESULT_UNKNOWN: '核心结果待确认', CONFIRMED: '已确认冲正', REJECTED: '已拒绝' };
const statusColors: Record<string, string> = { PENDING: 'orange', CORE_RESULT_UNKNOWN: 'gold', CONFIRMED: 'green', REJECTED: 'red' };

export function Approvals(): JSX.Element {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<OperationsApprovalStatus | undefined>();
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<OperationsApproval | null>(null);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [result, setResult] = useState<OperationsApprovalActionResult | null>(null);
  const query = useQuery({ queryKey: ['operations-approvals', status], queryFn: () => operationsApi.listApprovals(status), retry: false });
  const rows = useMemo(() => (query.data ?? []).filter((item) => !keyword || `${item.transferId}${item.creator}${item.reason}`.toLowerCase().includes(keyword.toLowerCase())), [query.data, keyword]);
  const mutation = useMutation({
    mutationFn: async (kind: Action) => {
      if (!selected) throw new Error('未选择审批记录');
      const key = crypto.randomUUID();
      return kind === 'approve' ? operationsApi.approveReversal(selected.reversalId, selected.version, reason, key) : operationsApi.rejectReversal(selected.reversalId, selected.version, reason, key);
    },
    onSuccess: (value) => { setResult(value); setAction(null); void queryClient.invalidateQueries({ queryKey: ['operations-approvals'] }); },
    onError: () => setAction(null),
  });
  const noPermission = query.error instanceof BankApiError && query.error.status === 403;
  let state = query.isLoading ? 'LOADING' : noPermission ? 'NO_PERMISSION' : query.isError ? 'ERROR' : rows.length === 0 ? 'EMPTY' : status === 'PENDING' ? 'PENDING_APPROVAL' : 'NORMAL';
  if (selected) state = result?.status === 'CONFIRMED' ? 'APPROVED_RESULT' : result?.status === 'REJECTED' ? 'REJECTED_RESULT' : mutation.isPending ? `${action === 'reject' ? 'REJECT' : 'APPROVE'}_SUBMITTING` : mutation.error instanceof BankApiError && mutation.error.status === 409 ? 'VERSION_CONFLICT' : action ? `${action === 'reject' ? 'REJECT' : 'APPROVE'}_CONFIRM_DIALOG` : reason ? 'DRAWER_REASON_FILLED' : 'DRAWER_OPEN_EMPTY_REASON';
  const closeDrawer = () => { setSelected(null); setReason(''); setAction(null); setResult(null); mutation.reset(); };
  const requestAction = (kind: Action) => { if (!reason.trim()) return; setAction(kind); };

  return <section className="ops-approval-page" data-page-id="operations.approvals" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">运营控制台　/　异常处理</p><h1>审批队列</h1><span>执行转账冲正的 Maker-Checker 复核，审批理由与版本校验全程留痕。</span></div><Button onClick={() => void query.refetch()}>↻　刷新</Button></div>
    {noPermission ? <Result status="403" title="无审批权限" subTitle="当前账号没有查看或处理审批队列的权限，请联系系统管理员配置 PAYMENT_APPROVER 角色。" /> : query.isError ? <Alert type="error" showIcon message="审批队列加载失败" description="无法读取审批数据，请检查服务状态后重试。" action={<Button onClick={() => void query.refetch()}>重试</Button>} /> : <>
      <div className="ops-risk-metrics ops-risk-metrics--three">
        {query.isLoading ? [0,1,2].map((key) => <Card key={key}><Skeleton active paragraph={false} /></Card>) : <>
          <Card><span>审批总数</span><strong>{query.data?.length ?? 0}</strong><small>当前查询范围</small></Card>
          <Card><span>待审批</span><strong className="danger">{query.data?.filter((item) => item.status === 'PENDING').length ?? 0}</strong><small>需要 Checker 处理</small></Card>
          <Card><span>今日已处理</span><strong className="success">{query.data?.filter((item) => item.status !== 'PENDING').length ?? 0}</strong><small>批准及拒绝合计</small></Card>
        </>}
      </div>
      <Card className="ops-risk-filter ops-approval-filter"><Select value={status} allowClear placeholder="全部状态" onChange={setStatus} options={Object.entries(statusLabels).map(([value,label]) => ({ value,label }))} data-testid="approval-status-filter" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="交易编号、创建人或申请原因" allowClear /><Button type="primary" onClick={() => void query.refetch()}>查询</Button></Card>
      <Card className="ops-risk-table" title="审批事项" extra={<span>共 {rows.length} 条</span>}>
        {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={status ? '当前状态下暂无审批事项' : '暂无审批事项'} /> : <Table rowKey="approvalId" dataSource={rows} pagination={{ pageSize: 10 }} columns={[
          { title: '审批编号', dataIndex: 'approvalId', width: 120, render: (value: string) => <code>{value.slice(0,8).toUpperCase()}</code> },
          { title: '关联交易', dataIndex: 'transferId', width: 125, render: (value: string) => <span className="ops-link">{value.slice(0,8).toUpperCase()}</span> },
          { title: '申请类型', width: 110, render: () => '转账冲正' },
          { title: '金额', width: 140, render: (_: unknown, item: OperationsApproval) => `${item.currency} ${Number(item.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` },
          { title: '创建人', dataIndex: 'creator', width: 125 },
          { title: '申请原因', dataIndex: 'reason', ellipsis: true },
          { title: '版本', dataIndex: 'version', width: 70 },
          { title: '创建时间', dataIndex: 'createdAt', width: 155, render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }) },
          { title: '状态', dataIndex: 'status', width: 95, render: (value: string) => <Tag color={statusColors[value]}>{statusLabels[value]}</Tag> },
          { title: '操作', width: 75, render: (_: unknown, item: OperationsApproval) => <Button type="link" onClick={() => { setSelected(item); setReason(''); setResult(null); mutation.reset(); }} data-testid={`approval-open-${item.approvalId}`}>{item.status === 'PENDING' ? '审批' : '详情'}</Button> },
        ]} />}
      </Card>
    </>}

    <Drawer title="审批详情" width={620} open={selected !== null} onClose={closeDrawer} destroyOnClose={false} data-testid="approval-drawer">
      {selected ? result ? <Result status={result.status === 'CORE_RESULT_UNKNOWN' ? 'warning' : 'success'} title={result.status === 'CONFIRMED' ? '冲正已由核心确认' : result.status === 'CORE_RESULT_UNKNOWN' ? '核心冲正结果待确认' : '审批已拒绝'} subTitle={`审批版本为 ${result.version}，当前状态：${statusLabels[result.status] ?? result.status}。`} extra={<Button type="primary" onClick={closeDrawer}>返回审批队列</Button>} /> : <>
        <div className="ops-approval-summary"><Tag color={statusColors[selected.status]}>{statusLabels[selected.status]}</Tag><h2>转账冲正申请</h2><p>{selected.reason}</p></div>
        <Descriptions column={1} bordered size="small" items={[
          { key: 'transfer', label: '关联交易', children: selected.transferId }, { key: 'amount', label: '交易金额', children: `${selected.currency} ${Number(selected.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` },
          { key: 'accounts', label: '账户方向', children: `${selected.sourceAccountId} → ${selected.destinationAccountId}` }, { key: 'maker', label: 'Maker', children: selected.creator }, { key: 'version', label: '当前版本', children: selected.version },
        ]} />
        {mutation.error instanceof BankApiError && mutation.error.status === 409 ? <Alert className="ops-approval-alert" type="error" showIcon message="审批版本冲突" description="该审批事项已被其他操作员处理。请关闭详情并刷新队列后重试。" /> : null}
        {selected.status === 'PENDING' ? <div className="ops-approval-reason"><label>审批理由 <b>*</b></label><Input.TextArea rows={4} maxLength={240} showCount value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请输入批准或拒绝理由" data-testid="approval-reason" /><small>审批理由将写入不可篡改审计记录。</small><div><Button type="primary" disabled={!reason.trim()} onClick={() => requestAction('approve')} data-testid="approval-approve">批准</Button><Button danger disabled={!reason.trim()} onClick={() => requestAction('reject')} data-testid="approval-reject">拒绝</Button></div></div> : <Alert className="ops-approval-alert" type="info" showIcon message={`该事项已由 ${selected.checker ?? '审批人员'} 处理`} />}
      </> : null}
    </Drawer>
    <Modal open={action !== null} title={action === 'approve' ? '确认批准审批' : '确认拒绝审批'} onCancel={() => !mutation.isPending && setAction(null)} closable={!mutation.isPending} maskClosable={false} footer={[
      <Button key="cancel" disabled={mutation.isPending} onClick={() => setAction(null)}>取消</Button>,
      <Button key="confirm" type="primary" danger={action === 'reject'} loading={mutation.isPending} onClick={() => action && mutation.mutate(action)} data-testid="approval-confirm">{action === 'approve' ? '确认批准' : '确认拒绝'}</Button>,
    ]}><p>您正在{action === 'approve' ? '批准' : '拒绝'}此转账冲正申请。提交后将执行版本校验并记录审计事件。</p><blockquote>{reason}</blockquote></Modal>
  </section>;
}
