import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Col,
  Row,
  Statistic,
  Descriptions,
  Button,
  Tag,
  Space,
  Empty,
} from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { customerApi } from '@/api/client';

function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'APPROVED':
    case 'ACTIVE':
    case 'DISBURSED':
      return 'green';
    case 'PENDING':
    case 'REVIEW':
      return 'blue';
    case 'REJECTED':
    case 'CLOSED':
      return 'red';
    default:
      return 'default';
  }
}

function statusText(status: string): string {
  switch (status.toUpperCase()) {
    case 'APPROVED':
      return '已批准';
    case 'ACTIVE':
      return '活跃';
    case 'DISBURSED':
      return '已放款';
    case 'PENDING':
      return '待审核';
    case 'REVIEW':
      return '审核中';
    case 'REJECTED':
      return '已拒绝';
    case 'CLOSED':
      return '已结清';
    default:
      return status;
  }
}

export function LoanDetail(): JSX.Element {
  const { loanId } = useParams<{ loanId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['loan', loanId],
    queryFn: () => customerApi.getLoan(loanId ?? ''),
    enabled: !!loanId,
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  return (
    <PageContainer
      pageId="customer.loan.detail"
      state={pageState}
      title="贷款详情"
    >
      <div data-testid="loan-detail" style={{ padding: '24px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Button
            onClick={() => navigate('/loans')}
            data-testid="loan-detail-back"
          >
            返回
          </Button>

          {isError && (
            <Empty description="加载贷款详情失败" data-testid="loan-detail-error" />
          )}

          {data !== undefined && (
            <>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="本金"
                      value={data.principal}
                      precision={2}
                      prefix={data.currency}
                      data-testid="loan-detail-principal"
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="未还余额"
                      value={data.outstandingBalance}
                      precision={2}
                      prefix={data.currency}
                      data-testid="loan-detail-outstanding"
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="期限"
                      value={data.termMonths}
                      suffix="个月"
                      data-testid="loan-detail-term"
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="利率"
                      value={data.interestRate ?? '-'}
                      suffix="%"
                      data-testid="loan-detail-rate"
                    />
                  </Card>
                </Col>
              </Row>

              <Card>
                <Descriptions bordered column={1}>
                  <Descriptions.Item label="贷款编号">
                    <span data-testid="loan-detail-id">{data.loanId}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="贷款产品">
                    <span data-testid="loan-detail-product">
                      {data.loanProductName}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag
                      color={statusColor(data.status)}
                      data-testid="loan-detail-status"
                    >
                      {statusText(data.status)}
                    </Tag>
                  </Descriptions.Item>
                  {data.startDate !== undefined && (
                    <Descriptions.Item label="开始日期">
                      <span data-testid="loan-detail-start-date">
                        {data.startDate}
                      </span>
                    </Descriptions.Item>
                  )}
                  {data.endDate !== undefined && (
                    <Descriptions.Item label="到期日期">
                      <span data-testid="loan-detail-end-date">
                        {data.endDate}
                      </span>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            </>
          )}
        </Space>
      </div>
    </PageContainer>
  );
}
