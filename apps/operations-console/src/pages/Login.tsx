import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card } from 'antd';
import { productBrand } from '@localbank/bank-ui-kit';
import { buildAuthRequest, exchangeCodeForToken } from '@/auth/oidc';
import { setAccessToken } from '@/auth/tokenStore';

export function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const exchangedRef = useRef(false);
  const restoringRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'login_required' || params.get('error') === 'interaction_required') {
      sessionStorage.removeItem('ops_oidc_pkce_verifier');
      sessionStorage.removeItem('ops_oidc_state');
      history.replaceState({}, '', '/ops/login');
      return;
    }
    const code = params.get('code');
    if (!code || exchangedRef.current) return;
    exchangedRef.current = true;
    const verifier = sessionStorage.getItem('ops_oidc_pkce_verifier');
    const storedState = sessionStorage.getItem('ops_oidc_state');
    if (!verifier || params.get('state') !== storedState) { setError('身份认证状态校验失败，请重新登录。'); return; }
    setLoading(true);
    exchangeCodeForToken(code, verifier).then((token) => {
      setAccessToken(token);
      const returnTo = sessionStorage.getItem('ops_oidc_return_to') ?? '/dashboard';
      sessionStorage.removeItem('ops_oidc_pkce_verifier'); sessionStorage.removeItem('ops_oidc_state'); sessionStorage.removeItem('ops_oidc_return_to');
      history.replaceState({}, '', '/ops/login'); navigate(returnTo);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '统一身份认证失败。')).finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    const restore = (location.state as { restoreSession?: boolean } | null)?.restoreSession;
    if (!restore || restoringRef.current) return;
    restoringRef.current = true;
    void handleLogin('none');
  }, [location.state]);

  const handleLogin = async (prompt?: 'none'): Promise<void> => {
    setError(undefined); setLoading(true);
    try {
      const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo ?? sessionStorage.getItem('ops_oidc_return_to');
      sessionStorage.setItem('ops_oidc_return_to', typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard');
      const request = await buildAuthRequest(prompt);
      sessionStorage.setItem('ops_oidc_pkce_verifier', request.verifier); sessionStorage.setItem('ops_oidc_state', request.state);
      window.location.assign(request.authorizationUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法发起统一身份认证。'); setLoading(false); }
  };

  return <main className="ops-login-shell" data-view-state={loading ? 'SUBMITTING' : error ? 'ERROR' : 'DEFAULT'}><Card className="ops-login-card" bordered={false}>
    <div className="ops-login-mark">复</div><p className="ops-login-kicker">{productBrand.bank.shortName}</p><h1>运营控制台登录</h1><p>通过统一身份认证进入受控运营功能。</p>
    {error ? <Alert type="error" showIcon message="登录失败" description={error} data-testid="ops-login-error" /> : null}
    <Button type="primary" size="large" block loading={loading} onClick={() => void handleLogin()} data-testid="ops-login-submit">通过统一身份认证登录</Button>
    <small>仅已获授权的运营角色可访问日终、清算、对账与审计功能。</small>
  </Card></main>;
}
