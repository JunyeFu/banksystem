import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { apiClient } from '@/api/client';
import type { PageState } from '@/components/PageContainer';
import type {
  AccountListResponse,
  BeneficiaryListResponse,
  TransferCreateResponse,
} from '@/types/models';

const { Title, Text } = Typography;
const { TextArea } = Input;

const transferSchema = z.object({
  fromAccountId: z.string().min(1, '请选择转出账户'),
  beneficiaryId: z.string().min(1, '请选择收款人'),
  amount: z.number().positive('转账金额必须大于0'),
  description: z.string().max(200, '备注不能超过200字'),
});

type TransferFormData = z.infer<typeof transferSchema>;

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

export function TransferCreate(): JSX.Element {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const accountsQuery = useQuery<AccountListResponse>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get<AccountListResponse>('/accounts'),
  });

  const beneficiariesQuery = useQuery<BeneficiaryListResponse>({
    queryKey: ['beneficiaries'],
    queryFn: () => apiClient.get<BeneficiaryListResponse>('/beneficiaries'),
  });

  const { control, handleSubmit, watch } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromAccountId: '',
      beneficiaryId: '',
      amount: 0,
      description: '',
    },
  });

  const selectedAccountId = watch('fromAccountId');
  const accounts = accountsQuery.data?.items ?? [];
  const beneficiaries = beneficiariesQuery.data?.items ?? [];
  const selectedAccount = accounts.find((a) => a.accountId === selectedAccountId);
  const currency = selectedAccount?.currency ?? 'CNY';

  const mutation = useMutation<TransferCreateResponse, Error, TransferFormData>({
    mutationFn: async (data) => {
      const beneficiary = beneficiaries.find((b) => b.id === data.beneficiaryId);
      if (!beneficiary) {
        throw new Error('选择的收款人不存在');
      }
      return apiClient.post<TransferCreateResponse>(
        '/transfers',
        {
          fromAccountId: data.fromAccountId,
          toAccount: beneficiary.accountNumber,
          amount: data.amount.toFixed(2),
          currency,
          description: data.description || undefined,
        },
        {
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      );
    },
    onSuccess: (response) => {
      navigate(`/transfers/${response.paymentId}`);
    },
    onError: (error) => {
      setSubmitError(error.message);
    },
  });

  const onSubmit = (data: TransferFormData): void => {
    setSubmitError(null);
    mutation.mutate(data);
  };

  const accountOptions = accounts.map((a) => ({
    label: `${a.maskedAccountNumber} — 余额 ${a.balance} ${a.currency}`,
    value: a.accountId,
  }));

  const beneficiaryOptions = beneficiaries.map((b) => ({
    label: `${b.name} — ${maskAccountNumber(b.accountNumber)}`,
    value: b.id,
  }));

  const pageState: PageState =
    accountsQuery.isLoading || beneficiariesQuery.isLoading
      ? 'LOADING'
      : accountsQuery.isError || beneficiariesQuery.isError
        ? 'ERROR'
        : 'READY';

  return (
    <PageContainer pageId="customer.transfer.create" state={pageState} title="新建转账">
      <div style={{ padding: '24px', maxWidth: 600 }}>
        <Title level={4}>填写转账信息</Title>

        {submitError !== null && (
          <Alert
            type="error"
            message="转账失败"
            description={submitError}
            style={{ marginBottom: 24 }}
            closable
            onClose={() => setSubmitError(null)}
            data-testid="transfer-error"
          />
        )}

        <form onSubmit={handleSubmit(onSubmit)} data-testid="transfer-form">
          <Form layout="vertical" component={false}>
            <Controller
              control={control}
              name="fromAccountId"
              render={({ field, fieldState: { error } }) => (
                <Form.Item
                  label="转出账户"
                  validateStatus={error ? 'error' : ''}
                  help={error?.message}
                >
                  <Select
                    data-testid="transfer-source-account"
                    value={field.value || undefined}
                    onChange={field.onChange}
                    placeholder="请选择转出账户"
                    loading={accountsQuery.isLoading}
                    options={accountOptions}
                  />
                </Form.Item>
              )}
            />

            <Controller
              control={control}
              name="beneficiaryId"
              render={({ field, fieldState: { error } }) => (
                <Form.Item
                  label="收款人"
                  validateStatus={error ? 'error' : ''}
                  help={error?.message}
                >
                  <Select
                    data-testid="transfer-beneficiary"
                    value={field.value || undefined}
                    onChange={field.onChange}
                    placeholder="请选择收款人"
                    loading={beneficiariesQuery.isLoading}
                    options={beneficiaryOptions}
                  />
                </Form.Item>
              )}
            />

            <Controller
              control={control}
              name="amount"
              render={({ field, fieldState: { error } }) => (
                <Form.Item
                  label="转账金额"
                  validateStatus={error ? 'error' : ''}
                  help={error?.message}
                >
                  <InputNumber
                    data-testid="transfer-amount"
                    value={field.value || undefined}
                    onChange={(v: number | null) => field.onChange(v ?? 0)}
                    style={{ width: '100%' }}
                    prefix={currency}
                    placeholder="请输入转账金额"
                    min={0.01}
                    precision={2}
                  />
                </Form.Item>
              )}
            />

            <Controller
              control={control}
              name="description"
              render={({ field, fieldState: { error } }) => (
                <Form.Item
                  label="备注（选填）"
                  validateStatus={error ? 'error' : ''}
                  help={error?.message}
                >
                  <TextArea
                    data-testid="transfer-description"
                    value={field.value}
                    onChange={field.onChange}
                    rows={3}
                    placeholder="请输入转账备注"
                    maxLength={200}
                    showCount
                  />
                </Form.Item>
              )}
            />

            {selectedAccount !== undefined && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                当前余额：{selectedAccount.balance} {selectedAccount.currency}
              </Text>
            )}

            <Space>
              <Button
                type="primary"
                htmlType="submit"
                data-testid="transfer-confirm"
                aria-label="确认转账"
                loading={mutation.isPending}
              >
                确认转账
              </Button>
              <Button
                data-testid="transfer-cancel"
                onClick={() => navigate('/transfers')}
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
