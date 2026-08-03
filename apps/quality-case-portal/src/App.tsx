import { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { productBrand } from '@localbank/bank-ui-kit';
import { BaselinesPage, CaseDetailPage, CasesPage, DashboardPage, IncidentsPage, KnowledgePage, ReleasesPage, RunsPage, SchedulesPage } from './pages';

const {Header,Sider,Content}=Layout;
const entries=[['/dashboard','⌂','平台总览'],['/cases','▤','质量用例'],['/baselines','✓','基线中心'],['/runs','▶','回归运行'],['/schedules','◷','定时计划'],['/incidents','!','失败与恢复'],['/knowledge','◇','知识与作者化'],['/releases','▣','交付中心']] as const;
function selected(path:string){return entries.find(([key])=>path===key||path.startsWith(`${key}/`))?.[0]??'/dashboard'}
export function App(){const navigate=useNavigate();const location=useLocation();const [collapsed,setCollapsed]=useState(false);const items=useMemo<MenuProps['items']>(()=>entries.map(([key,icon,label])=>({key,icon:<span className="hz-menu-icon">{icon}</span>,label})),[]);const title=entries.find(([key])=>key===selected(location.pathname))?.[2];return <Layout className="hz-shell" data-sidebar-state={collapsed?'COLLAPSED':'EXPANDED'}>
  <Sider width={232} collapsedWidth={72} collapsed={collapsed} trigger={null} className="hz-sidebar"><button className="hz-brand" onClick={()=>navigate('/dashboard')} aria-label={productBrand.regressionPlatform.displayName}><span className="hz-brand-mark">衡</span>{collapsed?null:<span><strong>衡准</strong><small>自动化回归测试平台</small></span>}</button><Menu theme="dark" mode="inline" selectedKeys={[selected(location.pathname)]} items={items} onClick={({key})=>navigate(key)} data-testid="quality-nav"/><Button type="text" className="hz-collapse" onClick={()=>setCollapsed(v=>!v)}>{collapsed?'›':'‹　收起菜单'}</Button></Sider>
  <Layout><Header className="hz-header"><strong>{title}</strong><div className="hz-header-actions"><Badge status="success" text="本机运行"/><i/><span>证据审计</span><i/><span className="hz-avatar">质</span><span>质量负责人</span></div></Header><Content className="hz-content"><Routes>
    <Route path="/dashboard" element={<DashboardPage/>}/><Route path="/cases" element={<CasesPage/>}/><Route path="/cases/:caseId" element={<CaseDetailPage/>}/><Route path="/baselines" element={<BaselinesPage/>}/><Route path="/runs" element={<RunsPage/>}/><Route path="/schedules" element={<SchedulesPage/>}/><Route path="/incidents" element={<IncidentsPage/>}/><Route path="/knowledge" element={<KnowledgePage/>}/><Route path="/releases" element={<ReleasesPage/>}/><Route path="/" element={<Navigate to="/dashboard" replace/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/>
  </Routes></Content></Layout>
</Layout>}
