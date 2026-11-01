import type { Baseline, Incident, KnowledgeSnapshot, Overview, QualityCasePage, QualityCaseDetail, RegressionRun, ReleaseEvidence, Schedule } from './types';

const root='/api/quality/v1';
async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`${root}${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',...init?.headers}});
  if(!response.ok){const problem=await response.json().catch(()=>({title:'服务暂不可用',status:response.status}));throw new Error(problem.detail||problem.title||`HTTP ${response.status}`);}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}
export const qualityApi={
  overview:()=>request<Overview>('/overview'),
  cases:(query:{cursor?:string;q?:string;status?:string}={})=>{
    const params=new URLSearchParams({limit:'20'});
    for(const [key,value] of Object.entries(query)) if(value) params.set(key,value);
    return request<QualityCasePage>(`/cases?${params}`);
  },
  caseDetail:(id:string)=>request<QualityCaseDetail>(`/cases/${encodeURIComponent(id)}`),
  baselines:()=>request<Baseline[]>('/baselines'),
  runs:()=>request<RegressionRun[]>('/runs'), schedules:()=>request<Schedule[]>('/schedules'),
  incidents:()=>request<Incident[]>('/incidents'), knowledge:()=>request<KnowledgeSnapshot[]>('/knowledge'), releases:()=>request<ReleaseEvidence[]>('/releases'),
};
