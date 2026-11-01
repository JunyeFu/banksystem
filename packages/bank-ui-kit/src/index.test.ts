import { describe, expect, it } from 'vitest';
import { dateTime, money, productBrand, transferStatusText } from './index';

describe('bank UI formatting', () => {
  it('exposes the approved product names', () => {
    expect(productBrand.bank.shortName).toBe('复兴银行');
    expect(productBrand.bank.displayName).toBe('复兴银行数字银行系统');
    expect(productBrand.bank.customerPortalName).toBe('复兴银行门户');
    expect(productBrand.bank.operationsConsoleName).toBe('复兴银行运营控制台');
    expect(productBrand.regressionPlatform.displayName).toBe('衡准自动化回归测试平台');
  });

  it('formats decimal strings without performing business arithmetic', () => {
    expect(money('8800.00', 'CNY')).toBe('8,800.00 CNY');
  });

  it('keeps invalid timestamps visible for diagnostics', () => {
    expect(dateTime('not-a-time')).toBe('not-a-time');
  });

  it('owns labels for every transfer state', () => {
    expect(transferStatusText).toEqual({
      CREATED: '已创建', VALIDATING: '校验中', RISK_REVIEW: '风险复核',
      PENDING_APPROVAL: '待审批', PENDING_CORE_POSTING: '核心入账中',
      PENDING_CLEARING: '清算中', CORE_RESULT_UNKNOWN: '核心结果待确认',
      SETTLED: '已结算', FAILED: '失败', TIMED_OUT: '已超时',
      RETURN_PENDING: '退回处理中', RETURN_RESULT_UNKNOWN: '退回结果待确认',
      RETURNED: '已退回', REVERSAL_PENDING: '冲正中', REVERSED: '已冲正',
    });
  });
});
