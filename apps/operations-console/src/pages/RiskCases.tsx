import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Drawer, Empty, Input, Select, Skeleton, Table, Tag } from 'antd';
import type { OperationsRiskCase, OperationsRiskCaseStatus } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const caseLabels: Record<string, string> = { OPEN: '待处置', UNDER_REVIEW: '复核中', APPROVED: '已通过' };
const caseColors: Record<string, string> = { OPEN: 'red', UNDER_REVIEW: 'orange', APPROVED: 'green' };
const decisionLabels: Record<string, string> = { ALLOW: '放行', REVIEW: '人工复核', BLOCK: '拦截' };

export function RiskCases(): JSX.Element {
  const [status, setStatus] = useState<OperationsRiskCaseStatus | undefined>();
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<OperationsRiskCase | null>(null);
  const query = useQuery({ queryKey: ['operations-risk-cases', status], queryFn: () => operationsApi.listRiskCases(status), retry: false });
  const rows = useMemo(() => (query.data ?? []).filter((item) => !keyword || `${item.caseId}${item.transferId}${item.customerSubject}`.toLowerCase().includes(keyword.toLowerCase())), [query.data, keyword]);
  const state = query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : rows.length === 0 ? 'EMPTY' : status ?? 'NORMAL';
  return <section className="ops-risk-page" data-page-id="operations.risk.cases" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">运营控制台　/　风险管理</p><h1>风险案件</h1><span>跟踪风险决策及 Maker-Checker 复核过程，确保处置全程可追溯。</span></div><Button onClick={() => void query.refetch()}>↻　刷新</Button></div>
    {query.isError ? <Alert type="error" showIcon message="风险案件加载失败" description="无法读取风险案件数据，请检查服务状态后重试。" action={<Button onClick={() => void query.refetch()}>重试</Button>} /> : <>
      <div className="ops-risk-metrics ops-risk-metrics--three">
        {query.isLoading ? [0,1,2].map((key) => <Card key={key}><Skeleton active paragraph={false} /></Card>) : <>
          <Card><span>案件总数</span><strong>{query.data?.length ?? 0}</strong><small>当前查询范围</small></Card>
          <Card><span>待处置</span><strong className="danger">{query.data?.filter((item) => item.status === 'OPEN').length ?? 0}</strong><small>拦截交易待确认</small></Card>
          <Card><span>复核中</span><strong>{query.data?.filter((item) => item.status === 'UNDER_REVIEW').length ?? 0}</strong><small>Maker-Checker 流程中</small></Card>
        </>}
      </div>
      <Card className="ops-risk-filter"><Select value={status} allowClear placeholder="全部状态" onChange={setStatus} options={Object.entries(caseLabels).map(([value,label]) => ({ value,label }))} data-testid="risk-case-status-filter" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="案件编号、交易编号或客户主体" allowClear data-testid="risk-case-search" /><Button type="primary" onClick={() => void query.refetch()}>查询</Button></Card>
      <Card className="ops-risk-table" title="案件列表" extra={<span>共 {rows.length} 条</span>}>
        {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={status ? '当前状态下暂无风险案件' : '暂无风险案件'} /> : <Table rowKey="caseId" dataSource={rows} pagination={{ pageSize: 10 }} columns={[
          { title: '案件编号', dataIndex: 'caseId', width: 150, render: (value: string) => <code>{value.slice(0,8).toUpperCase()}</code> },
          { title: '关联交易', dataIndex: 'transferId', width: 125, render: (value: string) => <span className="ops-link">{value.slice(0,8).toUpperCase()}</span> },
          { title: '客户主体', dataIndex: 'customerSubject', width: 145 },
          { title: '风险决策', dataIndex: 'decision', width: 110, render: (value: string) => <Tag color={value === 'BLOCK' ? 'red' : value === 'REVIEW' ? 'orange' : 'green'}>{decisionLabels[value]}</Tag> },
          { title: '风险分', dataIndex: 'score', width: 80, render: (value: number) => <b className={value >= 80 ? 'danger' : ''}>{value}</b> },
          { title: '触发规则', dataIndex: 'triggeredRules', ellipsis: true, render: (value: string[]) => value.join('、') },
          { title: '发起人', dataIndex: 'maker', width: 120 },
          { title: '状态', dataIndex: 'status', width: 105, render: (value: string) => <Tag color={caseColors[value]}>{caseLabels[value]}</Tag> },
          { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }) },
          { title: '操作', width: 80, render: (_: unknown, record: OperationsRiskCase) => <Button type="link" onClick={() => setSelected(record)} data-testid={`risk-case-open-${record.caseId}`}>{record.status === 'UNDER_REVIEW' ? '复核详情' : '详情'}</Button> },
        ]} />}
      </Card>
    </>}
    <Drawer title="风险案件详情" width={620} open={selected !== null} onClose={() => setSelected(null)} data-testid="risk-case-drawer">
      {selected ? <><Alert type="info" showIcon message="当前页面仅提供审阅" description="案件处置需由已授权的风险工作流完成；本页不会直接改变风险决策或交易状态。" /><Descriptions column={1} bordered size="small" style={{ marginTop: 16 }} items={[
        { key: 'id', label: '案件编号', children: selected.caseId }, { key: 'transfer', label: '关联交易', children: selected.transferId }, { key: 'customer', label: '客户主体', children: selected.customerSubject },
        { key: 'decision', label: '风险决策', children: decisionLabels[selected.decision] }, { key: 'score', label: '风险评分', children: selected.score }, { key: 'rules', label: '触发规则', children: selected.triggeredRules.join('、') },
        { key: 'maker', label: '发起人', children: selected.maker }, { key: 'status', label: '案件状态', children: <Tag color={caseColors[selected.status]}>{caseLabels[selected.status]}</Tag> },
      ]} /></> : null}
    </Drawer>
  </section>;
}
