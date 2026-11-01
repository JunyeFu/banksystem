import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CustomerShell } from '@/components/CustomerShell';
import { isAuthenticated } from '@/auth/tokenStore';
import { Login } from '@/pages/Login';

function RequireCustomerAuthentication({ children }: { children: JSX.Element }): JSX.Element {
  const location = useLocation();
  if (isAuthenticated()) return children;
  return <Navigate to="/login" replace state={{ returnTo: `${location.pathname}${location.search}`, restoreSession: true }} />;
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/login/callback" element={<Login />} />
      <Route path="/*" element={<RequireCustomerAuthentication><CustomerShell /></RequireCustomerAuthentication>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
