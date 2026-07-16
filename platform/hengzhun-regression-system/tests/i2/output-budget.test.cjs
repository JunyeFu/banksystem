'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ABSOLUTE_OUTPUT_LIMIT_BYTES,
  OUTPUT_BUDGETS,
  paginateToBudget,
  serializeWithinBudget
} = require('../../dist/harness/src/output-budget.js');

test('L0-L3 use confirmed UTF-8 byte budgets and 128 KiB absolute limit', () => {
  assert.deepEqual(OUTPUT_BUDGETS, {
    L0: { targetBytes: 4096, limitBytes: 8192 },
    L1: { targetBytes: 8192, limitBytes: 16384 },
    L2: { targetBytes: 32768, limitBytes: 65536 },
    L3: { targetBytes: 65536, limitBytes: 131072 }
  });
  assert.equal(ABSOLUTE_OUTPUT_LIMIT_BYTES, 131072);
});

test('budget counts complete UTF-8 JSON bytes and rejects one-byte overflow', () => {
  for (const level of ['L0', 'L1', 'L2', 'L3']) {
    const limit = OUTPUT_BUDGETS[level].limitBytes;
    const prefixBytes = Buffer.byteLength('{"value":"', 'utf8') + Buffer.byteLength('"}', 'utf8');
    const exact = { value: 'a'.repeat(limit - prefixBytes) };
    assert.equal(serializeWithinBudget(exact, level).byteLength, limit);
    assert.throws(() => serializeWithinBudget({ value: exact.value + 'a' }, level), error => error.errorCode === 'OUTPUT_BUDGET_EXCEEDED');
  }
  const chinese = { value: '衡'.repeat(100) };
  assert.equal(serializeWithinBudget(chinese, 'L0').byteLength, Buffer.byteLength(JSON.stringify(chinese), 'utf8'));
});

test('pagination stops at complete item boundaries with a resumable cursor', () => {
  const items = Array.from({ length: 50 }, (_, index) => ({ index, text: `条目-${index}-` + 'x'.repeat(400) }));
  const page = paginateToBudget({ kind: 'diagnostic' }, items, 'L0', 0, 50);
  assert.ok(page.items.length > 0);
  assert.ok(page.items.length < items.length);
  assert.equal(page.truncated, true);
  assert.equal(Number(page.nextCursor), page.items.length);
  assert.doesNotThrow(() => JSON.parse(serializeWithinBudget(page, 'L0').body.toString('utf8')));
  const second = paginateToBudget({ kind: 'diagnostic' }, items, 'L0', Number(page.nextCursor), 50);
  assert.equal(second.items[0].index, page.items.length);
});

test('a single unsplittable entry fails instead of truncating JSON or UTF-8', () => {
  const item = { text: '衡'.repeat(4000) };
  assert.throws(
    () => paginateToBudget({ kind: 'diagnostic' }, [item], 'L0', 0, 1),
    error => error.errorCode === 'OUTPUT_BUDGET_EXCEEDED'
  );
});
