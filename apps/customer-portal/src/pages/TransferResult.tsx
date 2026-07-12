import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Button, Typography, Tag, Space, Empty } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { TransferDetailResponse } from '@/types/models';

const { Title } = Typography;

function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
      return 'green';
    case 'PENDING':
    case 'PROCESSING':
      return 'blue';
    case 'FAILED':
    case 'REJECTED':
      return 'red';
    default:
      return 'default';
  }
}

function statusText(status: string): string {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
      return '已完成';
    case 'PENDING':
      return '处理中';
    case 'PROCESSING':
      return '处理中';
    case 'FAILED':
      return '失败';
    case 'REJECTED':
      return '已拒绝';
    default:
      return status;
  }
}

export function TransferResult(): JSX.Element {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<TransferDetailResponse>({
    queryKey: ['transfer', paymentId],
    queryFn: () =>
      apiClient.get<TransferDetailResponse>(`/transfers/${paymentId}`),
    enabled: !!paymentId,
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  return (
    <PageContainer
      pageId="customer.transfer.result"
      state={pageState}
      title="转账结果"
    >
      <div data-testid="transfer-result" style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button onClick={() => navigate(-1)} data-testid="transfer-result-back">
            返回
          </Button>

          {data !== undefined ? (
            <Card>
              <Title level={4}>转账详情</Title>
              <Descriptions bordered column={1}>
                <Descriptions.Item label="转账编号">
                  <span data-testid="transfer-result-payment-id">
                    {data.paymentId}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusColor(data.status)} data-testid="transfer-result-status">
                    {statusText(data.status)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="金额">
                  <span data-testid="transfer-result-amount">
                    {data.amount} {data.currency}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="转出账户">
                  <span data-testid="transfer-result-from-account">
                    {data.fromAccountId}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="收款账户">
                  <span data-testid="transfer-result-to-account">
                    {data.toAccount}
                  </span>
                </Descriptions.Item>
                {data.coreReference !== undefined && (
                  <Descriptions.Item label="核心参考号">
                    <span data-testid="transfer-result-core-reference">
                      {data.coreReference}
                    </span>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="创建时间">
                  {data.createdDate}
                </Descriptions.Item>
                {data.description !== undefined && (
                  <Descriptions.Item label="备注">
                    {data.description}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          ) : (
            !isLoading &&
            !isError && (
              <Empty description="未找到转账记录" data-testid="transfer-result-not-found" />
            )
          )}

          <Space>
            <Button
              type="primary"
              onClick={() => navigate('/transfers/new')}
              data-testid="transfer-result-new-transfer"
            >
              新建转账
            </Button>
            <Button
              onClick={() => navigate('/dashboard')}
              data-testid="transfer-result-dashboard"
            >
              返回首页
            </Button>
          </Space>
        </Space>
      </div>
    </PageContainer>
  );
}
