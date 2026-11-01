import { describe, expect, it } from 'vitest';
import { isActiveTurn, mergeTurn, turnOutcome, type Turn } from './turn';

const turn: Turn = { id: 'one', conversationId: 'conversation', version: 1, status: 'RUNNING', inputMessageId: 'input',
  modelBinding: { profileId: 'model', profileVersion: 1, model: 'isolated-test', baseUrlHash: 'a'.repeat(64), releaseIdentityHash: 'b'.repeat(64) },
  createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z', events: [{ sequence: 1, type: 'ACCEPTED', summary: '已登记', createdAt: '2026-10-22T00:00:00Z' }],
  hasMoreEvents: false, humanInterventionRequired: false, result: { kind: 'REPLY', verdict: 'NOT_RUN' } };
describe('authoritative turn projection', () => {
  it('deduplicates paged events by sequence and retains their real order', () => {
    const merged = mergeTurn(turn, { ...turn, version: 2, events: [ { ...turn.events[0], sequence: 3 }, turn.events[0], { ...turn.events[0], sequence: 2 } ] });
    expect(merged.events.map(event => event.sequence)).toEqual([1, 2, 3]);
    expect(mergeTurn(merged, turn)).toEqual(merged);
    const olderPage = { ...turn, events: [{ ...turn.events[0], sequence: 4 }] };
    expect(mergeTurn(merged, olderPage).events.map(event => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(mergeTurn(merged, olderPage).version).toBe(2);
  });
  it('does not merge events across distinct turns', () => expect(mergeTurn(turn, { ...turn, id: 'other', events: [] }).events).toEqual([]));
  it('completion without TEST/PASSED is not a passed test', () => {
    expect(turnOutcome({ ...turn, status: 'COMPLETED' })).toBe('回复完成，未执行测试');
    expect(turnOutcome({ ...turn, status: 'COMPLETED', result: { kind: 'TEST', verdict: 'UNKNOWN' } })).toBe('业务结果尚未核验');
    expect(turnOutcome({ ...turn, status: 'COMPLETED', result: { kind: 'TEST', verdict: 'PASSED' } })).toBe('测试通过');
  });
  it('stop remains active until authoritative terminal readback', () => {
    expect(isActiveTurn({ ...turn, status: 'STOP_REQUESTED' })).toBe(true);
    expect(turnOutcome({ ...turn, status: 'STOP_REQUESTED' })).toContain('仍在核对');
    expect(isActiveTurn({ ...turn, status: 'INTERRUPTED' })).toBe(false);
    expect(turnOutcome({ ...turn, status: 'INTERRUPTED' })).toContain('结果未知');
  });
});
