import { useEffect, useRef, useState } from 'react';
import { Button, Input } from 'antd';
import { Link } from 'react-router-dom';
import { type AgentApiError, type AgentClient, type AgentResponse } from './api';
import { conversationStatus, historyError, historyGroup, mergeById, type Conversation, type ConversationCreation } from './history';
import plus from './assets/plus.svg';
import search from './assets/search.svg';
import message from './assets/message.svg';
import clock from './assets/clock.svg';
import attention from './assets/attention.svg';

type ListState = AgentResponse<'listAgentConversations'> & { query: string; loading: boolean; paging: boolean; error: AgentApiError | null };
const emptyList = (query: string): ListState => ({ conversations: [], nextCursor: null, query, loading: true, paging: false, error: null });
const dateTime = (date: string) => new Date(date).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ConversationSidebar({ client, canCreate, selectedId, onCreated, onSelect, creation, onCreation, revision }: {
  client: AgentClient; canCreate: boolean; selectedId?: string; onCreated: (conversation: Conversation) => void; onSelect: () => void;
  creation: ConversationCreation; onCreation: (state: ConversationCreation) => void; revision: number;
}) {
  const [input, setInput] = useState(''), [query, setQuery] = useState(''), [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<ListState>(() => emptyList(''));
  const generation = useRef(0), pageLock = useRef(false), createLock = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    pageLock.current = false;
    setState(previous => previous.query === query ? { ...previous, loading: true, paging: false, error: null } : emptyList(query));
    client.request('listAgentConversations', { query: { ...(query ? { q: query } : {}), limit: 30 } }).then(page => {
      if (generation.current === current) setState({ ...page, query, loading: false, paging: false, error: null });
    }, error => {
      if (generation.current === current) setState(previous => ({ ...previous, loading: false, error: historyError(error) }));
    });
    return () => { generation.current++; };
  }, [client, query, refresh, revision]);
  const visible = state.query === query ? state : emptyList(query);
  function loadMore() {
    if (pageLock.current || visible.loading || !visible.nextCursor) return;
    pageLock.current = true;
    const current = generation.current;
    setState(previous => ({ ...previous, paging: true, error: null }));
    client.request('listAgentConversations', { query: { ...(query ? { q: query } : {}), cursor: visible.nextCursor, limit: 30 } }).then(page => {
      if (generation.current === current) {
        pageLock.current = false;
        setState(previous => ({ ...previous, conversations: mergeById(previous.conversations, page.conversations), nextCursor: page.nextCursor, paging: false }));
      }
    }, error => {
      if (generation.current === current) { pageLock.current = false; setState(previous => ({ ...previous, paging: false, error: historyError(error) })); }
    });
  }
  function create() {
    if (createLock.current || creation.busy || !canCreate) return;
    createLock.current = true; onCreation({ busy: true, error: null });
    client.request('createAgentConversation', { body: { title: '新对话' } }).then(conversation => {
      createLock.current = false; onCreation({ busy: false, error: null });
      setInput(''); setQuery('');
      onCreated(conversation);
    }, error => { createLock.current = false; onCreation({ busy: false, error: historyError(error) }); });
  }
  return <>
    <div className="hz-agent__sidebar-actions">
      <Button type="primary" onClick={create} disabled={!canCreate || creation.busy} loading={creation.busy} aria-label="新对话" aria-busy={creation.busy} data-testid="new-conversation" icon={<img src={plus} width="16" height="16" alt="" />}>新对话</Button>
      <form onSubmit={event => { event.preventDefault(); const value = input.trim(); if (value === query) setRefresh(current => current + 1); else setQuery(value); }}>
        <Input className="hz-agent__search" aria-label="搜索历史对话" placeholder="搜索历史对话" maxLength={200} value={input} onChange={event => setInput(event.target.value)} prefix={<img src={search} width="16" height="16" alt="" />} />
      </form>
    </div>
    <nav className="hz-agent__history" aria-label="历史会话列表" aria-busy={visible.loading || visible.paging}>
      {creation.error && <div role="alert" className="hz-agent__history-notice"><p>{creation.error.status === 0 || creation.error.status >= 500 ? '创建结果未确认，请先重新读取历史核对；不会自动重建。' : '未能创建会话。'}</p><code>{creation.error.code}</code></div>}
      {(visible.error || creation.error) && <div className="hz-agent__history-toolbar"><Button type="text" size="small" disabled={visible.loading || visible.paging} onClick={() => setRefresh(value => value + 1)}>重新读取历史</Button></div>}
      {visible.loading && <p role="status">正在读取历史会话…</p>}
      {visible.error && <div role="alert" className="hz-agent__history-notice"><p>{visible.error.status === 403 ? '历史连接失效，请重新连接。' : '历史读取失败，已读记录保留。'}</p><code>{visible.error.code}</code></div>}
      {!visible.loading && !visible.error && !visible.conversations.length && <p role="status">{query ? '没有匹配的历史会话。' : '还没有历史会话。'}</p>}
      {(['今天', '昨天', '更早'] as const).map(group => {
        const items = visible.conversations.filter(conversation => historyGroup(conversation.updatedAt) === group);
        return items.length ? <section key={group} aria-label={`${group}的会话`}><p className="hz-agent__history-group">{group}</p>{items.map(conversation => {
          const statusIcon = ['RUNNING', 'STOP_REQUESTED'].includes(conversation.status) ? clock
            : ['FAILED', 'INTERRUPTED', 'NEEDS_INPUT'].includes(conversation.status) ? attention : message;
          return <Link className="hz-agent__history-row" key={conversation.id} to={`/conversations/${conversation.id}`} onClick={onSelect}
            aria-current={conversation.id === selectedId ? 'page' : undefined} data-testid={`conversation-${conversation.id}`}>
            <span className="hz-agent__history-title"><img src={statusIcon} alt="" width="14" height="14" /><span title={conversation.title}>{conversation.title}</span></span>
            <span className="hz-agent__muted">{conversationStatus[conversation.status]} · <time dateTime={conversation.updatedAt}>{dateTime(conversation.updatedAt)}</time></span>
          </Link>;
        })}</section> : null;
      })}
      {visible.nextCursor && <Button type="text" onClick={loadMore} loading={visible.paging} disabled={visible.loading}>加载更多会话</Button>}
    </nav>
  </>;
}
