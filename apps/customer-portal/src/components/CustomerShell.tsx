import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Badge, Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { productBrand } from '@localbank/bank-ui-kit';
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

const navigation = [
  ['/accounts', '账户'], ['/transfers', '转账'], ['/beneficiaries', '收款人'], ['/loans', '贷款'],
  ['/documents', '文档'], ['/messages', '消息'], ['/security', '安全设置'],
] as const;

export function CustomerShell(): JSX.Element {
  const navigate = useNavigate();
  const profileItems: MenuProps['items'] = [
    { key: 'profile', label: '个人资料', onClick: () => navigate('/profile') },
    { key: 'security', label: '安全设置', onClick: () => navigate('/security') },
  ];
  return (
    <div className="customer-shell">
      <header className="customer-header">
        <button className="customer-brand" onClick={() => navigate('/dashboard')} aria-label={`${productBrand.bank.customerPortalName}首页`}>
          <span className="customer-brand__mark"><i /></span><span>{productBrand.bank.shortName}</span>
        </button>
        <nav className="customer-nav" aria-label="客户门户主导航">
          {navigation.map(([path, label]) => <NavLink key={path} to={path}>{label}</NavLink>)}
        </nav>
        <div className="customer-actions">
          <Badge count={2} size="small"><Button type="text" className="customer-bell" aria-label="通知">♢</Button></Badge>
          <Dropdown menu={{ items: profileItems }} placement="bottomRight">
            <Button type="text" className="customer-profile"><span className="customer-avatar">张</span>张三⌄</Button>
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
