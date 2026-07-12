import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Descriptions,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type { ClearingBatch, ClearingBatchStatus } from '@/types/models';

const { Text } = Typography;

const clearingStatusColorMap: Record<ClearingBatchStatus, string> = {
  PENDING: 'default',
  PROCESSING: 'processing',
  COMPLETED: 'success',
  FAILED: 'error',
};

function useClearingBatches() {
  return useQuery<ClearingBatch[], ApiError>({
    queryKey: ['clearing-batches'],
    queryFn: () => apiClient.get<ClearingBatch[]>('/clearing/batches'),
  });
}

const columns: ColumnsType<ClearingBatch> = [
  {
    title: '批次ID',
    dataIndex: 'batchId',
    key: 'batchId',
    width: 200,
    render: (value: string) => (
      <Text code copyable data-testid="clearing-row-batch-id">
        {value}
      </Text>
    ),
  },
  {
    title: '业务日期',
    dataIndex: 'businessDate',
    key: 'businessDate',
    width: 140,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 140,
    render: (value: ClearingBatchStatus) => (
      <Tag color={clearingStatusColorMap[value]} data-testid="clearing-row-status">
        {value}
      </Tag>
    ),
  },
  {
    title: '总笔数',
    dataIndex: 'totalItems',
    key: 'totalItems',
    width: 100,
    align: 'right',
  },
  {
    title: '结算笔数',
    dataIndex: 'settledItems',
    key: 'settledItems',
    width: 100,
    align: 'right',
  },
  {
    title: '失败笔数',
    dataIndex: 'failedItems',
    key: 'failedItems',
    width: 100,
    align: 'right',
    render: (value: number) => (
      <span
        data-testid="clearing-row-failed"
        style={{ color: value > 0 ? '#cf1322' : undefined }}
      >
        {value}
      </span>
    ),
  },
  {
    title: '总金额',
    dataIndex: 'totalAmount',
    key: 'totalAmount',
    width: 160,
    align: 'right',
    render: (value: string) => (
      <span data-testid="clearing-row-amount">{value}</span>
    ),
  },
  {
    title: '币种',
    dataIndex: 'currency',
    key: 'currency',
    width: 80,
    align: 'center',
  },
  {
    title: '开始时间',
    dataIndex: 'startedAt',
    key: 'startedAt',
    width: 200,
    render: (value: string | null) => value ?? <Text type="secondary">-</Text>,
  },
  {
    title: '完成时间',
    dataIndex: 'completedAt',
    key: 'completedAt',
    width: 200,
    render: (value: string | null) => value ?? <Text type="secondary">-</Text>,
  },
];

export function Clearing(): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useClearingBatches();

  const triggerMutation = useMutation<ClearingBatch, ApiError, void>({
    mutationFn: () =>
      apiClient.post<ClearingBatch>(
        '/clearing/batches',
        undefined,
        { idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clearing-batches'] });
    },
  });

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  const latestBatch = data && data.length > 0 ? data[0] : null;

  return (
    <PageContainer pageId="operations.clearing" state={pageState} title="清算">
      <Card style={{ marginBottom: 16 }} data-testid="clearing-panel">
        <Space direction="vertical" style={{ width: '100%' }}>
          <h3>触发清算批次</h3>
          <Button
            type="primary"
            size="large"
            loading={triggerMutation.isPending}
            onClick={() => triggerMutation.mutate()}
            data-testid="clearing-trigger-btn"
            aria-label="触发清算批次"
          >
            执行清算 (Run Clearing)
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            清算将处理待结算的转账批次，完成资金交割与账户记账。
          </Text>
        </Space>
      </Card>

      {latestBatch && (
        <Card
          title="最新清算批次状态"
          style={{ marginBottom: 16 }}
          data-testid="clearing-latest-result"
        >
          <Descriptions
            column={2}
            bordered
            size="small"
            data-testid="clearing-latest-descriptions"
          >
            <Descriptions.Item label="批次ID" data-testid="clearing-latest-batch-id">
              <Text code>{latestBatch.batchId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="状态" data-testid="clearing-latest-status">
              <Tag color={clearingStatusColorMap[latestBatch.status]}>
                {latestBatch.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="业务日期" data-testid="clearing-latest-business-date">
              {latestBatch.businessDate}
            </Descriptions.Item>
            <Descriptions.Item label="总笔数" data-testid="clearing-latest-total-items">
              {latestBatch.totalItems}
            </Descriptions.Item>
            <Descriptions.Item label="结算笔数" data-testid="clearing-latest-settled-items">
              {latestBatch.settledItems}
            </Descriptions.Item>
            <Descriptions.Item label="失败笔数" data-testid="clearing-latest-failed-items">
              {latestBatch.failedItems}
            </Descriptions.Item>
            <Descriptions.Item label="开始时间" data-testid="clearing-latest-started-at">
              {latestBatch.startedAt ?? <Text type="secondary">-</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="完成时间" data-testid="clearing-latest-completed-at">
              {latestBatch.completedAt ?? <Text type="secondary">-</Text>}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card title="清算批次列表" data-testid="clearing-batches-card">
        <Table<ClearingBatch>
          columns={columns}
          dataSource={data ?? []}
          rowKey="batchId"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          data-testid="clearing-batches-table"
          scroll={{ x: 1300 }}
        />
      </Card>

      {triggerMutation.isError && (
        <div
          data-testid="clearing-mutation-error"
          role="alert"
          style={{ marginTop: 16, color: '#cf1322' }}
        >
          清算触发失败: {triggerMutation.error?.message}
        </div>
      )}
    </PageContainer>
  );
}
