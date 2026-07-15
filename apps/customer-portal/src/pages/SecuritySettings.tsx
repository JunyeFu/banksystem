import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Tag, Skeleton, Empty } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { customerApi } from '@/api/client';

export function SecuritySettings(): JSX.Element {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['security-settings'],
    queryFn: () => customerApi.getSecuritySettings(),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  return (
    <PageContainer
      pageId="customer.security"
      state={pageState}
      title="安全设置"
    >
      <div data-testid="security-settings" style={{ padding: '24px' }}>
        {isLoading && <Skeleton active />}

        {!isLoading && isError && (
          <Empty description="加载安全设置失败" data-testid="security-settings-error" />
        )}

        {!isLoading && !isError && data === undefined && (
          <Empty description="未找到安全设置" data-testid="security-settings-empty" />
        )}

        {data !== undefined && (
          <Card>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="多因素认证 (MFA)">
                {data.mfaEnabled ? (
                  <Tag color="green" data-testid="security-mfa-enabled">
                    已启用
                  </Tag>
                ) : (
                  <Tag color="red" data-testid="security-mfa-disabled">
                    未启用
                  </Tag>
                )}
              </Descriptions.Item>
              {data.mfaMethod !== undefined && (
                <Descriptions.Item label="MFA方式">
                  <span data-testid="security-mfa-method">{data.mfaMethod}</span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="登录通知">
                {data.loginNotificationsEnabled ? (
                  <Tag color="green" data-testid="security-login-notify-on">
                    已开启
                  </Tag>
                ) : (
                  <Tag color="default" data-testid="security-login-notify-off">
                    未开启
                  </Tag>
                )}
              </Descriptions.Item>
              {data.lastLoginAt !== undefined && (
                <Descriptions.Item label="上次登录时间">
                  <span data-testid="security-last-login">{data.lastLoginAt}</span>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
