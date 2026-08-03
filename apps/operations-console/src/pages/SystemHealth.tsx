import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Progress, Skeleton, Table, Tag } from 'antd';
import type { OperationsMonitoringAlert } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const severityLabels:Record<string,string>={INFO:'提示',WARNING:'警告',ERROR:'错误',CRITICAL:'严重'};const severityColors:Record<string,string>={INFO:'default',WARNING:'warning',ERROR:'error',CRITICAL:'error'};
export function SystemHealth():JSX.Element{
  const query=useQuery({queryKey:['operations-system-health'],queryFn:()=>operationsApi.getSystemHealth(),retry:false,refetchInterval:30000});const data=query.data;const alerts=data?.alerts??[];const firing=alerts.filter(item=>item.status==='FIRING');const resolved=alerts.filter(item=>item.status==='RESOLVED');
  const state=query.isLoading?'LOADING':query.isError?'ERROR':alerts.length===0?'NO_ALERTS':firing.length===0?'RESOLVED':'ALERTS_ACTIVE';
  const metrics=[['活跃告警',firing.length,'danger'],['严重告警',firing.filter(item=>item.severity==='CRITICAL').length,'danger'],['错误告警',firing.filter(item=>item.severity==='ERROR').length,'warning'],['已恢复',resolved.length,'success'],['日终失败',firing.filter(item=>item.code==='EOD_FAILED').length,'danger']] as const;
  return <section className="ops-health-page" data-page-id="operations.system-health" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">复兴银行运营控制台　/　系统运维</p><h1>系统健康</h1><span>集中查看核心服务、运行依赖与告警状态，及时发现影响业务连续性的问题。</span></div><Button onClick={()=>void query.refetch()}>↻　立即刷新</Button></div>
    {query.isError?<Alert type="error" showIcon message="系统健康数据不可用" description="监控接口未能返回有效快照，请检查服务网络和权限配置。" action={<Button onClick={()=>void query.refetch()}>重试</Button>}/>:<>
      <div className="ops-health-metrics">{query.isLoading?metrics.map(([label])=><Card key={label}><Skeleton active paragraph={false}/></Card>):metrics.map(([label,value,tone])=><Card key={label}><span>{label}</span><strong className={tone}>{value}</strong><small>{label==='已恢复'?'当前快照已恢复记录':'当前运行快照'}</small></Card>)}</div>
      {data?.overallStatus==='DEGRADED'?<Alert className="ops-health-banner" type="error" showIcon message="系统处于降级状态" description="至少一个关键依赖或高优先级告警正在影响系统健康。"/>:data?<Alert className="ops-health-banner" type="success" showIcon message="复兴银行数字银行系统运行正常" description={`健康检查时间：${new Date(data.checkedAt).toLocaleString('zh-CN',{hour12:false})}`}/>:null}
      <div className="ops-health-grid"><Card title="服务状态">{query.isLoading?<Skeleton active paragraph={{rows:4}}/>:(data?.services??[]).map(service=><div className="ops-service-row" key={service.serviceName}><div><strong>{service.serviceName}</strong><small>响应时间 {service.latencyMs} ms</small></div><Tag color={service.status==='UP'?'success':'error'}>{service.status==='UP'?'运行中':'不可用'}</Tag><Progress percent={service.status==='UP'?100:0} showInfo={false} status={service.status==='UP'?'success':'exception'}/></div>)}</Card><Card title="告警概览"><div className="ops-health-summary"><strong>{data?.overallStatus==='HEALTHY'?'运行稳定':'需要关注'}</strong><p>{alerts.length===0?'当前没有活跃或已恢复告警。':'告警由运行时状态、账务差异和任务积压自动生成。'}</p><Tag color={data?.overallStatus==='HEALTHY'?'success':'error'}>{data?.overallStatus??'CHECKING'}</Tag></div></Card></div>
      <Card className="ops-risk-table ops-health-table" title="告警列表" extra={<span>共 {alerts.length} 条</span>}>{query.isLoading?<Skeleton active paragraph={{rows:7}}/>:alerts.length===0?<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前无告警，所有受监控服务运行正常"/>:<Table<OperationsMonitoringAlert> rowKey="alertId" dataSource={alerts} pagination={{pageSize:10}} columns={[
        {title:'告警编号',dataIndex:'alertId',width:170,render:(value:string)=><code>{value}</code>},{title:'级别',dataIndex:'severity',width:90,render:(value:string)=><Tag color={severityColors[value]}>{severityLabels[value]}</Tag>},{title:'状态',dataIndex:'status',width:95,render:(value:string)=><Tag color={value==='FIRING'?'error':'success'}>{value==='FIRING'?'触发中':'已恢复'}</Tag>},{title:'服务',dataIndex:'serviceName',width:180},{title:'告警说明',dataIndex:'message'},{title:'触发时间',dataIndex:'triggeredAt',width:180,render:(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})},
      ]}/>}</Card>
    </>}
  </section>;
}
