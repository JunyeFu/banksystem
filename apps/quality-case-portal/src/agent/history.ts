import { AgentApiError, type AgentResponse } from './api';

export type Conversation = AgentResponse<'createAgentConversation'>;
export type ConversationPage = AgentResponse<'getAgentConversation'>;
export type ConversationCreation = { busy: boolean; error: AgentApiError | null };
export const conversationStatus: Record<Conversation['status'], string> = {
  IDLE: '未开始', RUNNING: '执行中', NEEDS_INPUT: '待补充', COMPLETED: '已完成',
  FAILED: '失败', STOP_REQUESTED: '已请求停止', INTERRUPTED: '待人工核对',
};
export function historyGroup(timestamp: string, now = new Date()): '今天' | '昨天' | '更早' {
  const date = new Date(timestamp).toDateString();
  if (date === now.toDateString()) return '今天';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  return date === yesterday.toDateString() ? '昨天' : '更早';
}
export function mergeById<T extends { id: string }>(first: T[], second: T[]): T[] {
  return [...new Map([...first, ...second].map(item => [item.id, item])).values()];
}
export function historyError(error: unknown): AgentApiError {
  return error instanceof AgentApiError ? error : new AgentApiError('AGENT_HISTORY_UNAVAILABLE', 0);
}
