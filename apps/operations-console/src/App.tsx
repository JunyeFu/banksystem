import { useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { Dashboard } from './pages/Dashboard';
import { PaymentMonitoring } from './pages/PaymentMonitoring';
import { PaymentDetail } from './pages/PaymentDetail';
import { Approvals } from './pages/Approvals';
import { Reconciliation } from './pages/Reconciliation';
import { EOD } from './pages/EOD';
import { RiskCases } from './pages/RiskCases';
import { RiskAlerts } from './pages/RiskAlerts';
import { Clearing } from './pages/Clearing';
import { OpsDocuments } from './pages/OpsDocuments';
import { AuditViewer } from './pages/AuditViewer';
import { SystemHealth } from './pages/SystemHealth';

const { Sider, Content } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

const menuConfig: { key: string; label: string }[] = [
  { key: '/dashboard', label: '仪表盘' },
  { key: '/payments', label: '支付监控' },
  { key: '/risk/alerts', label: '风险告警' },
  { key: '/risk/cases', label: '风险案件' },
  { key: '/approvals', label: '审批队列' },
  { key: '/clearing', label: '清算' },
  { key: '/reconciliation', label: '对账' },
  { key: '/eod', label: '日终处理' },
  { key: '/documents', label: '文档' },
  { key: '/audit', label: '审计' },
  { key: '/system-health', label: '系统健康' },
];

function selectedKey(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/dashboard';
  if (segments[0] === 'payments' && segments.length > 1) return '/payments';
  if (segments[0] === 'risk' && segments.length > 1) {
    return `/${segments[0]}/${segments[1]}`;
  }
  return `/${segments[0]}`;
}

export function App(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const items: MenuItem[] = useMemo(
    () =>
      menuConfig.map((item) => ({
        key: item.key,
        label: item.label,
      })),
    [],
  );

  const selected = selectedKey(location.pathname);

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    navigate(e.key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible breakpoint="lg" data-testid="ops-sidebar">
        <div
          style={{
            height: 48,
            margin: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64d5c2',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.05em',
          }}
        >
          BANK OPS
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={items}
          onClick={handleMenuClick}
          data-testid="ops-nav-menu"
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/payments" element={<PaymentMonitoring />} />
            <Route
              path="/payments/:paymentId"
              element={<PaymentDetail />}
            />
            <Route
              path="/risk/alerts"
              element={<RiskAlerts />}
            />
            <Route
              path="/risk/cases"
              element={<RiskCases />}
            />
            <Route path="/approvals" element={<Approvals />} />
            <Route
              path="/clearing"
              element={<Clearing />}
            />
            <Route
              path="/reconciliation"
              element={<Reconciliation />}
            />
            <Route
              path="/eod"
              element={<EOD />}
            />
            <Route
              path="/documents"
              element={<OpsDocuments />}
            />
            <Route
              path="/audit"
              element={<AuditViewer />}
            />
            <Route
              path="/system-health"
              element={<SystemHealth />}
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
