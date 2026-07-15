import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Input, Select, Skeleton, Table, Tag, Tooltip } from 'antd';
import type { OperationsAuditEvent, OperationsAuditOutcome } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const outcomeLabels:Record<OperationsAuditOutcome,string>={SUCCESS:'成功',FAILURE:'失败',DENIED:'拒绝'}; const outcomeColors:Record<OperationsAuditOutcome,string>={SUCCESS:'success',FAILURE:'error',DENIED:'warning'};
const hash=(value?:string|null)=>value?`${value.slice(0,8)}…${value.slice(-6)}`:'GENESIS';
export function AuditViewer():JSX.Element{
  const [actor,setActor]=useState('');const [outcome,setOutcome]=useState<OperationsAuditOutcome>();const [correlation,setCorrelation]=useState('');const [showVerification,setShowVerification]=useState(false);
  const events=useQuery({queryKey:['operations-audit-events',actor,outcome,correlation],queryFn:()=>operationsApi.listAuditEvents({actorId:actor||undefined,outcome,correlationId:correlation||undefined}),retry:false});
  const verification=useQuery({queryKey:['operations-audit-verify'],queryFn:()=>operationsApi.verifyAuditHashChain(),retry:false}); const rows=events.data??[];
  const state=events.isLoading||verification.isLoading?'LOADING':events.isError||verification.isError?'ERROR':rows.length===0?'EMPTY':verification.data?.verified===false?'CHAIN_ERROR':showVerification?'CHAIN_OK':'NORMAL';
  return <section className="ops-audit-page" data-page-id="operations.audit" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">复兴银行运营控制台　/　运营治理</p><h1>审计追踪</h1><span>查询关键操作事件并验证不可变哈希链，确保记录可追溯、可举证。</span></div><Button onClick={()=>{setShowVerification(true);void verification.refetch();}}>校验完整性</Button></div>
    {verification.data?.verified===false?<Alert className="ops-audit-chain" type="error" showIcon message="完整性校验失败（CHAIN_ERROR）" description={`检测到哈希链不连续，断裂事件：${verification.data.brokenAtEventId??'未知'}`}/>:showVerification&&verification.data?.verified?<Alert className="ops-audit-chain" type="success" showIcon message="完整性校验通过（CHAIN_OK）" description={`已验证 ${verification.data.totalEvents} 条事件，末端哈希 ${hash(verification.data.lastVerifiedHash)}`}/>:null}
    <Card className="ops-audit-filter"><Input value={actor} onChange={event=>setActor(event.target.value)} allowClear placeholder="操作人"/><Select allowClear value={outcome} onChange={setOutcome} placeholder="全部结果" options={Object.entries(outcomeLabels).map(([value,label])=>({value,label}))}/><Input value={correlation} onChange={event=>setCorrelation(event.target.value)} allowClear placeholder="关联 ID"/><Button type="primary" onClick={()=>void events.refetch()}>查询</Button><Button onClick={()=>{setActor('');setOutcome(undefined);setCorrelation('');}}>重置</Button></Card>
    {events.isError||verification.isError?<Alert type="error" showIcon message="审计数据加载失败" description="无法读取审计事件或完整性校验结果。"/>:<Card className="ops-risk-table" title="审计事件" extra={<span>最多显示最近 500 条</span>}>{events.isLoading?<Skeleton active paragraph={{rows:9}}/>:rows.length===0?<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前条件下暂无审计事件"/>:<Table<OperationsAuditEvent> rowKey="eventId" dataSource={rows} pagination={{pageSize:10}} scroll={{x:1250}} rowClassName={item=>item.eventId===verification.data?.brokenAtEventId?'ops-audit-broken':''} columns={[
      {title:'事件类型',dataIndex:'eventType',width:150},{title:'操作人',dataIndex:'actorId',width:125},{title:'动作',dataIndex:'action',width:130},{title:'资源',width:210,render:(_:unknown,item)=>`${item.resourceType??'—'} ${item.resourceId??''}`},
      {title:'结果',dataIndex:'outcome',width:90,render:(value:OperationsAuditOutcome)=><Tag color={outcomeColors[value]}>{outcomeLabels[value]}</Tag>},{title:'记录哈希',dataIndex:'recordHash',width:155,render:(value:string)=><Tooltip title={value}><code>{hash(value)}</code></Tooltip>},{title:'前序哈希',dataIndex:'previousHash',width:155,render:(value:string|null)=><Tooltip title={value}><code>{hash(value)}</code></Tooltip>},{title:'关联 ID',dataIndex:'correlationId',width:145,render:(value:string|null)=>value??'—'},{title:'时间',dataIndex:'timestamp',width:180,render:(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})},
    ]}/>}</Card>}
  </section>;
}
