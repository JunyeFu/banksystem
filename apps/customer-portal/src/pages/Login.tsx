import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, Typography, Alert, Space } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import { buildAuthRequest, exchangeCodeForToken } from '@/auth/oidc';
import { setAccessToken } from '@/auth/tokenStore';

const { Title, Text } = Typography;

export function Login(): JSX.Element {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exchangedRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code || exchangedRef.current) return;
    exchangedRef.current = true;

    const storedState = sessionStorage.getItem('oidc_state');
    const returnedState = params.get('state');
    const verifier = sessionStorage.getItem('pkce_verifier');

    if (returnedState !== storedState) {
      setError('OIDC state mismatch — possible CSRF attack.');
      return;
    }
    if (!verifier) {
      setError('Missing PKCE verifier in session.');
      return;
    }

    setLoading(true);
    exchangeCodeForToken(code, verifier)
      .then((token) => {
        setAccessToken(token);
        sessionStorage.removeItem('pkce_verifier');
        sessionStorage.removeItem('oidc_state');
        history.replaceState({}, '', '/portal/login');
        navigate('/dashboard');
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'OIDC token exchange failed.',
        );
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  async function handleLogin(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const { authorizationUrl, verifier, state } = await buildAuthRequest();
      sessionStorage.setItem('pkce_verifier', verifier);
      sessionStorage.setItem('oidc_state', state);
      window.location.assign(authorizationUrl);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to initiate login.',
      );
      setLoading(false);
    }
  }

  return (
    <PageContainer pageId="customer.login" state={loading ? 'LOADING' : 'READY'}>
      <div style={{ maxWidth: 420, margin: '0 auto', paddingTop: 64 }}>
        <Title level={2} data-testid="login-title">
          安全登录
        </Title>
        <Text type="secondary">
          使用银行客户身份登录，令牌仅保存在当前页面内存中。
        </Text>

        {error !== null && (
          <Alert
            data-testid="login-error"
            type="error"
            message="登录失败"
            description={error}
            style={{ marginTop: 24 }}
            closable
            onClose={() => setError(null)}
          />
        )}

        <Form layout="vertical" style={{ marginTop: 32 }}>
          <Form.Item label="用户名">
            <Input
              data-testid="login-username"
              placeholder="输入您的客户用户名"
              disabled
            />
          </Form.Item>
          <Form.Item label="密码">
            <Input.Password
              data-testid="login-password"
              placeholder="输入您的密码"
              disabled
            />
          </Form.Item>
          <Form.Item>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                block
                data-testid="login-submit"
                loading={loading}
                onClick={handleLogin}
              >
                登录
              </Button>
              <Button
                block
                data-testid="login-sso"
                onClick={handleLogin}
                disabled={loading}
              >
                通过 OIDC SSO 登录
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>
    </PageContainer>
  );
}
