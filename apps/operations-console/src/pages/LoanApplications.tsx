import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Descriptions, Drawer, Empty, Input, InputNumber, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { OperationsLoanApplication, OperationsLoanApplicationDetail, OperationsLoanApproval } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const statusText: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '待评分', SCORED: '待送审', APPROVED: '已审批',
  CORE_SUBMITTED: '已进入核心', DISBURSED: '已放款', CLOSED: '已结清', REJECTED: '已拒绝',
};

export function LoanApplications(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [reason, setReason] = useState('资料完整，申请信息与评分结果一致');
  const [approvedAmount, setApprovedAmount] = useState<number>(0);
  const [annualInterestRate, setAnnualInterestRate] = useState<number>(4.35);
  const query = useQuery({ queryKey: ['operations-loan-applications'], queryFn: () => operationsApi.listLoanApplications(), retry: false });
  const detail = useQuery({ queryKey: ['operations-loan-application', selectedId], queryFn: () => operationsApi.getLoanApplication(selectedId!), enabled: Boolean(selectedId), retry: false });
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['operations-loan-applications'] });
    await queryClient.invalidateQueries({ queryKey: ['operations-loan-application', selectedId] });
  };
  const action = useMutation({
    mutationFn: async (input: { kind: 'score' | 'request' | 'approve' | 'core'; item: OperationsLoanApplicationDetail }) => {
      if (input.kind === 'score') return operationsApi.scoreLoanApplication(input.item.applicationId, input.item.version);
      if (input.kind === 'request') return operationsApi.requestLoanApproval(input.item.applicationId, input.item.version, reason);
      if (input.kind === 'core') return operationsApi.submitLoanApplicationToCore(input.item.applicationId, crypto.randomUUID());
      const pending = input.item.approvals.find((approval) => approval.status === 'PENDING');
      if (!pending) throw new Error('当前申请没有待复核审批');
      return operationsApi.approveLoanApplication(pending.approvalId, {
        version: pending.version,
        approvedAmount: approvedAmount.toFixed(2),
        annualInterestRate: annualInterestRate.toFixed(4),
        reason,
      });
    },
    onSuccess: refresh,
  });
  const open = (item: OperationsLoanApplication): void => {
    setSelectedId(item.applicationId);
    setApprovedAmount(Number(item.approvedAmount ?? item.amount));
    setAnnualInterestRate(Number(item.approvedAnnualInterestRate ?? item.quotedAnnualInterestRate));
    action.reset();
  };
  const columns: ColumnsType<OperationsLoanApplication> = [
    { title: '申请编号', dataIndex: 'applicationId', width: 210, ellipsis: true },
    { title: '客户主体', dataIndex: 'subject', width: 180, ellipsis: true },
    { title: '金额', render: (_, item) => `${item.amount} ${item.currency}`, width: 140 },
    { title: '期限', dataIndex: 'termMonths', render: (value) => `${value} 个月`, width: 95 },
    { title: '用途', dataIndex: 'purpose' },
    { title: '评分', dataIndex: 'score', render: (value) => value ?? '—', width: 75 },
    { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'CORE_SUBMITTED' ? 'green' : 'blue'}>{statusText[value] ?? value}</Tag>, width: 110 },
    { title: '核心贷款号', dataIndex: 'coreLoanId', render: (value) => value ?? '—', width: 110 },
    { title: '操作', render: (_, item) => <Button type="link" onClick={() => open(item)}>处理</Button>, width: 75 },
  ];
  const current = detail.data;
  const pendingApproval: OperationsLoanApproval | undefined = current?.approvals.find((approval) => approval.status === 'PENDING');
  return <PageContainer pageId="operations.loans" state="READY"><section data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : query.data?.items.length ? 'NORMAL' : 'EMPTY'}>
    <div className="ops-breadcrumb">首页　/　贷款审批</div><h1 className="ops-page-title">贷款申请</h1><p className="ops-page-lead">按版本推进评分、Maker 送审、Checker 复核与 Fineract 核心提交。</p>
    {query.isError ? <Alert type="error" showIcon message="贷款申请加载失败" action={<Button onClick={() => void query.refetch()}>重试</Button>} /> : null}
    <div className="bank-card ops-table-card">{query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : query.data?.items.length ? <Table rowKey="applicationId" dataSource={query.data.items} columns={columns} scroll={{ x: 1150 }} pagination={{ pageSize: 10 }} /> : !query.isError ? <Empty description="暂无贷款申请" /> : null}</div>
    <Drawer title="贷款申请处理" width={680} open={Boolean(selectedId)} onClose={() => setSelectedId(undefined)}>
      {detail.isLoading ? <Skeleton active /> : detail.isError ? <Alert type="error" showIcon message="申请详情加载失败" /> : current ? <>
        <Descriptions bordered size="small" column={1} items={[
          { key: 'id', label: '申请编号', children: current.applicationId },
          { key: 'subject', label: '客户主体', children: current.subject },
          { key: 'amount', label: '申请金额', children: `${current.amount} ${current.currency}` },
          { key: 'status', label: '当前状态', children: <Tag color="blue">{statusText[current.status] ?? current.status}</Tag> },
          { key: 'version', label: '状态版本', children: current.version },
          { key: 'score', label: '评分', children: current.score ?? '未评分' },
          { key: 'documents', label: '申请材料', children: `${current.documents.length} 份` },
          { key: 'approval', label: '待复核审批', children: pendingApproval ? `${pendingApproval.approvalId}（Maker: ${pendingApproval.makerSubject ?? '—'}）` : '无' },
        ]} />
        {action.isError ? <Alert style={{ marginTop: 16 }} type="error" showIcon message={action.error.message} /> : null}
        <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
          {(current.status === 'SCORED' || pendingApproval) ? <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={240} placeholder="审批理由" /> : null}
          {pendingApproval ? <><InputNumber value={approvedAmount} onChange={(value) => setApprovedAmount(value ?? 0)} min={0.01} precision={2} addonBefore="审批金额" style={{ width: '100%' }} /><InputNumber value={annualInterestRate} onChange={(value) => setAnnualInterestRate(value ?? 0)} min={0.0001} precision={4} addonBefore="年利率" addonAfter="%" style={{ width: '100%' }} /></> : null}
          {current.status === 'SUBMITTED' ? <Button type="primary" loading={action.isPending} onClick={() => action.mutate({ kind: 'score', item: current })}>执行评分</Button> : null}
          {current.status === 'SCORED' && !pendingApproval ? <Button type="primary" loading={action.isPending} disabled={!reason.trim()} onClick={() => action.mutate({ kind: 'request', item: current })}>Maker 提交复核</Button> : null}
          {pendingApproval ? <Button type="primary" loading={action.isPending} disabled={!reason.trim() || approvedAmount <= 0 || annualInterestRate <= 0} onClick={() => action.mutate({ kind: 'approve', item: current })}>Checker 批准</Button> : null}
          {current.status === 'APPROVED' ? <Button type="primary" loading={action.isPending} onClick={() => action.mutate({ kind: 'core', item: current })}>提交 Fineract</Button> : null}
        </div>
      </> : null}
    </Drawer>
  </section></PageContainer>;
}
