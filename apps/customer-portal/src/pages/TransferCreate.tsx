import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Form, Input, InputNumber, Select, Skeleton, Space } from 'antd';
import { money } from '@localbank/bank-ui-kit';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const schema = z.object({ sourceAccountId: z.string().min(1, '请选择转出账户'), beneficiaryId: z.string().uuid('请选择收款人'), amount: z.number().positive('转账金额必须大于 0'), reference: z.string().max(240, '备注不能超过 240 字') });
type FormData = z.infer<typeof schema>;

export function TransferCreate(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [submitError, setSubmitError] = useState<string>();
  const [review, setReview] = useState<FormData>();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => customerApi.listAccounts() });
  const beneficiaries = useQuery({ queryKey: ['beneficiaries'], queryFn: () => customerApi.listBeneficiaries() });
  const { control, handleSubmit, setValue, watch } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { sourceAccountId: '', beneficiaryId: '', amount: 0, reference: '' } });
  const sourceId = watch('sourceAccountId'); const beneficiaryId = watch('beneficiaryId'); const amount = watch('amount');
  const isControlledScenario = searchParams.get('i10Scenario') === '1';
  const account = accounts.data?.items.find((item) => item.accountId === sourceId);
  const beneficiary = beneficiaries.data?.items.find((item) => item.beneficiaryId === beneficiaryId);
  useEffect(() => {
    const requestedSource = searchParams.get('sourceAccountId');
    const requestedBeneficiary = searchParams.get('beneficiaryId');
    if (!sourceId && requestedSource && accounts.data?.items.some((item) => item.accountId === requestedSource)) setValue('sourceAccountId', requestedSource);
    else if (!sourceId && isControlledScenario && accounts.data?.items[0]) setValue('sourceAccountId', accounts.data.items[0].accountId);
    else if (!sourceId && accounts.data?.items.length === 1 && accounts.data.items[0]) setValue('sourceAccountId', accounts.data.items[0].accountId);
    if (!beneficiaryId && requestedBeneficiary && beneficiaries.data?.items.some((item) => item.beneficiaryId === requestedBeneficiary)) setValue('beneficiaryId', requestedBeneficiary);
    else if (!beneficiaryId && isControlledScenario && beneficiaries.data?.items[0]) setValue('beneficiaryId', beneficiaries.data.items[0].beneficiaryId);
    else if (!beneficiaryId && beneficiaries.data?.items.length === 1 && beneficiaries.data.items[0]) setValue('beneficiaryId', beneficiaries.data.items[0].beneficiaryId);
  }, [accounts.data, beneficiaries.data, beneficiaryId, isControlledScenario, searchParams, setValue, sourceId]);
  const mutation = useMutation({
    mutationFn: (value: FormData) => customerApi.createTransfer({ sourceAccountId: value.sourceAccountId, beneficiaryId: value.beneficiaryId, amount: value.amount.toFixed(2), currency: account?.currency ?? 'CNY', reference: value.reference || undefined }, idempotencyKey),
    onSuccess: (result) => navigate(`/verification?transferId=${encodeURIComponent(result.transferId)}`), onError: (error: Error) => setSubmitError(error.message),
  });
  const accountOptions = useMemo(() => accounts.data?.items.map((item) => ({ value: item.accountId, label: `${item.maskedAccountNumber}（${item.accountType ?? '活期账户'}）　可用余额 ${money(item.balance, item.currency)}` })) ?? [], [accounts.data]);
  const beneficiaryOptions = useMemo(() => beneficiaries.data?.items.map((item) => ({ value: item.beneficiaryId, label: `${item.displayName}（${item.maskedAccountNumber}）` })) ?? [], [beneficiaries.data]);
  const loading = accounts.isLoading || beneficiaries.isLoading;
  return (
    <PageContainer pageId="customer.transfer.create" state="READY">
      <div className="customer-breadcrumb">转账列表　/　<strong>新建转账</strong></div>
      {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : <div className="customer-transfer-layout" data-view-state={mutation.isPending ? 'SUBMITTING' : submitError ? 'ERROR' : 'DEFAULT'}>
        <form className="transfer-form-panel" onSubmit={handleSubmit((value) => { setSubmitError(undefined); setReview(value); })} data-testid="transfer-form">
          {submitError ? <Alert type="error" showIcon message="转账提交失败" description={submitError} closable onClose={() => setSubmitError(undefined)} style={{ marginBottom: 24 }} data-testid="transfer-error" /> : null}
          <Form layout="vertical" component={false}>
            <Controller name="sourceAccountId" control={control} render={({ field, fieldState }) => <Form.Item label="转账类型" required validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Select {...field} value={field.value || undefined} options={accountOptions} placeholder="请选择转出账户" size="large" data-testid="transfer-source-account" /></Form.Item>} />
            <Controller name="beneficiaryId" control={control} render={({ field, fieldState }) => <Form.Item label={<span className="transfer-beneficiary-label"><span>收款人</span><a href="/portal/beneficiaries">管理收款人</a></span>} required validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Select {...field} value={field.value || undefined} options={beneficiaryOptions} placeholder="请选择收款人" size="large" showSearch optionFilterProp="label" data-testid="transfer-beneficiary" /></Form.Item>} />
            <Controller name="amount" control={control} render={({ field, fieldState }) => <Form.Item label="转账金额" required validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Space.Compact style={{ width: '100%' }}><InputNumber value={field.value || undefined} onChange={(value) => field.onChange(value ?? 0)} min={0.01} precision={2} placeholder="请输入转账金额" size="large" style={{ flex: 1 }} data-testid="transfer-amount" /><Input value={account?.currency ?? 'CNY'} readOnly aria-label="币种" style={{ width: 74, textAlign: 'center' }} /></Space.Compact></Form.Item>} />
            <Controller name="reference" control={control} render={({ field, fieldState }) => <Form.Item label="备注" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Input.TextArea {...field} rows={4} placeholder="请输入转账备注（选填）" showCount maxLength={240} data-testid="transfer-description" /></Form.Item>} />
            <div className="transfer-actions"><Button onClick={() => navigate('/transfers')}>取消</Button><Button type="primary" htmlType="submit" data-testid="transfer-submit">确认转账</Button></div>
          </Form>
        </form>
        <aside className="bank-card transfer-summary"><h2>转账摘要</h2><div className="transfer-summary__item"><span>转出账户</span><strong>{account?.maskedAccountNumber ?? '待选择'}</strong><p className="bank-muted">{account?.accountType ?? '—'}</p></div><div className="transfer-summary__item"><span>收款人</span><strong>{beneficiary?.displayName ?? '待选择'}</strong><p className="bank-muted">{beneficiary?.maskedAccountNumber ?? '—'}</p></div><div className="transfer-summary__item transfer-summary__total"><span>转账金额</span><strong>{money(String(amount || 0), account?.currency ?? 'CNY')}</strong></div><div className="transfer-summary__item"><span>手续费</span><strong>0.00 {account?.currency ?? 'CNY'}</strong></div><div className="transfer-summary__item transfer-summary__total"><span>合计</span><strong>{money(String(amount || 0), account?.currency ?? 'CNY')}</strong></div></aside>
      </div>}
      {review ? <div className="bank-card" style={{ marginTop: 24 }} data-testid="transfer-review">
        <h2>转账确认摘要</h2><p>请核对转出账户、收款人和金额。首次确认后将进入本机 U 盾验证页面。</p>
        <Space><Button onClick={() => setReview(undefined)}>返回修改</Button><Button type="primary" loading={mutation.isPending} onClick={() => { setSubmitError(undefined); mutation.mutate(review); }} data-testid="transfer-first-confirm">首次确认并继续</Button></Space>
      </div> : null}
    </PageContainer>
  );
}
