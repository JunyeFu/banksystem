import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, Input, Modal } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { productBrand } from '@localbank/bank-ui-kit';
import { PageContainer } from '@/components/PageContainer';
import { buildAuthRequest, exchangeCodeForToken, exchangePasswordForToken } from '@/auth/oidc';
import { setAccessToken } from '@/auth/tokenStore';

type LoginMode = 'password' | 'sso';

export function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [loginMode, setLoginMode] = useState<LoginMode>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registrationNoticeOpen, setRegistrationNoticeOpen] = useState(false);
  const exchangedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code || exchangedRef.current) return;
    exchangedRef.current = true;
    const storedState = sessionStorage.getItem('oidc_state');
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (params.get('state') !== storedState) { setError('身份认证状态校验失败，请重新登录。'); return; }
    if (!verifier) { setError('登录会话已失效，请重新发起登录。'); return; }
    setLoading(true);
    exchangeCodeForToken(code, verifier).then((token) => {
      setAccessToken(token); sessionStorage.removeItem('pkce_verifier'); sessionStorage.removeItem('oidc_state');
      const returnTo = sessionStorage.getItem('oidc_return_to') ?? '/dashboard';
      sessionStorage.removeItem('oidc_return_to');
      history.replaceState({}, '', '/portal/login'); navigate(returnTo);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '统一身份认证失败。')).finally(() => setLoading(false));
  }, [navigate]);

  const getReturnTo = (): string => {
    const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
    return typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
  };

  const handlePasswordLogin = async (): Promise<void> => {
    if (!username.trim() || !password) {
      setError('请输入用户名或手机号及密码。');
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const token = await exchangePasswordForToken(username.trim(), password);
      setAccessToken(token);
      navigate(getReturnTo());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '账号密码登录失败。');
    } finally {
      setPassword('');
      setLoading(false);
    }
  };

  const handleUnifiedIdentityLogin = async (): Promise<void> => {
    setError(undefined); setLoading(true);
    try {
      sessionStorage.setItem('oidc_return_to', getReturnTo());
      const request = await buildAuthRequest();
      sessionStorage.setItem('pkce_verifier', request.verifier); sessionStorage.setItem('oidc_state', request.state);
      window.location.assign(request.authorizationUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法发起统一身份认证。'); setLoading(false); }
  };

  return <PageContainer pageId="customer.login" state="READY">
    <div className="login-shell" data-view-state={loading ? 'SUBMITTING' : error ? 'ERROR' : 'DEFAULT'}>
      <header className="login-header"><div className="login-brand"><span className="customer-brand__mark"><i /></span><strong>{productBrand.bank.customerPortalName}</strong></div><div><a href="#help">帮助中心</a>　│　<a href="#support">客服支持</a>　│　简体中文⌄</div></header>
      <main className="login-main">
        <section className="bank-card login-card">
          <h1 data-testid="login-title">{loginMode === 'password' ? '账号密码登录' : '统一身份认证登录'}</h1><p>欢迎使用{productBrand.bank.customerPortalName}</p>
          <div className="login-tabs">
            <button type="button" data-testid="login-password-tab" className={loginMode === 'password' ? 'active' : ''} onClick={() => { setLoginMode('password'); setError(undefined); }}>账号密码登录</button>
            <button type="button" data-testid="login-sso-tab" className={loginMode === 'sso' ? 'active' : ''} onClick={() => { setLoginMode('sso'); setError(undefined); setPassword(''); }}>统一身份认证登录</button>
          </div>
          {loginMode === 'password' ? <>
            <label htmlFor="login-username">用户名 / 手机号</label><Input id="login-username" data-testid="login-username" size="large" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入用户名或手机号" prefix={<UserOutlined aria-hidden="true" />} />
            <label htmlFor="login-password">密码</label><Input.Password id="login-password" data-testid="login-password" size="large" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入密码" prefix={<LockOutlined aria-hidden="true" />} onPressEnter={() => void handlePasswordLogin()} />
          </> : <div className="login-sso-panel">
            <p>客户可通过复兴银行统一身份认证登录，完成认证后将返回门户。</p>
            <Button type="primary" size="large" block loading={loading} onClick={() => void handleUnifiedIdentityLogin()} data-testid="login-sso-submit">统一身份认证登录</Button>
          </div>}
          {error ? <Alert type="error" showIcon message="登录失败" description={error} closable onClose={() => setError(undefined)} data-testid="login-error" /> : null}
          {loginMode === 'password' ? <><div className="login-options"><Checkbox disabled>记住我</Checkbox><span className="login-option-links"><Button type="link" onClick={() => setRegistrationNoticeOpen(true)} data-testid="login-register">注册账号</Button><a href="#help">忘记密码？</a></span></div>
          <Button type="primary" size="large" block loading={loading} onClick={() => void handlePasswordLogin()} data-testid="login-submit">账号密码登录</Button></> : null}
          {loading ? <p className="login-progress">正在验证安全登录信息，请稍候…</p> : null}
          <div className="login-divider"><span>安全登录方式</span></div>
          <div className="login-methods"><span><b>盾</b>动态令牌</span><span><b>证</b>移动证书</span></div>
        </section>
        <aside className="login-assurance"><div className="login-shield">行</div><h2>安全 · 稳定 · 可审计</h2><p>本系统为银行业务演示环境，使用合成数据进行产品演示与功能验证。</p><ul><li><b>锁</b><span><strong>安全可靠</strong><small>OIDC、PKCE 与多重安全防护</small></span></li><li><b>稳</b><span><strong>稳定高效</strong><small>高可用架构与可恢复业务流程</small></span></li><li><b>审</b><span><strong>审计追踪</strong><small>完整操作日志满足审计要求</small></span></li></ul></aside>
      </main>
      <footer className="login-footer">© 2026 复兴银行　　隐私政策　│　使用条款　│　版本信息 V1.0.0</footer>
      <Modal title="在线开户注册" open={registrationNoticeOpen} footer={<Button type="primary" onClick={() => setRegistrationNoticeOpen(false)}>我知道了</Button>} onCancel={() => setRegistrationNoticeOpen(false)}>
        <p>在线开户注册将依次完成手机号认证、实名核验、开户协议确认和门户账号创建。</p>
        <p>当前本地演示环境尚未接入该开户流程，暂不能提交客户身份信息。</p>
      </Modal>
    </div>
  </PageContainer>;
}
