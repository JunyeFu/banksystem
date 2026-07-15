import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Form,
  Select,
  InputNumber,
  Input,
  Alert,
  Typography,
  Space,
} from 'antd';
import { PageContainer } from '@/components/PageContainer';
import { customerApi } from '@/api/client';
import type { LoanApplication } from '@localbank/bank-api-client';

const { Title } = Typography;
const { TextArea } = Input;

const termOptions = [
  { label: '12个月', value: 12 },
  { label: '24个月', value: 24 },
  { label: '36个月', value: 36 },
  { label: '48个月', value: 48 },
  { label: '60个月', value: 60 },
];

const validTerms = termOptions.map((o) => o.value);

const loanSchema = z.object({
  amount: z.number().positive('贷款金额必须大于0'),
  termMonths: z.number().refine((v) => validTerms.includes(v), '请选择贷款期限'),
  purpose: z
    .string()
    .min(1, '请输入贷款用途')
    .max(500, '贷款用途不能超过500字'),
});

type LoanFormData = z.infer<typeof loanSchema>;

export function LoanApply(): JSX.Element {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      amount: 0,
      termMonths: 0,
      purpose: '',
    },
  });

  const mutation = useMutation<LoanApplication, Error, LoanFormData>({
    mutationFn: async (data) => {
      return customerApi.createLoanApplication({
        amount: data.amount.toFixed(2),
        termMonths: data.termMonths,
        purpose: data.purpose,
      });
    },
    onSuccess: () => {
      navigate('/loans');
    },
    onError: (error) => {
      setSubmitError(error.message);
    },
  });

  const onSubmit = (data: LoanFormData): void => {
    setSubmitError(null);
    mutation.mutate(data);
  };

  return (
    <PageContainer pageId="customer.loans.apply" state="READY" title="申请贷款">
      <div style={{ padding: '24px', maxWidth: 600 }}>
        <Title level={4}>填写贷款申请信息</Title>

        {submitError !== null && (
          <Alert
            type="error"
            message="申请失败"
            description={submitError}
            style={{ marginBottom: 24 }}
            closable
            onClose={() => setSubmitError(null)}
            data-testid="loan-apply-error"
          />
        )}

        <form onSubmit={handleSubmit(onSubmit)} data-testid="loan-apply-form">
          <Form layout="vertical" component={false}>
            <Controller
              control={control}
              name="amount"
              render={({ field, fieldState: { error } }) => (
                <Form.Item
                  label="贷款金额"
                  validateStatus={error ? 'error' : ''}
                  help={error?.message}
                >
                  <InputNumber
                    data-testid="loan-apply-amount"
                    value={field.value || undefined}
                    onChange={(v: number | null) => field.onChange(v ?? 0)}
                    style={{ width: '100%' }}
                    prefix="CNY"
                    placeholder="请输入贷款金额"
                    min={0.01}
                    precision={2}
                  />
                </Form.Item>
              )}
            />

            <Controller
              control={control}
              name="termMonths"
              render={({ field, fieldState: { error } }) => (
                <Form.Item
                  label="贷款期限"
                  validateStatus={error ? 'error' : ''}
                  help={error?.message}
                >
                  <Select
                    data-testid="loan-apply-term"
                    value={field.value || undefined}
                    onChange={field.onChange}
                    placeholder="请选择贷款期限"
                    options={termOptions}
                  />
                </Form.Item>
              )}
            />

            <Controller
              control={control}
              name="purpose"
              render={({ field, fieldState: { error } }) => (
                <Form.Item
                  label="贷款用途"
                  validateStatus={error ? 'error' : ''}
                  help={error?.message}
                >
                  <TextArea
                    data-testid="loan-apply-purpose"
                    value={field.value}
                    onChange={field.onChange}
                    rows={4}
                    placeholder="请详细描述贷款用途"
                    maxLength={500}
                    showCount
                  />
                </Form.Item>
              )}
            />

            <Space>
              <Button
                type="primary"
                htmlType="submit"
                data-testid="loan-apply-submit"
                aria-label="提交申请"
                loading={mutation.isPending}
              >
                提交申请
              </Button>
              <Button
                data-testid="loan-apply-cancel"
                onClick={() => navigate('/loans')}
                disabled={mutation.isPending}
              >
                取消
              </Button>
            </Space>
          </Form>
        </form>
      </div>
    </PageContainer>
  );
}
