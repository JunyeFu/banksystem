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
import type {
  ReconciliationBatch,
  ReconciliationBatchType,
  ReconciliationStatus,
} from '@/types/models';

const { Text } = Typography;

const RECONCILIATION_TYPES: { value: ReconciliationBatchType; label: string; description: string }[] = [
  { value: 'CHANNEL_TO_CORE', label: '渠道到核心', description: 'Channel to Core 对账' },
  { value: 'CHANNEL_TO_CLEARING', label: '渠道到清算', description: 'Channel to Clearing 对账' },
  { value: 'CORE_TO_GENERAL_LEDGER', label: '核心到总账', description: 'Core to General Ledger 对账' },
];

const reconStatusColorMap: Record<ReconciliationStatus, string> = {
  CREATED: 'default',
  RUNNING: 'processing',
  MATCHED: 'success',
  DIFFERENCE_FOUND: 'warning',
  FAILED: 'error',
};

function useReconciliationBatches() {
  return useQuery<ReconciliationBatch[], ApiError>({
    queryKey: ['reconciliation-batches'],
    queryFn: () => apiClient.get<ReconciliationBatch[]>('/reconciliations'),
  });
}

const batchTypeLabelMap: Record<ReconciliationBatchType, string> = {
  CHANNEL_TO_CORE: '渠道到核心',
  CHANNEL_TO_CLEARING: '渠道到清算',
  CORE_TO_GENERAL_LEDGER: '核心到总账',
};

const columns: ColumnsType<ReconciliationBatch> = [
  {
    title: '对账类型',
    dataIndex: 'batchType',
    key: 'batchType',
    width: 160,
    render: (value: ReconciliationBatchType) => (
      <span data-testid="recon-row-batch-type">{batchTypeLabelMap[value]}</span>
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
    width: 160,
    render: (value: ReconciliationStatus) => (
      <Tag color={reconStatusColorMap[value]} data-testid="recon-row-status">
        {value}
      </Tag>
    ),
  },
  {
    title: '源记录数',
    dataIndex: 'sourceCount',
    key: 'sourceCount',
    width: 100,
    align: 'right',
  },
  {
    title: '目标记录数',
    dataIndex: 'targetCount',
    key: 'targetCount',
    width: 100,
    align: 'right',
  },
  {
    title: '差异数量',
    dataIndex: 'differenceCount',
    key: 'differenceCount',
    width: 100,
    align: 'right',
    render: (value: number) => (
      <span
        data-testid="recon-row-difference-count"
        style={{ color: value > 0 ? '#cf1322' : undefined }}
      >
        {value}
      </span>
    ),
  },
  {
    title: '差异金额',
    dataIndex: 'differenceAmount',
    key: 'differenceAmount',
    width: 140,
    align: 'right',
    render: (value: string) => (
      <span data-testid="recon-row-difference-amount">{value}</span>
    ),
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

export function Reconciliation(): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useReconciliationBatches();

  const triggerMutation = useMutation<
    ReconciliationBatch,
    ApiError,
    ReconciliationBatchType
  >({
    mutationFn: (batchType: ReconciliationBatchType) =>
      apiClient.post<ReconciliationBatch>(
        '/reconciliations',
        { batchType },
        { idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reconciliation-batches'] });
    },
  });

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  const latestBatch = data && data.length > 0 ? data[0] : null;

  return (
    <PageContainer pageId="operations.reconciliation" state={pageState} title="对账">
      <Card style={{ marginBottom: 16 }} data-testid="reconciliation-panel">
        <h3>触发对账</h3>
        <Space wrap>
          {RECONCILIATION_TYPES.map((type) => (
            <Button
              key={type.value}
              type="primary"
              loading={triggerMutation.isPending}
              onClick={() => triggerMutation.mutate(type.value)}
              data-testid={`recon-trigger-${type.value}`}
              aria-label={`触发${type.label}对账`}
            >
              {type.label}
            </Button>
          ))}
        </Space>
        <p style={{ marginTop: 8, color: '#888' }}>
          {RECONCILIATION_TYPES.map((t) => t.description).join(' · ')}
        </p>
      </Card>

      {latestBatch && (
        <Card
          title="最新对账结果"
          style={{ marginBottom: 16 }}
          data-testid="recon-latest-result"
        >
          <Descriptions
            column={2}
            bordered
            size="small"
            data-testid="recon-latest-descriptions"
          >
            <Descriptions.Item label="对账类型" data-testid="recon-latest-batch-type">
              {batchTypeLabelMap[latestBatch.batchType]}
            </Descriptions.Item>
            <Descriptions.Item label="状态" data-testid="recon-latest-status">
              <Tag color={reconStatusColorMap[latestBatch.status]}>
                {latestBatch.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="业务日期" data-testid="recon-latest-business-date">
              {latestBatch.businessDate}
            </Descriptions.Item>
            <Descriptions.Item label="差异数量" data-testid="recon-latest-difference-count">
              {latestBatch.differenceCount}
            </Descriptions.Item>
            <Descriptions.Item label="源记录数" data-testid="recon-latest-source-count">
              {latestBatch.sourceCount}
            </Descriptions.Item>
            <Descriptions.Item label="目标记录数" data-testid="recon-latest-target-count">
              {latestBatch.targetCount}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card title="对账批次列表" data-testid="recon-batches-card">
        <Table<ReconciliationBatch>
          columns={columns}
          dataSource={data ?? []}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          data-testid="recon-batches-table"
          scroll={{ x: 1100 }}
        />
      </Card>

      {triggerMutation.isError && (
        <div
          data-testid="recon-mutation-error"
          role="alert"
          style={{ marginTop: 16, color: '#cf1322' }}
        >
          对账触发失败: {triggerMutation.error?.message}
        </div>
      )}
    </PageContainer>
  );
}
