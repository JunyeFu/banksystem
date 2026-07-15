import { Navigate, Route, Routes } from 'react-router-dom';
import { CustomerShell } from '@/components/CustomerShell';
import { Login } from '@/pages/Login';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/login/callback" element={<Login />} />
      <Route path="/*" element={<CustomerShell />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
