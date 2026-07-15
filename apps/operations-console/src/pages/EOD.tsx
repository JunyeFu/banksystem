import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Empty, List, Modal, Result, Skeleton, Tag } from 'antd';
import type { OperationsEodStatus } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const statusLabels: Record<OperationsEodStatus, string> = { NOT_STARTED: '尚未执行', RUNNING: '执行中', COMPLETED: '已完成', FAILED: '执行失败' };
const statusColors: Record<OperationsEodStatus, string> = { NOT_STARTED: 'default', RUNNING: 'processing', COMPLETED: 'success', FAILED: 'error' };
const time = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';

export function EOD(): JSX.Element {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const query = useQuery({ queryKey: ['operations-eod-latest'], queryFn: () => operationsApi.getLatestEodRun(), retry: false });
  const mutation = useMutation({ mutationFn: () => operationsApi.runEod(crypto.randomUUID()), onSuccess: (value) => { client.setQueryData(['operations-eod-latest'], value); setConfirming(false); } });
  const data = query.data;
  const state = confirming ? 'TRIGGER_CONFIRM_DIALOG' : mutation.isPending ? 'RUNNING' : query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : mutation.isError ? 'FAILED' : !data || data.status === 'NOT_STARTED' ? 'EMPTY' : data.status;

  return <section className="ops-settlement-page" data-page-id="operations.eod" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">复兴银行运营控制台　/　资金运营</p><h1>日终处理</h1><span>按顺序完成账务核对、状态归集与业务日结转，过程可追踪、可重放。</span></div><Button onClick={() => void query.refetch()}>↻　刷新</Button></div>
    <Card className="ops-eod-banner"><div><span>当前业务日期</span><strong>{data?.businessDate ?? new Date().toLocaleDateString('sv-SE')}</strong><small>执行前请确认清算与对账任务已完成。</small></div><Button type="primary" size="large" disabled={data?.status === 'RUNNING'} onClick={() => setConfirming(true)} data-testid="eod-open-confirm">启动日终处理</Button></Card>
    {query.isError ? <Alert type="error" showIcon message="日终状态加载失败" description="无法读取最新日终执行记录，请检查服务后重试。" action={<Button onClick={() => void query.refetch()}>重试</Button>} /> : mutation.isError ? <Alert className="ops-settlement-alert" type="error" showIcon message="日终处理失败" description="执行结果已保留，可排除依赖故障后使用新的幂等键重新发起。" /> : query.isLoading ? <Card><Skeleton active paragraph={{ rows: 8 }} /></Card> : !data || data.status === 'NOT_STARTED' ? <Card className="ops-eod-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前业务日尚未执行日终处理" /></Card> : <div className="ops-eod-grid">
      <Card title="最新运行结果"><div className="ops-eod-result"><Tag color={statusColors[data.status]}>{statusLabels[data.status]}</Tag><strong>{data.status === 'COMPLETED' ? '日终处理已成功完成' : data.status === 'RUNNING' ? '日终任务正在执行' : '日终任务执行失败'}</strong><p>{data.reason ?? '所有已登记步骤均已记录，可通过运行编号追踪。'}</p></div><Descriptions column={1} bordered size="small" items={[
        { key: 'id', label: '运行编号', children: data.runId ?? '—' }, { key: 'date', label: '业务日期', children: data.businessDate ?? '—' }, { key: 'recon', label: '对账状态', children: data.reconciliationStatus ?? '—' }, { key: 'start', label: '开始时间', children: time(data.startedAt) }, { key: 'end', label: '完成时间', children: time(data.completedAt) },
      ]} /></Card>
      <Card title="处理步骤"><List dataSource={data.stepsCompleted ?? []} locale={{ emptyText: '暂无已完成步骤' }} renderItem={(step, index) => <List.Item><span className="ops-step-index">{index + 1}</span><span>{step}</span><Tag color="success">完成</Tag></List.Item>} /></Card>
    </div>}
    <Modal open={confirming} title="确认启动日终处理" onCancel={() => !mutation.isPending && setConfirming(false)} maskClosable={false} closable={!mutation.isPending} footer={[<Button key="cancel" disabled={mutation.isPending} onClick={() => setConfirming(false)}>取消</Button>, <Button key="run" type="primary" danger loading={mutation.isPending} onClick={() => mutation.mutate()} data-testid="eod-confirm-run">确认执行</Button>]}>
      {mutation.isPending ? <Result icon={<span className="ops-eod-running">↻</span>} title="正在执行日终处理" subTitle="请勿关闭页面，完成后将自动刷新最新运行状态。" /> : <><Alert type="warning" showIcon message="日终处理会推进业务日期" description="请确认当日清算和对账已完成。该操作使用幂等键保护，不会因重复请求产生重复运行。" /><Descriptions className="ops-eod-confirm" column={1} size="small" items={[{ key: 'date', label: '待结业务日期', children: data?.businessDate ?? new Date().toLocaleDateString('sv-SE') }, { key: 'scope', label: '处理范围', children: '账务核对、批次归集、业务日结转' }]} /></>}
    </Modal>
  </section>;
}
