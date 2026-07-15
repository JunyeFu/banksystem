import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Input, Select, Skeleton, Table, Tag } from 'antd';
import type { OperationsRiskAlert, OperationsRiskAlertStatus } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const severityLabels: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重' };
const severityColors: Record<string, string> = { LOW: 'green', MEDIUM: 'gold', HIGH: 'orange', CRITICAL: 'red' };

export function RiskAlerts(): JSX.Element {
  const [status, setStatus] = useState<OperationsRiskAlertStatus | undefined>();
  const [keyword, setKeyword] = useState('');
  const query = useQuery({ queryKey: ['operations-risk-alerts', status], queryFn: () => operationsApi.listRiskAlerts(status), retry: false });
  const rows = useMemo(() => (query.data ?? []).filter((item) => !keyword || `${item.ruleName}${item.entityId}${item.description}`.toLowerCase().includes(keyword.toLowerCase())), [query.data, keyword]);
  const active = query.data?.filter((item) => item.status === 'ACTIVE').length ?? 0;
  const critical = query.data?.filter((item) => item.severity === 'CRITICAL').length ?? 0;
  const state = query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : rows.length === 0 ? 'EMPTY' : status ?? 'NORMAL';
  return <section className="ops-risk-page" data-page-id="operations.risk.alerts" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">运营控制台　/　风险管理</p><h1>风险告警</h1><span>集中监控交易规则触发情况，及时识别并处置高风险事件。</span></div><Button onClick={() => void query.refetch()}>↻　刷新</Button></div>
    {query.isError ? <Alert type="error" showIcon message="风险告警加载失败" description="无法读取风险决策数据，请检查服务状态后重试。" action={<Button onClick={() => void query.refetch()}>重试</Button>} /> : <>
      <div className="ops-risk-metrics">
        {query.isLoading ? [0,1,2,3].map((key) => <Card key={key}><Skeleton active paragraph={false} /></Card>) : <>
          <Card><span>告警总数</span><strong>{query.data?.length ?? 0}</strong><small>当前查询范围</small></Card>
          <Card><span>活跃告警</span><strong className="danger">{active}</strong><small>需要风险人员关注</small></Card>
          <Card><span>严重告警</span><strong className="danger">{critical}</strong><small>硬限额规则触发</small></Card>
          <Card><span>已解决</span><strong className="success">{query.data?.filter((item) => item.status === 'RESOLVED').length ?? 0}</strong><small>已完成复核处置</small></Card>
        </>}
      </div>
      <Card className="ops-risk-filter"><Select value={status} allowClear placeholder="全部状态" onChange={setStatus} options={[{ value: 'ACTIVE', label: '活跃' }, { value: 'RESOLVED', label: '已解决' }]} data-testid="risk-alert-status-filter" /><Select allowClear placeholder="全部级别" options={Object.entries(severityLabels).map(([value,label]) => ({ value,label }))} /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="规则、交易编号或描述" allowClear data-testid="risk-alert-search" /><Button type="primary">查询</Button></Card>
      <Card className="ops-risk-table" title="告警列表" extra={<span>共 {rows.length} 条</span>}>
        {query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={status ? '当前状态下暂无风险告警' : '暂无风险告警'} /> : <Table rowKey="alertId" dataSource={rows} pagination={{ pageSize: 10 }} columns={[
          { title: '告警编号', dataIndex: 'alertId', width: 115, render: (value: string) => <code>{value.slice(0,8).toUpperCase()}</code> },
          { title: '级别', dataIndex: 'severity', width: 70, render: (value: string) => <Tag color={severityColors[value]}>{severityLabels[value]}</Tag> },
          { title: '规则名称', dataIndex: 'ruleName', width: 145 },
          { title: '关联交易', dataIndex: 'entityId', width: 125, render: (value: string) => <span className="ops-link">{value.slice(0,8).toUpperCase()}</span> },
          { title: '告警描述', dataIndex: 'description', width: 245, ellipsis: true },
          { title: '风险分', dataIndex: 'score', width: 70, render: (value: number) => <b className={value >= 80 ? 'danger' : ''}>{value}</b> },
          { title: '触发时间', dataIndex: 'triggeredAt', width: 155, render: (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false }) },
          { title: '状态', dataIndex: 'status', width: 90, render: (value: string) => <Tag color={value === 'ACTIVE' ? 'red' : 'green'}>{value === 'ACTIVE' ? '活跃' : '已解决'}</Tag> },
          { title: '操作', width: 70, render: (_: unknown, record: OperationsRiskAlert) => <Button type="link">{record.status === 'ACTIVE' ? '处置' : '详情'}</Button> },
        ]} />}
      </Card>
    </>}
  </section>;
}
