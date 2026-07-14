import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Skeleton, Empty } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { CustomerProfile } from '@/types/models';

export function Profile(): JSX.Element {
  const { data, isLoading, isError } = useQuery<CustomerProfile>({
    queryKey: ['profile'],
    queryFn: () => apiClient.get<CustomerProfile>('/profile'),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  return (
    <PageContainer
      pageId="customer.profile"
      state={pageState}
      title="个人资料"
    >
      <div data-testid="profile-detail" style={{ padding: '24px' }}>
        {isLoading && <Skeleton active />}

        {!isLoading && isError && (
          <Empty description="加载个人资料失败" data-testid="profile-error" />
        )}

        {!isLoading && !isError && data === undefined && (
          <Empty description="未找到个人资料" data-testid="profile-empty" />
        )}

        {data !== undefined && (
          <Card>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="客户编号">
                <span data-testid="profile-customer-id">{data.customerId}</span>
              </Descriptions.Item>
              <Descriptions.Item label="姓名">
                <span data-testid="profile-name">{data.displayName}</span>
              </Descriptions.Item>
              <Descriptions.Item label="邮箱">
                <span data-testid="profile-email">{data.email}</span>
              </Descriptions.Item>
              <Descriptions.Item label="手机号">
                <span data-testid="profile-phone">{data.phone ?? '-'}</span>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
