import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import { type AgentApiError, type AgentClient } from './api';
import { historyError, mergeById, type Conversation, type ConversationPage } from './history';

type HistoryState = { id: string; page?: ConversationPage; loading: boolean; paging: boolean; error: AgentApiError | null };
const brand = `${import.meta.env.BASE_URL}favicon.svg`;

export function ConversationHistory({ client, conversationId, onConversation, revision = 0, onPage, renderTurn, focusTurnId }: {
  client: AgentClient; conversationId: string; onConversation: (conversation: Conversation) => void;
  revision?: number; onPage?: (page: ConversationPage) => void;
  renderTurn?: (turn: ConversationPage['turns'][number], hasAnswer: boolean) => ReactNode;
  focusTurnId?: string;
}) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<HistoryState>({ id: conversationId, loading: true, paging: false, error: null });
  const generation = useRef(0), pageLock = useRef(false), scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null), pinned = useRef(true), focusedTurn = useRef<string>();
  const adjustment = useRef<{ id: string; anchor: string; top: number } | 'bottom' | null>(null);
  function readingPosition(element: HTMLDivElement) {
    const top = element.getBoundingClientRect().top;
    const messages = [...element.querySelectorAll<HTMLElement>('[data-testid^="message-"]')];
    const anchor = messages.find(message => message.getBoundingClientRect().bottom >= top) ?? messages[0];
    return anchor ? { id: conversationId, anchor: anchor.dataset.testid!, top: anchor.getBoundingClientRect().top } : 'bottom' as const;
  }
  useEffect(() => {
    const observer = new ResizeObserver(() => { if (pinned.current && !adjustment.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; });
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    pageLock.current = false; adjustment.current = null;
    setState(previous => ({ id: conversationId, page: previous.id === conversationId ? previous.page : undefined, loading: true, paging: false, error: null }));
    client.request('getAgentConversation', { path: { conversationId }, query: { limit: 20 } }).then(page => {
      if (generation.current === current) {
        const element = scroll.current;
        adjustment.current = !element || element.scrollHeight - element.clientHeight - element.scrollTop <= 2 ? 'bottom' : readingPosition(element);
        setState(previous => ({ id: conversationId, page: previous.id === conversationId && previous.page ? { ...page, messages: mergeById(previous.page.messages, page.messages), turns: mergeById(previous.page.turns, page.turns) } : page, loading: false, paging: false, error: null })); onConversation(page.conversation); onPage?.(page);
      }
    }, error => {
      if (generation.current === current) setState(previous => ({ ...previous, loading: false, error: historyError(error) }));
    });
    return () => { generation.current++; };
  }, [client, conversationId, refresh, revision, onConversation, onPage]);
  useLayoutEffect(() => {
    const pending = adjustment.current, element = scroll.current;
    if (!element) return;
    if (pending === 'bottom') { pinned.current = true; element.scrollTop = element.scrollHeight; }
    else if (pending && pending.id === conversationId) {
      const anchor = [...element.querySelectorAll<HTMLElement>('[data-testid^="message-"]')].find(message => message.dataset.testid === pending.anchor);
      if (anchor) element.scrollTop += anchor.getBoundingClientRect().top - pending.top;
    }
    adjustment.current = null;
    if (focusTurnId && focusedTurn.current !== focusTurnId) {
      const record = state.page?.turns.find(turn => turn.id === focusTurnId);
      const target = [...element.querySelectorAll<HTMLElement>('[data-testid^="message-"]')].find(message => message.dataset.testid === `message-${record?.inputMessageId}`);
      if (target) { element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top; focusedTurn.current = focusTurnId; pinned.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 2; }
    }
  }, [state.page, conversationId, focusTurnId]);
  const visible = state.id === conversationId ? state : { id: conversationId, loading: true, paging: false, error: null };
  function loadOlder() {
    if (pageLock.current || visible.loading || !visible.page?.nextMessageCursor) return;
    pageLock.current = true;
    const current = generation.current, before = visible.page.nextMessageCursor;
    setState(previous => ({ ...previous, paging: true, error: null }));
    client.request('getAgentConversation', { path: { conversationId }, query: { before, limit: 20 } }).then(page => {
      if (generation.current === current) {
        pageLock.current = false;
        const element = scroll.current;
        if (element) adjustment.current = readingPosition(element);
        setState(previous => ({ ...previous, page: { ...page, messages: mergeById(page.messages, previous.page!.messages), turns: mergeById(previous.page!.turns, page.turns) }, paging: false }));
        onConversation(page.conversation);
      }
    }, error => {
      if (generation.current === current) { pageLock.current = false; setState(previous => ({ ...previous, paging: false, error: historyError(error) })); }
    });
  }
  const messages = visible.page?.messages ?? [], turns = new Map(visible.page?.turns.map(turn => [turn.id, turn]));
  const answered = new Set(messages.filter(message => message.role === 'assistant').map(message => message.turnId));
  return <section ref={scroll} className="hz-agent__message-scroll" aria-label="会话消息" aria-busy={visible.loading || visible.paging} data-testid="conversation-messages"
    onScroll={event => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 2; }}><div ref={content}>
    <div className="hz-agent__message-toolbar"><Button type="text" disabled={visible.loading || visible.paging} onClick={() => setRefresh(value => value + 1)}>重新读取会话</Button></div>
    {visible.loading && !visible.page && <p role="status">正在读取会话…</p>}
    {visible.error && <div role="alert" className="hz-agent__history-notice"><p>{visible.error.status === 404 ? '会话不存在，或当前工作区无权访问。' : visible.error.status === 403 ? '连接已失效，请重新连接后读取。' : '会话读取失败，已读正文保留。'}</p><code>{visible.error.code}</code></div>}
    {visible.page?.nextMessageCursor && <div className="hz-agent__older"><Button type="text" onClick={loadOlder} loading={visible.paging} disabled={visible.loading}>加载更早消息</Button></div>}
    {visible.page && !visible.page.messages.length && <p className="hz-agent__empty-conversation" role="status">空会话已登记。尚未提交目标，也未启动测试。</p>}
    {messages.map(message => <Fragment key={message.id}><article className={`hz-agent__message hz-agent__message--${message.role}`} aria-label={message.role === 'user' ? '用户消息' : '衡准消息'} data-testid={`message-${message.id}`}>
      {message.role === 'assistant' && <img src={brand} width="28" height="28" alt="" />}
      <div className="hz-agent__message-body"><div className="hz-agent__message-meta"><span>{message.role === 'user' ? '你' : '衡准'}</span><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('zh-CN')}</time></div><p>{message.text}</p>
        {message.role === 'assistant' && message.turnId && turns.has(message.turnId) && renderTurn?.(turns.get(message.turnId)!, true)}
      </div>
    </article>
      {renderTurn && message.role === 'user' && message.turnId && !answered.has(message.turnId) && turns.has(message.turnId) && <div className="hz-agent__pending-turn" aria-label="已登记任务状态"><img src={brand} width="28" height="28" alt="" /><div>{renderTurn(turns.get(message.turnId)!, false)}</div></div>}
    </Fragment>)}
    {visible.page && <p className="hz-agent__history-readonly">以上为已登记历史，仅供回读；打开或刷新不会重新执行。</p>}
  </div></section>;
}
