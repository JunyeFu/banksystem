import type { Baseline, Incident, KnowledgeStatus, Overview, QualityCase, QualityCaseDetail, RegressionRun, ReleaseEvidence, Schedule } from './types';

const root='/api/quality/v1';
async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`${root}${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',...init?.headers}});
  if(!response.ok){const problem=await response.json().catch(()=>({title:'服务暂不可用',status:response.status}));throw new Error(problem.detail||problem.title||`HTTP ${response.status}`);}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}
export const qualityApi={
  overview:()=>request<Overview>('/overview'), cases:()=>request<QualityCase[]>('/cases'), caseDetail:(id:string)=>request<QualityCaseDetail>(`/cases/${encodeURIComponent(id)}`),
  createCase:(body:{name:string;domain:string;description:string})=>request<QualityCase>('/cases',{method:'POST',body:JSON.stringify(body)}),
  baselines:()=>request<Baseline[]>('/baselines'), decideBaseline:(id:string,decision:'APPROVE'|'REJECT')=>request<Baseline>(`/baselines/${encodeURIComponent(id)}/decision`,{method:'POST',body:JSON.stringify({decision})}),
  runs:()=>request<RegressionRun[]>('/runs'), schedules:()=>request<Schedule[]>('/schedules'), setScheduleEnabled:(id:string,enabled:boolean)=>request<void>(`/schedules/${encodeURIComponent(id)}/enabled`,{method:'PUT',body:JSON.stringify({enabled})}),
  incidents:()=>request<Incident[]>('/incidents'), knowledge:()=>request<KnowledgeStatus>('/knowledge/status'), releases:()=>request<ReleaseEvidence[]>('/releases'),
};
