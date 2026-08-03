import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Select, Skeleton, Table, Tag } from 'antd';
import type { OperationsReconciliationRun, OperationsReconciliationStatus, OperationsReconciliationType } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const typeLabels: Record<OperationsReconciliationType, string> = { CHANNEL_TO_CORE: '渠道与核心', CHANNEL_TO_CLEARING: '渠道与清算', CORE_TO_GENERAL_LEDGER: '核心与总账' };
const statusLabels: Record<OperationsReconciliationStatus, string> = { RUNNING: '对账中', MATCHED: '账实相符', DIFFERENCE_FOUND: '发现差异', FAILED: '执行失败' };
const statusColors: Record<OperationsReconciliationStatus, string> = { RUNNING: 'processing', MATCHED: 'success', DIFFERENCE_FOUND: 'warning', FAILED: 'error' };

export function Reconciliation(): JSX.Element {
  const client = useQueryClient();
  const [type, setType] = useState<OperationsReconciliationType>('CHANNEL_TO_CORE');
  const query = useQuery({ queryKey: ['operations-reconciliations'], queryFn: () => operationsApi.listReconciliations(), retry: false });
  const mutation = useMutation({ mutationFn: () => operationsApi.runReconciliation(type), onSuccess: () => void client.invalidateQueries({ queryKey: ['operations-reconciliations'] }) });
  const rows = query.data ?? [];
  const derived = rows.length === 0 ? 'EMPTY' : rows[0]?.status ?? 'EMPTY';
  const state = mutation.isPending ? 'RUNNING' : query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : mutation.isError ? 'FAILED' : derived;
  const differences = rows.reduce((sum, item) => sum + item.differenceCount, 0);

  return <section className="ops-settlement-page" data-page-id="operations.reconciliation" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">复兴银行运营控制台　/　资金运营</p><h1>对账中心</h1><span>核对渠道、核心、清算与总账数据，形成可追溯的差异结果。</span></div><Button onClick={() => void query.refetch()}>↻　刷新</Button></div>
    <Card className="ops-settlement-action"><div><strong>发起对账</strong><p>选择账务链路后执行实时核对。执行结果将持久化并进入审计链。</p></div><Select value={type} onChange={setType} options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))} /><Button type="primary" loading={mutation.isPending} onClick={() => mutation.mutate()} data-testid="reconciliation-run">执行对账</Button></Card>
    {query.isError ? <Alert type="error" showIcon message="对账记录加载失败" description="无法读取历史对账结果，请检查服务状态后重试。" /> : mutation.isError ? <Alert className="ops-settlement-alert" type="error" showIcon message="对账执行失败" description="本次执行未完成，请确认依赖服务状态后重试。" /> : null}
    <div className="ops-risk-metrics ops-risk-metrics--three">
      {query.isLoading ? [0, 1, 2].map((key) => <Card key={key}><Skeleton active paragraph={false} /></Card>) : <>
        <Card><span>执行次数</span><strong>{rows.length}</strong><small>当前查询范围</small></Card>
        <Card><span>账实相符</span><strong className="success">{rows.filter((item) => item.status === 'MATCHED').length}</strong><small>无需人工处理</small></Card>
        <Card><span>差异记录</span><strong className={differences ? 'danger' : 'success'}>{differences}</strong><small>需要运营人员核查</small></Card>
      </>}
    </div>
    <Card className="ops-risk-table" title="对账记录" extra={<span>共 {rows.length} 次</span>}>
      {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无对账记录，请选择链路并发起首次对账" /> : <Table<OperationsReconciliationRun> rowKey="runId" dataSource={rows} pagination={{ pageSize: 10 }} columns={[
        { title: '运行编号', dataIndex: 'runId', width: 175, render: (value: string) => <code>{value}</code> },
        { title: '对账链路', dataIndex: 'type', width: 150, render: (value: OperationsReconciliationType) => typeLabels[value] },
        { title: '状态', dataIndex: 'status', width: 120, render: (value: OperationsReconciliationStatus) => <Tag color={statusColors[value]}>{statusLabels[value]}</Tag> },
        { title: '差异数量', dataIndex: 'differenceCount', width: 100, align: 'right', render: (value: number) => <b className={value ? 'danger' : ''}>{value}</b> },
        { title: '结果说明', dataIndex: 'details', ellipsis: true },
        { title: '执行时间', dataIndex: 'createdAt', width: 180, render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }) },
      ]} />}
    </Card>
  </section>;
}
