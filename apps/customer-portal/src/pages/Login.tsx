import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, Input } from 'antd';
import { productBrand } from '@localbank/bank-ui-kit';
import { PageContainer } from '@/components/PageContainer';
import { buildAuthRequest, exchangeCodeForToken } from '@/auth/oidc';
import { setAccessToken } from '@/auth/tokenStore';

export function Login(): JSX.Element {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
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
      history.replaceState({}, '', '/portal/login'); navigate('/dashboard');
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '统一身份认证失败。')).finally(() => setLoading(false));
  }, [navigate]);

  const handleLogin = async (): Promise<void> => {
    setError(undefined); setLoading(true);
    try {
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
          <h1>客户登录</h1><p>欢迎使用{productBrand.bank.customerPortalName}</p>
          <div className="login-tabs"><button className="active">客户登录</button><a href="/ops/">员工登录</a></div>
          <label>用户名 / 手机号</label><Input size="large" placeholder="将在统一身份认证页面输入" prefix="人" readOnly />
          <label>密码</label><Input.Password size="large" placeholder="将在统一身份认证页面输入" prefix="锁" readOnly />
          {error ? <Alert type="error" showIcon message="登录失败" description={error} closable onClose={() => setError(undefined)} data-testid="login-error" /> : null}
          <div className="login-options"><Checkbox disabled>记住我</Checkbox><a href="#help">忘记密码？</a></div>
          <Button type="primary" size="large" block loading={loading} onClick={() => void handleLogin()} data-testid="login-submit">通过统一身份认证登录</Button>
          {loading ? <p className="login-progress">正在验证安全登录信息，请稍候…</p> : null}
          <div className="login-divider"><span>安全登录方式</span></div>
          <div className="login-methods"><span><b>盾</b>动态令牌</span><span><b>证</b>移动证书</span></div>
        </section>
        <aside className="login-assurance"><div className="login-shield">行</div><h2>安全 · 稳定 · 可审计</h2><p>本系统为银行业务演示环境，使用合成数据进行产品演示与功能验证。</p><ul><li><b>锁</b><span><strong>安全可靠</strong><small>OIDC、PKCE 与多重安全防护</small></span></li><li><b>稳</b><span><strong>稳定高效</strong><small>高可用架构与可恢复业务流程</small></span></li><li><b>审</b><span><strong>审计追踪</strong><small>完整操作日志满足审计要求</small></span></li></ul></aside>
      </main>
      <footer className="login-footer">© 2026 复兴银行　　隐私政策　│　使用条款　│　版本信息 V1.0.0</footer>
    </div>
  </PageContainer>;
}
