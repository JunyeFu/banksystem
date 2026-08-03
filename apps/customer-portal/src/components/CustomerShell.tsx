import { useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Badge, Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { productBrand } from '@localbank/bank-ui-kit';
import { customerApi } from '@/api/client';
import { clearAccessToken } from '@/auth/tokenStore';
import { AccountDetail } from '@/pages/AccountDetail';
import { AccountList } from '@/pages/AccountList';
import { Beneficiaries } from '@/pages/Beneficiaries';
import { Dashboard } from '@/pages/Dashboard';
import { Documents } from '@/pages/Documents';
import { LoanApply } from '@/pages/LoanApply';
import { LoanDetail } from '@/pages/LoanDetail';
import { LoanList } from '@/pages/LoanList';
import { Messages } from '@/pages/Messages';
import { Profile } from '@/pages/Profile';
import { SecuritySettings } from '@/pages/SecuritySettings';
import { TransferCreate } from '@/pages/TransferCreate';
import { TransferList } from '@/pages/TransferList';
import { TransferResult } from '@/pages/TransferResult';
import { TransferVerification } from '@/pages/TransferVerification';
import { OrderQuery } from '@/pages/OrderQuery';

const navigation = [
  ['/dashboard', '账户概览'], ['/accounts', '账户'], ['/transfers', '转账'], ['/beneficiaries', '收款人'], ['/loans', '贷款'],
  ['/documents', '文档'], ['/messages', '消息'], ['/profile', '个人资料'], ['/security', '设置'],
] as const;

function customerIdentity(displayName: string | undefined): { avatar: string; name: string } {
  const name = displayName?.trim() || '客户';
  return { avatar: Array.from(name.replace(/\s+/g, ''))[0] ?? '客', name };
}

export function CustomerShell(): JSX.Element {
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => customerApi.getProfile() });
  const identity = customerIdentity(profile.data?.displayName);
  const logout = (): void => { clearAccessToken(); navigate('/login', { replace: true }); };
  const profileItems: MenuProps['items'] = [
    { key: 'profile', label: '个人资料', onClick: () => navigate('/profile') },
    { key: 'security', label: '安全设置', onClick: () => navigate('/security') },
    { type: 'divider' },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];
  return (
    <div className="customer-shell">
      <header className="customer-header">
        <button className="customer-brand" onClick={() => navigate('/dashboard')} aria-label={`${productBrand.bank.customerPortalName}首页`}>
          <span className="customer-brand__mark"><i /></span><span>{productBrand.bank.shortName}</span>
        </button>
        <nav className="customer-nav" aria-label="门户主导航">
          {navigation.map(([path, label]) => <NavLink key={path} to={path}>{label}</NavLink>)}
        </nav>
        <div className="customer-actions">
          <Badge count={2} size="small"><Button type="text" className="customer-bell" aria-label="通知" onClick={() => navigate('/messages')}>♢</Button></Badge>
          <Dropdown menu={{ items: profileItems }} placement="bottomRight">
            <Button
              type="text"
              className="customer-profile"
              aria-label={`当前用户：${identity.name}，打开用户菜单`}
              data-testid="customer-profile-menu"
              title={profile.isError ? '用户资料暂不可用' : identity.name}
            >
              <span className="customer-avatar" data-testid="customer-profile-avatar" aria-hidden="true">{identity.avatar}</span>
              <span className="customer-profile-label">
                <span className="customer-profile-name" data-testid="customer-profile-name" aria-live="polite">{identity.name}</span>
                <span aria-hidden="true">⌄</span>
              </span>
            </Button>
          </Dropdown>
        </div>
      </header>
      <main className="customer-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/accounts" element={<AccountList />} />
          <Route path="/accounts/:accountId" element={<AccountDetail />} />
          <Route path="/transfers" element={<TransferList />} />
          <Route path="/transfers/new" element={<TransferCreate />} />
          <Route path="/verification" element={<TransferVerification />} />
          <Route path="/orders/query" element={<OrderQuery />} />
          <Route path="/transfers/:transferId" element={<TransferResult />} />
          <Route path="/beneficiaries" element={<Beneficiaries />} />
          <Route path="/loans" element={<LoanList />} />
          <Route path="/loans/apply" element={<LoanApply />} />
          <Route path="/loans/:loanId" element={<LoanDetail />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/security" element={<SecuritySettings />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
