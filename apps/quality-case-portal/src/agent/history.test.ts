import { describe, expect, it } from 'vitest';
import { AgentApiError } from './api';
import { conversationStatus, historyError, historyGroup, mergeById } from './history';

describe('history projection helpers', () => {
  it('groups actual update dates without inferring business status', () => {
    const now = new Date(2026, 0, 1, 1);
    expect(historyGroup(new Date(2026, 0, 1, 0).toISOString(), now)).toBe('今天');
    expect(historyGroup(new Date(2025, 11, 31, 23).toISOString(), now)).toBe('昨天');
    expect(historyGroup(new Date(2025, 11, 30).toISOString(), now)).toBe('更早');
  });
  it('keeps first position by message ID while accepting the authoritative duplicate value', () => {
    expect(mergeById([{ id: 'old', text: '早' }, { id: 'shared', text: '旧值' }], [{ id: 'shared', text: '权威值' }, { id: 'new', text: '晚' }]))
      .toEqual([{ id: 'old', text: '早' }, { id: 'shared', text: '权威值' }, { id: 'new', text: '晚' }]);
  });
  it('does not merge same-title conversations or truncate message bodies', () => {
    const text = '完整历史正文\n'.repeat(3000);
    expect(mergeById([{ id: 'one', text }], [{ id: 'two', text }])).toEqual([{ id: 'one', text }, { id: 'two', text }]);
  });
  it('does not manufacture test success or rollback from conversation state', () => {
    expect(conversationStatus.COMPLETED).toBe('已完成');
    expect(conversationStatus.STOP_REQUESTED).toBe('已请求停止');
    expect(conversationStatus.INTERRUPTED).toBe('待人工核对');
    expect(Object.values(conversationStatus).join('')).not.toMatch(/通过|回滚/);
  });
  it('keeps public API errors without displaying raw dependency errors', () => {
    const publicError = new AgentApiError('AGENT_CONVERSATION_NOT_FOUND', 404);
    expect(historyError(publicError)).toBe(publicError);
    expect(historyError(new Error('synthetic-private-payload')).code).toBe('AGENT_HISTORY_UNAVAILABLE');
  });
});
