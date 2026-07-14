import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type { Transfer, TransferStatus } from '@/types/models';

const { Search } = Input;
const { Text } = Typography;

const statusColorMap: Record<TransferStatus, string> = {
  CREATED: 'default',
  VALIDATING: 'processing',
  RISK_REVIEW: 'warning',
  PENDING_APPROVAL: 'processing',
  PENDING_CORE_POSTING: 'processing',
  PENDING_CLEARING: 'processing',
  SETTLED: 'success',
  FAILED: 'error',
  TIMED_OUT: 'error',
  RETURNED: 'error',
  REVERSAL_PENDING: 'warning',
  REVERSED: 'error',
};

function useTransfers(search: string | undefined) {
  return useQuery<Transfer[], ApiError>({
    queryKey: ['transfers', search],
    queryFn: () => {
      const params = search ? `?status=${search}` : '';
      return apiClient.get<Transfer[]>(`/transfers${params}`);
    },
  });
}

const columns: ColumnsType<Transfer> = [
  {
    title: '转账ID',
    dataIndex: 'transferId',
    key: 'transferId',
    width: 200,
    render: (value: string) => (
      <Text code copyable data-testid={`payment-row-${value}-id`}>
        {value}
      </Text>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 160,
    render: (value: TransferStatus) => (
      <Tag color={statusColorMap[value]} data-testid="payment-status-tag">
        {value}
      </Tag>
    ),
  },
  {
    title: '金额',
    dataIndex: 'amount',
    key: 'amount',
    width: 140,
    align: 'right',
    render: (value: string) => (
      <span data-testid="payment-amount">{value}</span>
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
    title: '核心参考号',
    dataIndex: 'coreReference',
    key: 'coreReference',
    width: 180,
    render: (value: string | null) => value ?? <Text type="secondary">—</Text>,
  },
  {
    title: '关联ID',
    dataIndex: 'correlationId',
    key: 'correlationId',
    width: 180,
    render: (value: string | null) => value ?? <Text type="secondary">—</Text>,
  },
];

export function PaymentMonitoring(): JSX.Element {
  const [searchValue, setSearchValue] = useState<string>('');

  const { data, isLoading, isError } = useTransfers(searchValue || undefined);

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  return (
    <PageContainer pageId="operations.payments" state={pageState} title="支付监控">
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Search
          placeholder="按状态筛选（如 RISK_REVIEW）"
          allowClear
          enterButton
          style={{ width: 400 }}
          onSearch={(value: string) => setSearchValue(value)}
          data-testid="payment-search"
          aria-label="按状态筛选支付"
        />
      </Space>

      <Table<Transfer>
        columns={columns}
        dataSource={data ?? []}
        rowKey="transferId"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        data-testid="payment-table"
        scroll={{ x: 940 }}
      />
    </PageContainer>
  );
}
