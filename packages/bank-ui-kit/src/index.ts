export const bankTheme = {
  token: {
    colorPrimary: '#d9161c',
    colorInfo: '#1677ff',
    colorSuccess: '#16a05d',
    colorWarning: '#ef8b16',
    colorError: '#d9363e',
    borderRadius: 6,
    fontFamily: "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    colorText: '#16181d',
    colorTextSecondary: '#646b78',
    colorBorder: '#dfe3e8',
  },
} as const;

export const productBrand = {
  bank: {
    shortName: '复兴银行',
    customerPortalName: '复兴银行客户门户',
    operationsConsoleName: '复兴银行运营控制台',
  },
  regressionPlatform: {
    shortName: '衡准',
    displayName: '衡准自动化回归测试平台',
  },
} as const;

export const transferStatusText = {
  CREATED: '已创建', VALIDATING: '校验中', RISK_REVIEW: '风险复核',
  PENDING_APPROVAL: '待审批', PENDING_CORE_POSTING: '核心入账中',
  PENDING_CLEARING: '清算中', SETTLED: '已结算', FAILED: '失败',
  TIMED_OUT: '已超时', RETURNED: '已退回', REVERSAL_PENDING: '冲正中', REVERSED: '已冲正',
} as const;

export function money(value: string, currency = 'CNY'): string {
  const amount = Number(value);
  return `${Number.isFinite(amount) ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value} ${currency}`;
}

export function dateTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}
