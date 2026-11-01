import { isFuxingBankDemoAdapter } from './target-adapter-registry';

export type BankAccountObservation = {
  schemaVersion: 'bank-account-fields/v1';
  fields: Array<'IDENTIFIER' | 'CURRENCY' | 'BALANCE' | 'STATUS'>;
  currency?: 'CNY';
};

// These labels belong to the explicit demo adapter, not a generic synonym list.
export const ACCOUNT_FIELD_LABELS = { IDENTIFIER: '账号', CURRENCY: '币种', BALANCE: '可用余额', STATUS: '状态' } as const;

export function accountObservation(instruction: string, binding: unknown): BankAccountObservation | undefined {
  if (!isFuxingBankDemoAdapter(binding) || !/账户列表/.test(instruction) ||
      !/标识|编号|账号|余额|币种|状态|账户信息|账户[、；;]/.test(instruction)) return undefined;
  const fields: BankAccountObservation['fields'] = ['IDENTIFIER'];
  if (/人民币|CNY|币种/.test(instruction)) fields.push('CURRENCY');
  if (/余额/.test(instruction)) fields.push('BALANCE');
  if (/状态/.test(instruction)) fields.push('STATUS');
  return { schemaVersion: 'bank-account-fields/v1', fields, ...(/人民币|CNY/.test(instruction) ? { currency: 'CNY' as const } : {}) };
}

// Kept closure-free: the same implementation is embedded into the immutable
// candidate, so authoring and scheduled/formal execution cannot diverge.
export async function assertBankAccountFields(page: any, observation: BankAccountObservation): Promise<void> {
  await page.getByRole('columnheader', { name: '账号', exact: true }).first().waitFor({ state: 'visible' });
  const code = await page.locator('table').evaluateAll((tables: HTMLTableElement[], spec: BankAccountObservation) => {
    const labels = { IDENTIFIER: '账号', CURRENCY: '币种', BALANCE: '可用余额', STATUS: '状态' };
    const visible = (node: Element) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden';
    const table = tables.find(item => visible(item) && Array.from(item.querySelectorAll('th')).some(th => th.textContent?.trim() === '账号'));
    if (!table) return 'BANK_ACCOUNT_FIELDS_FAILED';
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(visible).map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.replace(/\s+/g, ' ').trim() || ''));
    if (!rows.length || !rows.some(row => row.length >= headers.length)) return 'BANK_ACCOUNT_ROWS_MISSING';
    const candidates = spec.currency ? rows.filter(row => row[headers.indexOf('币种')] === spec.currency) : rows;
    if (!candidates.length) return 'BANK_ACCOUNT_CURRENCY_FAILED';
    for (const row of candidates) for (const field of spec.fields) {
      const index = headers.indexOf(labels[field]);
      const value = row[index] || '';
      if (index < 0 || !value || /^(?:—|-|暂无|未知)$/.test(value)) return 'BANK_ACCOUNT_FIELDS_FAILED';
      if (field === 'BALANCE' && !/^(?:CN¥|CNY|[¥￥])?\s*-?\d[\d,]*\.\d{2}\s*(?:CNY)?$/.test(value)) return 'BANK_ACCOUNT_FIELDS_FAILED';
    }
    return null;
  }, observation);
  if (code) throw Object.assign(new Error(code), { code });
}

export async function assertNoPageErrors(page: any): Promise<void> {
  const failed = await page.locator('[data-view-state="ERROR"],[data-hz-state="ERROR"],.ant-alert-error,[role="alert"]').evaluateAll((nodes: HTMLElement[]) =>
    nodes.some(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden' &&
      (node.matches('[data-view-state="ERROR"],[data-hz-state="ERROR"],.ant-alert-error') || /错误|异常|失败|error|failed/i.test(node.textContent || ''))));
  if (failed) throw Object.assign(new Error('WORKER_PAGE_ERROR_PRESENT'), { code: 'WORKER_PAGE_ERROR_PRESENT' });
}
