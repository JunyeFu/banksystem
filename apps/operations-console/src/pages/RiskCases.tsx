import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type { RiskDecision, RiskDecisionValue, RiskCaseStatus } from '@/types/models';

const { Text } = Typography;

const decisionColorMap: Record<RiskDecisionValue, string> = {
  ALLOW: 'success',
  REVIEW: 'warning',
  BLOCK: 'error',
};

const caseStatusColorMap: Record<RiskCaseStatus, string> = {
  OPEN: 'error',
  UNDER_REVIEW: 'processing',
  APPROVED: 'success',
  REJECTED: 'default',
};

function useRiskDecisions() {
  return useQuery<RiskDecision[], ApiError>({
    queryKey: ['risk-decisions'],
    queryFn: () => apiClient.get<RiskDecision[]>('/risk-decisions'),
  });
}

const columns: ColumnsType<RiskDecision> = [
  {
    title: '案件ID',
    dataIndex: 'id',
    key: 'id',
    width: 200,
    render: (value: string) => (
      <Text code copyable data-testid="risk-row-id">
        {value}
      </Text>
    ),
  },
  {
    title: '转账ID',
    dataIndex: 'transferId',
    key: 'transferId',
    width: 200,
    render: (value: string | null) =>
      value ? (
        <Text code data-testid="risk-row-transfer-id">
          {value}
        </Text>
      ) : (
        <Text type="secondary">-</Text>
      ),
  },
  {
    title: '客户主体',
    dataIndex: 'customerSubject',
    key: 'customerSubject',
    width: 160,
    render: (value: string) => (
      <span data-testid="risk-row-customer">{value}</span>
    ),
  },
  {
    title: '决策',
    dataIndex: 'decision',
    key: 'decision',
    width: 100,
    render: (value: RiskDecisionValue) => (
      <Tag color={decisionColorMap[value]} data-testid="risk-row-decision">
        {value}
      </Tag>
    ),
  },
  {
    title: '案件状态',
    dataIndex: 'status',
    key: 'status',
    width: 140,
    render: (value: RiskCaseStatus) => (
      <Tag color={caseStatusColorMap[value]} data-testid="risk-row-status">
        {value}
      </Tag>
    ),
  },
  {
    title: '风险评分',
    dataIndex: 'score',
    key: 'score',
    width: 100,
    align: 'right',
    render: (value: number) => (
      <span data-testid="risk-row-score">{value}</span>
    ),
  },
  {
    title: '触发规则',
    dataIndex: 'triggeredRules',
    key: 'triggeredRules',
    width: 240,
    render: (value: string[]) => (
      <span data-testid="risk-row-rules">
        {value.length > 0 ? value.join(', ') : <Text type="secondary">-</Text>}
      </span>
    ),
  },
  {
    title: 'Maker',
    dataIndex: 'maker',
    key: 'maker',
    width: 140,
    render: (value: string) => (
      <span data-testid="risk-row-maker">{value}</span>
    ),
  },
  {
    title: 'Checker',
    dataIndex: 'checker',
    key: 'checker',
    width: 140,
    render: (value: string | null) =>
      value ? (
        <span data-testid="risk-row-checker">{value}</span>
      ) : (
        <Text type="secondary">-</Text>
      ),
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 200,
  },
  {
    title: '审核时间',
    dataIndex: 'reviewedAt',
    key: 'reviewedAt',
    width: 200,
    render: (value: string | null) => value ?? <Text type="secondary">-</Text>,
  },
];

export function RiskCases(): JSX.Element {
  const { data, isLoading, isError } = useRiskDecisions();

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  return (
    <PageContainer pageId="operations.risk.cases" state={pageState} title="风险案件">
      <Table<RiskDecision>
        columns={columns}
        dataSource={data ?? []}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        data-testid="risk-cases"
        scroll={{ x: 1520 }}
      />
    </PageContainer>
  );
}
