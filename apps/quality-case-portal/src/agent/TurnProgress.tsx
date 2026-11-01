import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { type Turn, turnOutcome, mergeTurn } from './turn';
import { type AgentClient } from './api';
import { historyError } from './history';
import check from './assets/check.svg';
import clock from './assets/clock-pending.svg';
import activeClock from './assets/clock-active.svg';
import attention from './assets/attention.svg';
import file from './assets/file.svg';
import down from './assets/down.svg';

export function TurnProgress({ turn: summary, client, onEvidence, hasAnswer = false }: { turn: Turn; client: AgentClient; onEvidence: (turn: Turn) => void; hasAnswer?: boolean }) {
  const [detail, setDetail] = useState<Turn>(), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const turn = detail ? { ...mergeTurn(detail, summary), hasMoreEvents: summary.version > detail.version ? summary.hasMoreEvents : detail.hasMoreEvents } : summary;
  async function readEvents() {
    if (lock.current || !turn.hasMoreEvents) return;
    lock.current = true; setLoading(true); setError('');
    let current = turn;
    try {
      do {
        const page = await client.request('getAgentTurn', { path: { turnId: turn.id }, query: { after: Math.max(0, ...current.events.map(event => event.sequence)), limit: 50 } });
        current = mergeTurn(current, page);
        if (!mounted.current) return;
        setDetail(current);
        if (!page.hasMoreEvents) break;
      } while (mounted.current);
    } catch (failure) { if (mounted.current) setError(historyError(failure).code); }
    finally { lock.current = false; if (mounted.current) setLoading(false); }
  }
  const success = turn.status === 'COMPLETED' && turn.result.kind === 'TEST' && turn.result.verdict === 'PASSED';
  const warning = turn.humanInterventionRequired || turn.status === 'FAILED';
  const eventItem = (event: Turn['events'][number]) => <li key={event.sequence} data-sequence={event.sequence}>
    <img src={event.type === 'COMPLETED' ? check : ['FAILED', 'INTERRUPTED'].includes(event.type) ? attention : event.type === 'TOOL_STARTED' ? activeClock : clock} width="16" height="16" alt="" />
    <div><p>{event.summary}</p><p className="hz-agent__muted">{event.toolName && <span>{event.toolName} · </span>}<time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</time></p></div>
  </li>;
  return <div className="hz-agent__turn" data-testid={`turn-${turn.id}`}>
    <section className="hz-agent__progress">
      <details onToggle={event => { if (event.currentTarget.open) void readEvents(); }}><summary><img src={down} width="12" height="12" alt="" />执行过程 <span className="hz-agent__muted">{turn.hasMoreEvents ? '事件尚未读全' : `${turn.events.length} 条已读取事件`}</span><span className="hz-agent__event-toggle">查看工具事件</span></summary>
        {loading && <p role="status">正在读取事件…</p>}{error && <p role="alert">{error}<Button onClick={() => { void readEvents(); }}>重新读取事件</Button></p>}
        <ol className="hz-agent__events">{turn.events.map(eventItem)}</ol>
      </details>
      <ol className="hz-agent__event-preview">{turn.events.slice(-3).map(eventItem)}</ol>
    </section>
    <section className="hz-agent__result" aria-label="任务结果">
      <p className="hz-agent__result-heading"><img src={success ? check : warning ? attention : activeClock} width="22" height="22" alt="" /><span data-testid={`outcome-${turn.id}`}>{turnOutcome(turn)}</span></p>
      {turn.answer && !hasAnswer && <p className="hz-agent__answer">{turn.answer}</p>}
      {turn.failureCode && <p>失败原因：<code>{turn.failureCode}</code></p>}
      {turn.status === 'STOP_REQUESTED' && <p>停止请求不是业务撤销或 Worker 已停止的证明；继续回读原任务。</p>}
      {(turn.status === 'INTERRUPTED' || turn.humanInterventionRequired && turn.status !== 'NEEDS_INPUT') && <p>请人工核对原业务与证据。本页面不自动重跑，也不声明资金已回滚。</p>}
      <dl className="hz-agent__references">
        <dt>Turn</dt><dd>{turn.id}</dd>
        {turn.journeyId && <><dt>Journey</dt><dd>{turn.journeyId}</dd></>}
        {turn.runId && <><dt>Run</dt><dd>{turn.runId}</dd></>}
        {turn.taskId && <><dt>Task</dt><dd>{turn.taskId}</dd></>}
        <dt>ReleaseIdentity</dt><dd>{turn.modelBinding.releaseIdentityHash}</dd>
      </dl>
      <Button onClick={() => onEvidence(turn)} icon={<img src={file} width="16" height="16" alt="" />}>查看报告与证据</Button>
    </section>
  </div>;
}
