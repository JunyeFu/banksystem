import { type AgentResponse } from './api';

export type Turn = AgentResponse<'getAgentTurn'>;
export type Model = AgentResponse<'listAgentModels'>['models'][number];
export const isActiveTurn = (turn?: Turn) => turn?.status === 'RUNNING' || turn?.status === 'STOP_REQUESTED';
export function mergeTurn(previous: Turn | undefined, incoming: Turn): Turn {
  if (!previous || previous.id !== incoming.id) return incoming;
  const events = [...new Map([...previous.events, ...incoming.events].map(event => [event.sequence, event])).values()]
    .sort((a, b) => a.sequence - b.sequence);
  return { ...previous, ...(incoming.version >= previous.version ? incoming : {}), events };
}
export function turnOutcome(turn: Turn): string {
  if (turn.status === 'RUNNING') return '正在执行，尚未得到最终结论';
  if (turn.status === 'STOP_REQUESTED') return '已请求停止，仍在核对结果';
  if (turn.status === 'NEEDS_INPUT') return '请补充原任务所需信息';
  if (turn.status === 'INTERRUPTED') return '执行中断，结果未知，需要人工介入';
  if (turn.status === 'FAILED') return '任务失败，需要人工介入';
  if (turn.result.kind === 'TEST' && turn.result.verdict === 'PASSED') return '测试通过';
  if (turn.result.kind === 'TEST' && turn.result.verdict === 'FAILED') return '测试未通过';
  if (turn.result.kind === 'TEST') return '业务结果尚未核验';
  return '回复完成，未执行测试';
}
