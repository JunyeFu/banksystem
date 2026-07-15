import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Empty, Input, Select, Skeleton, Tag } from 'antd';
import type { Message } from '@localbank/bank-api-client';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function Messages(): JSX.Element {
  const cache = useQueryClient();
  const [filter, setFilter] = useState('all'); const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['messages'], queryFn: () => customerApi.listMessages() });
  const markRead = useMutation({ mutationFn: (id: string) => customerApi.markMessageRead(id), onSuccess: async () => cache.invalidateQueries({ queryKey: ['messages'] }) });
  const all = query.data?.items ?? [];
  const items = useMemo(() => all.filter((item) => (filter === 'all' || (filter === 'unread' ? !item.read : item.read)) && `${item.subject}${item.body}`.includes(search)), [all, filter, search]);
  const icon = (message: Message): string => message.subject.includes('转账') ? '↔' : message.subject.includes('登录') ? '↪' : message.subject.includes('还款') ? '▣' : message.subject.includes('安全') ? '◇' : '◈';
  return <PageContainer pageId="customer.messages" state="READY"><section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : all.length ? all.some((item) => !item.read) ? 'UNREAD' : 'READ' : 'EMPTY'}>
    <div className="message-page-head"><h1>消息中心</h1><div><Select value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部消息' },{ value: 'unread', label: '未读消息' },{ value: 'read', label: '已读消息' }]} /><Input.Search value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索消息标题或内容" /><Button onClick={() => query.refetch()}>↻　刷新</Button></div></div>
    {query.isError ? <Alert type="error" showIcon message="消息加载失败" /> : null}
    <div className="bank-card message-list">{query.isLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : items.length ? items.map((item) => <button key={item.messageId} className={item.read ? '' : 'unread'} onClick={() => { if (!item.read) markRead.mutate(item.messageId); }}><span className="message-icon">{icon(item)}</span><span className="message-copy"><strong>{item.subject}{!item.read ? <Tag color="red">未读</Tag> : null}</strong><small>{item.body}</small></span><time>{new Date(item.createdDate).toLocaleString('zh-CN', { hour12: false })}</time><b>›</b></button>) : <div className="customer-empty"><Empty description={all.length ? '没有匹配的消息' : '暂无消息'} /></div>}</div>
  </section></PageContainer>;
}
