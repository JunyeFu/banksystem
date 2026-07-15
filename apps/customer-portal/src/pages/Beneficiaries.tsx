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
import { customerApi } from '@/api/client';
import type { Beneficiary } from '@localbank/bank-api-client';

const { Text } = Typography;

export function Beneficiaries(): JSX.Element {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['beneficiaries'],
    queryFn: () => customerApi.listBeneficiaries(),
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
          {beneficiaries.map((b: Beneficiary) => (
            <Col span={8} key={b.beneficiaryId}>
              <Card
                data-testid={`beneficiary-card-${b.beneficiaryId}`}
                hoverable
                onClick={() => navigate('/transfers/new')}
              >
                <p>
                  <strong data-testid={`beneficiary-name-${b.beneficiaryId}`}>
                    {b.displayName}
                  </strong>
                </p>
                <p>
                  <Text type="secondary">账号：</Text>
                  <span data-testid={`beneficiary-account-${b.beneficiaryId}`}>
                    {b.maskedAccountNumber}
                  </span>
                </p>
                <p><Tag>复兴银行已核验</Tag></p>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </PageContainer>
  );
}
