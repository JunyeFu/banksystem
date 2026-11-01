import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Form, Input, InputNumber, Select, Tag } from 'antd';
import type { LoanApplication } from '@localbank/bank-api-client';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const schema = z.object({ amount: z.number().positive('请输入大于 0 的贷款金额'), termMonths: z.number().min(1, '请选择贷款期限'), purpose: z.string().min(1, '请选择贷款用途'), repaymentMethod: z.string().min(1), note: z.string().max(200).optional() });
type LoanForm = z.infer<typeof schema>;
const terms = [12, 24, 36, 48, 60].map((value) => ({ value, label: `${value}个月` }));

export function LoanApply(): JSX.Element {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState<LoanApplication | null>(null);
  const { control, handleSubmit, watch } = useForm<LoanForm>({ resolver: zodResolver(schema), defaultValues: { amount: 300000, termMonths: 36, purpose: '经营周转', repaymentMethod: 'EQUAL_INSTALLMENTS', note: '' } });
  const values = watch();
  const mutation = useMutation<LoanApplication, Error, LoanForm>({
    mutationFn: async (value) => {
      const draft = await customerApi.createLoanApplication({
        amount: value.amount.toFixed(2), termMonths: value.termMonths, purpose: value.purpose,
        repaymentMethod: value.repaymentMethod, note: value.note || undefined,
      });
      return customerApi.submitLoanApplication(draft.applicationId, draft.version);
    },
    onSuccess: setSubmitted,
  });
  if (submitted) return <PageContainer pageId="customer.loans.apply" state="READY"><section className="customer-page"><div className="bank-card loan-application-result"><b>✓</b><h1>贷款申请已提交</h1><p>申请编号：{submitted.applicationId}</p><p>金额：{submitted.amount} {submitted.currency}　期限：{submitted.termMonths} 个月</p><p>报价年利率：{submitted.quotedAnnualInterestRate}%　<Tag color="blue">{submitted.status}</Tag></p><Button type="primary" onClick={() => navigate('/loans')}>返回我的贷款</Button></div></section></PageContainer>;
  return <PageContainer pageId="customer.loans.apply" state="READY">
    <section className="customer-page experience-page loan-application" data-view-state={mutation.isPending ? 'SUBMITTING' : mutation.isError ? 'ERROR' : 'DEFAULT'}>
      <div className="customer-breadcrumb">贷款　/　申请贷款</div>
      <div className="customer-page-head"><div><h1>申请贷款</h1><p>请填写贷款申请信息，我们将尽快为您审核。</p></div></div>
      {mutation.isError ? <Alert type="error" showIcon message="申请提交失败" description="服务暂时不可用，您的表单内容已保留，请稍后重试。" /> : null}
      <form onSubmit={handleSubmit((value) => mutation.mutate(value))}>
        <div className="loan-application-layout">
          <div className="bank-card loan-form-card"><h2>贷款申请信息</h2>
            <Controller name="amount" control={control} render={({ field, fieldState }) => <Form.Item label="贷款金额" required validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><InputNumber {...field} style={{ width: '100%' }} min={0} precision={2} addonAfter="CNY" onChange={(value) => field.onChange(value ?? 0)} /></Form.Item>} />
            <Controller name="termMonths" control={control} render={({ field, fieldState }) => <Form.Item label="期限" required validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Select {...field} style={{ width: '100%' }} options={terms} /></Form.Item>} />
            <Controller name="purpose" control={control} render={({ field, fieldState }) => <Form.Item label="用途" required validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Select {...field} style={{ width: '100%' }} options={['经营周转','个人消费','车辆购置','房屋装修'].map((value) => ({ value, label: value }))} /></Form.Item>} />
            <Controller name="repaymentMethod" control={control} render={({ field }) => <Form.Item label="还款方式" required><Select {...field} style={{ width: '100%' }} options={[{ value: 'EQUAL_INSTALLMENTS', label: '等额本息' }, { value: 'EQUAL_PRINCIPAL', label: '等额本金' }]} /></Form.Item>} />
            <Controller name="note" control={control} render={({ field, fieldState }) => <Form.Item label="备注" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Input.TextArea {...field} style={{ width: '100%' }} rows={3} maxLength={200} showCount placeholder="请输入备注信息（选填）" /></Form.Item>} />
          </div>
          <aside className="bank-card loan-summary-card"><h2>申请信息摘要</h2><dl><div><dt>贷款金额</dt><dd className="bank-accent">{values.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} CNY</dd></div><div><dt>期限</dt><dd>{values.termMonths} 个月</dd></div><div><dt>用途</dt><dd>{values.purpose}</dd></div><div><dt>还款方式</dt><dd>{values.repaymentMethod === 'EQUAL_INSTALLMENTS' ? '等额本息' : '等额本金'}</dd></div><div><dt>报价年利率</dt><dd>提交后由银行返回</dd></div></dl><div className="loan-note">审批金额、利率与还款计划以银行系统返回结果为准。</div></aside>
        </div>
        <div className="loan-form-actions"><Button size="large" onClick={() => navigate('/loans')} disabled={mutation.isPending}>返回</Button><Button type="primary" size="large" htmlType="submit" loading={mutation.isPending}>提交申请</Button></div>
      </form>
    </section>
  </PageContainer>;
}
