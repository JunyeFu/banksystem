import { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { productBrand } from '@localbank/bank-ui-kit';
import { Approvals } from '@/pages/Approvals';
import { AuditViewer } from '@/pages/AuditViewer';
import { Clearing } from '@/pages/Clearing';
import { Dashboard } from '@/pages/Dashboard';
import { EOD } from '@/pages/EOD';
import { ExternalManagement } from '@/pages/ExternalManagement';
import { OpsDocuments } from '@/pages/OpsDocuments';
import { PaymentDetail } from '@/pages/PaymentDetail';
import { PaymentMonitoring } from '@/pages/PaymentMonitoring';
import { Reconciliation } from '@/pages/Reconciliation';
import { RiskAlerts } from '@/pages/RiskAlerts';
import { RiskCases } from '@/pages/RiskCases';
import { SystemHealth } from '@/pages/SystemHealth';
import { Login } from '@/pages/Login';
import { LoanApplications } from '@/pages/LoanApplications';
import { clearAccessToken, isAuthenticated } from '@/auth/tokenStore';

const { Header, Sider, Content } = Layout;
const entries = [
  ['/dashboard', '⌂', '首页概览'], ['/system-health', '◉', '系统健康'], ['/payments', '▣', '支付监控'],
  ['/loans', '¥', '贷款审批'], ['/clearing', '◎', '清算监控'], ['/reconciliation', '▤', '对账管理'], ['/approvals', '⚠', '异常处理'],
  ['/risk/alerts', '△', '风险告警'], ['/risk/cases', '◇', '风险案件'], ['/eod', '▧', '日终处理'], ['/documents', '□', '文档管理'],
  ['/audit', '≡', '审计追踪'],
  ['/external', '↗', '外部管理'],
] as const;
function selected(pathname: string): string { return entries.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[0] ?? '/dashboard'; }

function RequireOperationsAuthentication({ children }: { children: JSX.Element }): JSX.Element {
  const location = useLocation();
  if (isAuthenticated()) return children;
  return <Navigate to="/login" replace state={{ returnTo: `${location.pathname}${location.search}`, restoreSession: true }} />;
}

function OperationsShell(): JSX.Element {
  const navigate = useNavigate(); const location = useLocation(); const [collapsed, setCollapsed] = useState(false);
  const menuItems = useMemo<MenuProps['items']>(() => entries.map(([key, icon, label]) => ({ key, icon: <span className="ops-menu-icon">{icon}</span>, label })), []);
  const title = entries.find(([path]) => selected(location.pathname) === path)?.[2] ?? '运营控制台';
  const logout = (): void => { clearAccessToken(); navigate('/login', { replace: true }); };
  return <Layout className="ops-shell" data-sidebar-state={collapsed ? 'COLLAPSED' : 'EXPANDED'}>
    <Sider width={214} collapsedWidth={72} collapsed={collapsed} trigger={null} className="ops-sidebar" data-testid="ops-sidebar">
      <button className="ops-brand" onClick={() => navigate('/dashboard')} aria-label={productBrand.bank.operationsConsoleName}><span className="ops-brand__mark">复</span>{collapsed ? null : <span><strong>{productBrand.bank.shortName}</strong><small>运营控制台</small></span>}</button>
      <Menu theme="dark" mode="inline" selectedKeys={[selected(location.pathname)]} items={menuItems} onClick={({ key }) => navigate(key)} data-testid="ops-nav-menu" />
      <Button type="text" className="ops-collapse" onClick={() => setCollapsed((value) => !value)}>{collapsed ? '›' : '‹　收起菜单'}</Button>
    </Sider>
    <Layout>
      <Header className="ops-header"><strong>{title}</strong><div className="ops-header__actions"><Badge count={12} size="small"><Button type="text">♧</Button></Badge><span>消息中心</span><i /><span>ⓘ　帮助中心</span><i /><span className="ops-avatar">运</span><Button type="text" onClick={logout} data-testid="ops-logout">退出登录</Button></div></Header>
      <Content className="ops-content"><Routes>
        <Route path="/dashboard" element={<Dashboard />} /><Route path="/payments" element={<PaymentMonitoring />} /><Route path="/payments/:transferId" element={<PaymentDetail />} />
        <Route path="/loans" element={<LoanApplications />} />
        <Route path="/risk/alerts" element={<RiskAlerts />} /><Route path="/risk/cases" element={<RiskCases />} /><Route path="/approvals" element={<Approvals />} />
        <Route path="/clearing" element={<Clearing />} /><Route path="/reconciliation" element={<Reconciliation />} /><Route path="/eod" element={<EOD />} />
        <Route path="/documents" element={<OpsDocuments />} /><Route path="/audit" element={<AuditViewer />} /><Route path="/system-health" element={<SystemHealth />} />
        <Route path="/external" element={<ExternalManagement />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes></Content>
    </Layout>
  </Layout>;
}

export function App(): JSX.Element {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/login/callback" element={<Login />} />
    <Route path="/*" element={<RequireOperationsAuthentication><OperationsShell /></RequireOperationsAuthentication>} />
  </Routes>;
}
