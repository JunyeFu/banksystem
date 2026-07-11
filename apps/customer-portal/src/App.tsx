import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AccountList } from './pages/AccountList';
import { AccountDetail } from './pages/AccountDetail';
import { TransferList } from './pages/TransferList';
import { TransferCreate } from './pages/TransferCreate';
import { TransferResult } from './pages/TransferResult';
import { Beneficiaries } from './pages/Beneficiaries';
import { LoanList } from './pages/LoanList';
import { LoanDetail } from './pages/LoanDetail';
import { LoanApply } from './pages/LoanApply';
import { Documents } from './pages/Documents';
import { Messages } from './pages/Messages';
import { Profile } from './pages/Profile';
import { SecuritySettings } from './pages/SecuritySettings';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/login/callback" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/accounts" element={<AccountList />} />
      <Route path="/accounts/:accountId" element={<AccountDetail />} />
      <Route path="/transfers" element={<TransferList />} />
      <Route path="/transfers/new" element={<TransferCreate />} />
      <Route path="/transfers/:paymentId" element={<TransferResult />} />
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
  );
}
