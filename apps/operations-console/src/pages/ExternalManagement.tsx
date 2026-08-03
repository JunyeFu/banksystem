import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Skeleton, Tag } from 'antd';
import { operationsApi } from '@/api/client';

const marks:Record<string,string>={MIFOS_X:'M',KEYCLOAK:'K',GRAFANA:'G'};
const capabilities:Record<string,string[]>={MIFOS_X:['客户与账户','贷款与产品','会计与批处理'],KEYCLOAK:['Realm 与客户端','用户与角色','会话与安全事件'],GRAFANA:['指标看板','告警管理','日志与探索']};
export function ExternalManagement():JSX.Element{
  const query=useQuery({queryKey:['operations-external-services'],queryFn:()=>operationsApi.getExternalServices(),retry:false,refetchInterval:30000});const data=query.data;const state=query.isLoading?'LOADING':query.isError?'ERROR':data?.overallStatus??'UNAVAILABLE';
  return <section className="ops-external-page" data-page-id="operations.external" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">复兴银行运营控制台　/　外部管理</p><h1>第三方管理中心</h1><span>统一进入本机核心银行、身份治理与可观测平台；各系统继续执行自身权限控制。</span></div><Button onClick={()=>void query.refetch()}>↻　检查可用性</Button></div>
    <Alert className="ops-external-notice" type="warning" showIcon message="安全边界说明" description="入口仅指向 127.0.0.1 本机服务，不保存、不展示也不代填任何管理凭据。高风险操作仍需在目标系统内完成授权与确认。"/>
    {query.isError?<Alert type="error" showIcon message="无法检查第三方服务" description="银行渠道服务未返回可用性快照，请检查 Docker 网络后重试。" action={<Button onClick={()=>void query.refetch()}>重试</Button>}/>:<div className="ops-external-grid">
      {query.isLoading?[0,1,2].map(key=><Card key={key}><Skeleton active paragraph={{rows:6}}/></Card>):data?.items.map(item=><Card key={item.serviceId} className={`ops-external-card ops-external-card--${item.status.toLowerCase()}`}>
        <div className="ops-external-card__head"><span>{marks[item.serviceId]}</span><div><h2>{item.displayName}</h2><p>{item.purpose}</p></div><Tag color={item.status==='AVAILABLE'?'success':'error'}>{item.status==='AVAILABLE'?'可用':'不可用'}</Tag></div>
        <div className="ops-external-capabilities">{capabilities[item.serviceId]?.map(value=><span key={value}>✓　{value}</span>)}</div>
        <dl><div><dt>本机地址</dt><dd><code>{item.launchUrl}</code></dd></div><div><dt>探测延迟</dt><dd>{item.latencyMs} ms</dd></div><div><dt>认证边界</dt><dd>目标系统独立认证</dd></div></dl>
        {item.status==='AVAILABLE'?<Button type="primary" block href={item.launchUrl} target="_blank" rel="noopener noreferrer" data-testid={`external-open-${item.serviceId}`}>在新窗口打开</Button>:<Button block disabled data-testid={`external-open-${item.serviceId}`}>服务不可用</Button>}
      </Card>)}
    </div>}
    {data?<footer className="ops-external-footer"><span>总体状态：<Tag color={data.overallStatus==='AVAILABLE'?'success':data.overallStatus==='PARTIAL'?'warning':'error'}>{data.overallStatus}</Tag></span><span>最近检查：{new Date(data.checkedAt).toLocaleString('zh-CN',{hour12:false})}</span></footer>:null}
  </section>;
}
