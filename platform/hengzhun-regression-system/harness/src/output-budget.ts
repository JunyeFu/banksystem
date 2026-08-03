import { HarnessError } from './errors';

export type OutputLevel = 'L0' | 'L1' | 'L2' | 'L3';

export const OUTPUT_BUDGETS: Record<OutputLevel, { targetBytes: number; limitBytes: number }> = {
  L0: { targetBytes: 4 * 1024, limitBytes: 8 * 1024 },
  L1: { targetBytes: 8 * 1024, limitBytes: 16 * 1024 },
  L2: { targetBytes: 32 * 1024, limitBytes: 64 * 1024 },
  L3: { targetBytes: 64 * 1024, limitBytes: 128 * 1024 }
};

export const ABSOLUTE_OUTPUT_LIMIT_BYTES = 128 * 1024;

export interface SerializedResponse {
  body: Buffer;
  byteLength: number;
}

export function serializeWithinBudget(value: unknown, level: OutputLevel): SerializedResponse {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const limit = Math.min(OUTPUT_BUDGETS[level].limitBytes, ABSOLUTE_OUTPUT_LIMIT_BYTES);
  if (body.byteLength > limit) {
    throw new HarnessError(
      413,
      'OUTPUT_BUDGET_EXCEEDED',
      'CONTRACT',
      `响应超过 ${level} 输出预算。`,
      false,
      false,
      { level, limitBytes: limit, actualBytes: body.byteLength }
    );
  }
  return { body, byteLength: body.byteLength };
}

export function paginateToBudget<T>(
  base: Record<string, unknown>,
  items: T[],
  level: OutputLevel,
  startIndex: number,
  requestedLimit: number
): Record<string, unknown> {
  const selected: T[] = [];
  const maximum = Math.max(1, Math.min(requestedLimit, 100));
  let index = startIndex;
  for (; index < items.length && selected.length < maximum; index += 1) {
    const candidate = {
      ...base,
      items: [...selected, items[index]],
      truncated: index + 1 < items.length,
      nextCursor: index + 1 < items.length ? String(index + 1) : null
    };
    try {
      serializeWithinBudget(candidate, level);
      selected.push(items[index] as T);
    } catch (error) {
      if (selected.length === 0) throw error;
      break;
    }
  }
  return {
    ...base,
    items: selected,
    truncated: startIndex + selected.length < items.length,
    nextCursor: startIndex + selected.length < items.length ? String(startIndex + selected.length) : null
  };
}
