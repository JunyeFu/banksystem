import { describe, expect, it } from 'vitest';
import { dateTime, money, transferStatusText } from './index';

describe('bank UI formatting', () => {
  it('formats decimal strings without performing business arithmetic', () => {
    expect(money('8800.00', 'CNY')).toBe('8,800.00 CNY');
  });

  it('keeps invalid timestamps visible for diagnostics', () => {
    expect(dateTime('not-a-time')).toBe('not-a-time');
  });

  it('owns labels for every transfer state', () => {
    expect(Object.keys(transferStatusText)).toHaveLength(12);
    expect(transferStatusText.SETTLED).toBe('已结算');
    expect(transferStatusText.RISK_REVIEW).toBe('风险复核');
  });
});
