import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import type { LoanApplication } from '@localbank/bank-api-client';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

const schema = z.object({ amount: z.number().positive('请输入大于 0 的贷款金额'), termMonths: z.number().min(1, '请选择贷款期限'), purpose: z.string().min(1, '请选择贷款用途'), repaymentMethod: z.string().min(1), note: z.string().max(200).optional() });
type LoanForm = z.infer<typeof schema>;
const terms = [12, 24, 36, 48, 60].map((value) => ({ value, label: `${value}个月` }));

export function LoanApply(): JSX.Element {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const { control, handleSubmit, watch } = useForm<LoanForm>({ resolver: zodResolver(schema), defaultValues: { amount: 300000, termMonths: 36, purpose: '经营周转', repaymentMethod: '等额本息', note: '' } });
  const values = watch();
  const mutation = useMutation<LoanApplication, Error, LoanForm>({ mutationFn: (value) => customerApi.createLoanApplication({ amount: value.amount.toFixed(2), termMonths: value.termMonths, purpose: value.purpose }), onSuccess: () => { setSubmitted(true); }, });
  const monthly = values.amount > 0 && values.termMonths > 0 ? values.amount * (1 + 0.0435 * values.termMonths / 12) / values.termMonths : 0;
  if (submitted) return <PageContainer pageId="customer.loans.apply" state="READY"><section className="customer-page"><div className="bank-card loan-application-result"><b>✓</b><h1>贷款申请已提交</h1><p>复兴银行已受理您的申请，后续进度将通过消息中心通知。</p><Button type="primary" onClick={() => navigate('/loans')}>返回我的贷款</Button></div></section></PageContainer>;
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
            <Controller name="repaymentMethod" control={control} render={({ field }) => <Form.Item label="还款方式" required><Select {...field} style={{ width: '100%' }} options={[{ value: '等额本息', label: '等额本息' }, { value: '等额本金', label: '等额本金' }]} /></Form.Item>} />
            <Form.Item label="首期还款日" required><DatePicker style={{ width: '100%' }} value={undefined} placeholder="审批放款后确定" disabled /></Form.Item>
            <Controller name="note" control={control} render={({ field, fieldState }) => <Form.Item label="备注" validateStatus={fieldState.error ? 'error' : ''} help={fieldState.error?.message}><Input.TextArea {...field} style={{ width: '100%' }} rows={3} maxLength={200} showCount placeholder="请输入备注信息（选填）" /></Form.Item>} />
          </div>
          <aside className="bank-card loan-summary-card"><h2>申请信息摘要</h2><dl><div><dt>贷款金额</dt><dd className="bank-accent">{values.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} CNY</dd></div><div><dt>期限</dt><dd>{values.termMonths} 个月</dd></div><div><dt>用途</dt><dd>{values.purpose}</dd></div><div><dt>还款方式</dt><dd>{values.repaymentMethod}</dd></div><div><dt>预计年利率</dt><dd>4.35%</dd></div><div><dt>预计月还款额</dt><dd>{monthly.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CNY</dd></div></dl><div className="loan-note">以上信息为预估结果，实际审批结果以复兴银行最终审核为准。</div></aside>
        </div>
        <div className="loan-form-actions"><Button size="large" onClick={() => navigate('/loans')} disabled={mutation.isPending}>返回</Button><Button type="primary" size="large" htmlType="submit" loading={mutation.isPending}>提交申请</Button></div>
      </form>
    </section>
  </PageContainer>;
}
