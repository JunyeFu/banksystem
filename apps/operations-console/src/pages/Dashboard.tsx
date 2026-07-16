import { useQuery } from '@tanstack/react-query';
import { Button, Card, Progress, Skeleton, Table, Tag } from 'antd';
import type { OperationsDashboard } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';
import { useNavigate } from 'react-router-dom';

const tasks = [
  { key: '1', type: '支付', item: '大额转账人工复核', owner: '支付监控', priority: '高', time: '09:42', status: '待处理' },
  { key: '2', type: '清算', item: '清算回执异常确认', owner: '清算监控', priority: '中', time: '09:26', status: '处理中' },
  { key: '3', type: '对账', item: '日间差异项核验', owner: '对账管理', priority: '中', time: '08:58', status: '待处理' },
];

function useDashboardSummary() {
  return useQuery<OperationsDashboard>({
    queryKey: ['operations-dashboard'],
    queryFn: () => operationsApi.getDashboard(),
    retry: false,
  });
}

function Metric({ label, value, caption, tone = 'default' }: { label: string; value: string; caption: string; tone?: 'default' | 'success' | 'danger' }) {
  return <Card className={`ops-dashboard-metric ops-dashboard-metric--${tone}`}>
    <span>{label}　ⓘ</span><strong>{value}</strong><small>{caption}</small>
  </Card>;
}

function LoadingDashboard(): JSX.Element {
  return <div className="ops-dashboard-grid" data-testid="dashboard-loading">
    {[0, 1, 2, 3].map((item) => <Card className="ops-dashboard-metric" key={item}><Skeleton active paragraph={{ rows: 1 }} title={{ width: '45%' }} /></Card>)}
    <Card className="ops-dashboard-panel ops-dashboard-panel--wide"><Skeleton active paragraph={{ rows: 5 }} /></Card>
    <Card className="ops-dashboard-panel"><Skeleton active paragraph={{ rows: 5 }} /></Card>
    <Card className="ops-dashboard-panel ops-dashboard-panel--full"><Skeleton active paragraph={{ rows: 4 }} /></Card>
  </div>;
}

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const query = useDashboardSummary();
  const state = query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : 'READY';
  const data = query.data;
  return <section className="ops-dashboard" data-page-id="operations.dashboard" data-view-state={state}>
    <div className="ops-dashboard-heading"><div><h1>仪表盘</h1><p>实时掌握业务运营与系统运行概况</p></div><Button>▣　今天　⌄</Button></div>
    {query.isLoading ? <LoadingDashboard /> : query.isError ? <div className="ops-dashboard-error" role="alert">
      <div className="ops-dashboard-error__icon">!</div><h2>接口错误，数据加载失败</h2>
      <p>与后端服务通信异常，可能是网络问题或服务不可用。<br />请检查网络或稍后重试。</p>
      <Button type="primary" danger onClick={() => void query.refetch()}>↻　重试</Button><small>如果问题持续存在，请联系系统管理员。</small>
    </div> : data ? <div className="ops-dashboard-grid">
      <Metric label="支付交易总额" value={`¥ ${Number(data.todayPaymentAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`} caption="今日累计" />
      <Metric label="支付交易笔数" value={data.todayPaymentCount.toLocaleString('zh-CN')} caption={`${data.activePayments} 笔处理中`} />
      <Metric label="成功率" value={`${data.successRate.toFixed(2)}%`} caption="按今日已发起交易统计" tone="success" />
      <Metric label="待处理告警" value={String(data.pendingAlerts)} caption={`${data.failedPayments} 笔失败或退回`} tone={data.pendingAlerts ? 'danger' : 'success'} />

      <Card className="ops-dashboard-panel ops-dashboard-panel--wide" title="交易运行概况" extra={<span>近 7 天　⌄</span>}>
        <div className="ops-trend-legend"><b>● 支付总额</b><b>● 交易笔数</b></div>
        <div className="ops-trend-chart" aria-label="交易趋势示意图"><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="ops-trend-axis"><span>周三</span><span>周四</span><span>周五</span><span>周六</span><span>周日</span><span>周一</span><span>今天</span></div>
      </Card>
      <Card className="ops-dashboard-panel" title="运行状态">
        <div className="ops-dashboard-status"><span>清算链路</span><Tag color={data.clearingStatus === 'NORMAL' ? 'green' : 'orange'}>{data.clearingStatus === 'NORMAL' ? '正常' : '需关注'}</Tag></div>
        <div className="ops-dashboard-status"><span>最近对账</span><Tag color={data.reconciliationStatus === 'DIFFERENCE' ? 'red' : 'green'}>{data.reconciliationStatus === 'MATCHED' ? '账实相符' : data.reconciliationStatus === 'DIFFERENCE' ? '存在差异' : '尚未执行'}</Tag></div>
        <div className="ops-dashboard-status"><span>系统健康</span><Tag color={data.systemHealth === 'HEALTHY' ? 'green' : 'orange'}>{data.systemHealth === 'HEALTHY' ? '健康' : '降级'}</Tag></div>
        <Progress percent={data.successRate} strokeColor="#d71920" showInfo={false} /><small>交易成功率</small>
      </Card>

      <Card className="ops-dashboard-panel ops-dashboard-panel--full" title="待处理事项" extra={<Button type="link" onClick={() => navigate('/approvals')} data-testid="dashboard-view-all-tasks">查看全部　›</Button>}>
        <Table pagination={false} size="small" dataSource={tasks} columns={[
          { title: '类型', dataIndex: 'type' }, { title: '事项', dataIndex: 'item' }, { title: '发起方', dataIndex: 'owner' },
          { title: '优先级', dataIndex: 'priority', render: (value: string) => <Tag color={value === '高' ? 'red' : 'orange'}>{value}</Tag> },
          { title: '创建时间', dataIndex: 'time' }, { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === '处理中' ? 'blue' : 'orange'}>{value}</Tag> },
          { title: '操作', render: () => <Button type="link" onClick={() => navigate('/approvals')}>处理</Button> },
        ]} />
      </Card>
    </div> : null}
  </section>;
}
