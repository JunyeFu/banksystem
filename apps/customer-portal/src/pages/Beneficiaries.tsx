import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Col,
  Row,
  Button,
  Typography,
  Tag,
  Empty,
  Skeleton,
} from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { apiClient } from '@/api/client';
import type { BeneficiaryListResponse } from '@/types/models';

const { Text } = Typography;

function maskAccountNumber(accountNumber: string): string {
  const visible = 4;
  if (accountNumber.length <= visible * 2) {
    return accountNumber;
  }
  const first = accountNumber.slice(0, visible);
  const last = accountNumber.slice(-visible);
  const masked = '*'.repeat(accountNumber.length - visible * 2);
  return `${first}${masked}${last}`;
}

export function Beneficiaries(): JSX.Element {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<BeneficiaryListResponse>({
    queryKey: ['beneficiaries'],
    queryFn: () => apiClient.get<BeneficiaryListResponse>('/beneficiaries'),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  const beneficiaries = data?.items ?? [];

  return (
    <PageContainer
      pageId="customer.beneficiaries"
      state={pageState}
      title="收款人管理"
    >
      <div data-testid="beneficiary-list" style={{ padding: '24px' }}>
        <Button
          type="primary"
          onClick={() => navigate('/transfers/new')}
          style={{ marginBottom: 24 }}
          data-testid="beneficiary-new-transfer"
        >
          新建转账
        </Button>

        {isLoading && <Skeleton active />}

        {!isLoading && beneficiaries.length === 0 && !isError && (
          <Empty
            description="暂无收款人"
            data-testid="beneficiary-empty"
          />
        )}

        <Row gutter={[16, 16]}>
          {beneficiaries.map((b) => (
            <Col span={8} key={b.id}>
              <Card
                data-testid={`beneficiary-card-${b.id}`}
                hoverable
                onClick={() => navigate('/transfers/new')}
              >
                <p>
                  <strong data-testid={`beneficiary-name-${b.id}`}>
                    {b.name}
                  </strong>
                </p>
                <p>
                  <Text type="secondary">账号：</Text>
                  <span data-testid={`beneficiary-account-${b.id}`}>
                    {maskAccountNumber(b.accountNumber)}
                  </span>
                </p>
                {b.bankName !== undefined && (
                  <p>
                    <Tag data-testid={`beneficiary-bank-${b.id}`}>
                      {b.bankName}
                    </Tag>
                  </p>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </PageContainer>
  );
}
