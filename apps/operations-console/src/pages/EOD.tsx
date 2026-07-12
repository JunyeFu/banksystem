import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Descriptions,
  List,
  Space,
  Tag,
  Typography,
} from 'antd';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type { EodRunResult, EodRunStatus, ReconciliationStatus } from '@/types/models';

const { Text } = Typography;

const eodStatusColorMap: Record<EodRunStatus, string> = {
  RUNNING: 'processing',
  COMPLETED: 'success',
  FAILED: 'error',
};

const reconStatusColorMap: Record<ReconciliationStatus, string> = {
  CREATED: 'default',
  RUNNING: 'processing',
  MATCHED: 'success',
  DIFFERENCE_FOUND: 'warning',
  FAILED: 'error',
};

function useLatestEodRun() {
  return useQuery<EodRunResult, ApiError>({
    queryKey: ['eod-latest'],
    queryFn: () => apiClient.get<EodRunResult>('/eod/latest'),
  });
}

export function EOD(): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useLatestEodRun();

  const triggerMutation = useMutation<EodRunResult, ApiError, void>({
    mutationFn: () =>
      apiClient.post<EodRunResult>(
        '/eod/run',
        undefined,
        { idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['eod-latest'] });
    },
  });

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  return (
    <PageContainer pageId="operations.eod" state={pageState} title="日终处理">
      <Card style={{ marginBottom: 16 }} data-testid="eod-panel">
        <Space direction="vertical" style={{ width: '100%' }}>
          <h3>触发日终处理</h3>
          <Button
            type="primary"
            size="large"
            loading={triggerMutation.isPending}
            onClick={() => triggerMutation.mutate()}
            data-testid="eod-trigger-btn"
            aria-label="触发日终处理"
          >
            执行日终处理 (Run EOD)
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            日终处理包含：对账检查、余额核对、业务日期推进。
          </Text>
        </Space>
      </Card>

      {data && (
        <Card
          title="最新日终运行状态"
          style={{ marginBottom: 16 }}
          data-testid="eod-latest-result"
        >
          <Descriptions
            column={2}
            bordered
            size="small"
            data-testid="eod-latest-descriptions"
          >
            <Descriptions.Item label="运行ID" data-testid="eod-latest-run-id">
              <Text code>{data.runId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="状态" data-testid="eod-latest-status">
              <Tag color={eodStatusColorMap[data.status]}>{data.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="业务日期" data-testid="eod-latest-business-date">
              {data.businessDate}
            </Descriptions.Item>
            <Descriptions.Item label="对账状态" data-testid="eod-latest-recon-status">
              {data.reconciliationStatus ? (
                <Tag color={reconStatusColorMap[data.reconciliationStatus]}>
                  {data.reconciliationStatus}
                </Tag>
              ) : (
                <Text type="secondary">-</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="开始时间" data-testid="eod-latest-started-at">
              {data.startedAt}
            </Descriptions.Item>
            <Descriptions.Item label="完成时间" data-testid="eod-latest-completed-at">
              {data.completedAt ?? <Text type="secondary">-</Text>}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 16 }}>
            <h4>已完成步骤</h4>
            <List
              size="small"
              bordered
              dataSource={data.stepsCompleted}
              renderItem={(step, index) => (
                <List.Item data-testid={`eod-step-${index}`}>
                  <Space>
                    <Tag color="green">DONE</Tag>
                    <Text>{step}</Text>
                  </Space>
                </List.Item>
              )}
              locale={{ emptyText: '无已完成步骤' }}
              data-testid="eod-steps-list"
            />
          </div>
        </Card>
      )}

      {triggerMutation.isError && (
        <div
          data-testid="eod-mutation-error"
          role="alert"
          style={{ marginTop: 16, color: '#cf1322' }}
        >
          日终处理触发失败: {triggerMutation.error?.message}
        </div>
      )}
    </PageContainer>
  );
}
