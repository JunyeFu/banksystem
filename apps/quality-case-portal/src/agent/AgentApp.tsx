import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Drawer, Modal } from 'antd';
import { productBrand } from '@localbank/bank-ui-kit';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { AgentApiError, createAgentClient, type AgentResponse } from './api';
import { ConversationSidebar } from './ConversationSidebar';
import { ConversationView } from './ConversationView';
import { ModelConfiguration } from './ModelConfiguration';
import { ModelPicker } from './ModelPicker';
import { useModels } from './useModels';
import { conversationStatus, type Conversation, type ConversationCreation } from './history';
import { mergeTurn, type Turn } from './turn';
import collapse from './assets/collapse.svg';
import settings from './assets/settings.svg';
import safety from './assets/safety.svg';
import arrow from './assets/arrow.svg';
import close from './assets/close.svg';

type Connection = { status: 'LOADING' } | { status: 'CONNECTED'; data: AgentResponse<'getAgentBootstrap'> } | { status: 'FAILED'; code: string; forbidden: boolean };
const brand = `${import.meta.env.BASE_URL}favicon.svg`;
const icon = (src: string, size = 18) => <img src={src} width={size} height={size} alt="" aria-hidden="true" />;
const suggestions = [
  ['验证一条业务', '登录后执行一笔小额转账'],
  ['安排周期回归', '每天回归已验证的案例'],
  ['分析一次失败', '定位异常并查看证据'],
];

function ConnectionDetails({ connection }: { connection: Connection }) {
  if (connection.status === 'LOADING') return <p role="status">正在读取本机服务状态…</p>;
  if (connection.status === 'FAILED') return <p role="alert">{connection.forbidden ? '连接已失效，请重新连接。' : '未能连接本机 Agent 服务。'}<br /><code>{connection.code}</code></p>;
  return <>
    <p>{connection.data.status === 'READY' ? '服务准备就绪' : '服务尚未就绪'}</p>
    {connection.data.blockingReasons.map(reason => <p key={reason}><code>{reason}</code></p>)}
    {connection.data.blockingReasons.includes('AGENT_MODEL_CONFIGURATION_REQUIRED') && <p>请先在模型配置中完成本机 BYOK 配置。</p>}
    <p>ReleaseIdentity：<code>{connection.data.releaseIdentityHash ?? '尚未绑定'}</code></p>
  </>;
}

export function AgentApp() {
  const navigate = useNavigate(), location = useLocation();
  const latestLocation = useRef(location.key);
  latestLocation.current = location.key;
  const conversationId = useMatch('/conversations/:conversationId')?.params.conversationId;
  const modelPage = location.pathname === '/models';
  const conversationPath = useRef('/');
  if (location.pathname === '/' || conversationId) conversationPath.current = location.pathname;
  const [selectedConversation, setSelectedConversation] = useState<Conversation>();
  const [selectedTurn, setSelectedTurn] = useState<Turn>();
  const [creation, setCreation] = useState<ConversationCreation>({ busy: false, error: null });
  const [historyRevision, setHistoryRevision] = useState(0);
  const historyChanged = useCallback(() => setHistoryRevision(value => value + 1), []);
  const turnChanged = useCallback((turn: Turn) => setSelectedTurn(previous => mergeTurn(previous, turn)), []);
  const creationChanged = useCallback((busy: boolean) => setCreation({ busy, error: null }), []);
  const selected = selectedConversation?.id === conversationId ? selectedConversation : undefined;
  const [connection, setConnection] = useState<Connection>({ status: 'LOADING' });
  const [client] = useState(() => createAgentClient(() => setConnection({ status: 'FAILED', code: 'AGENT_CONNECTION_INVALIDATED', forbidden: true })));
  const [attempt, setAttempt] = useState(0);
  const models = useModels(client, connection.status === 'CONNECTED', attempt);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [sidebar, setSidebar] = useState(!compact);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const openModels = () => { setSettingsOpen(false); void models.reload(); navigate('/models', { state: { returnTo: conversationPath.current } }); };
  const backToConversation = () => {
    const target: unknown = location.state?.returnTo;
    navigate(typeof target === 'string' && (target === '/' || /^\/conversations\/[a-f0-9-]{36}$/.test(target)) ? target : conversationPath.current);
  };
  useEffect(() => { setDraft(''); }, [conversationId]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const resize = () => { setCompact(media.matches); setSidebar(!media.matches); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    let active = true;
    setConnection({ status: 'LOADING' });
    client.bootstrap().then(data => { if (active) setConnection({ status: 'CONNECTED', data }); }, error => {
      if (active) setConnection({ status: 'FAILED', code: error instanceof AgentApiError ? error.code : 'AGENT_CONNECTION_UNAVAILABLE', forbidden: error instanceof AgentApiError && error.status === 403 });
    });
    return () => { active = false; };
  }, [client, attempt]);
  const status = connection.status === 'LOADING' ? '正在连接' : connection.status === 'FAILED'
    ? (connection.forbidden ? '连接失效' : '连接不可用') : connection.data.status === 'READY' ? '准备就绪' : '尚未就绪';
  const sidebarContent = <aside className="hz-agent__sidebar" aria-label="历史会话侧栏" hidden={!compact && !sidebar}>
      <div className="hz-agent__brand"><img src={brand} alt="" width="34" height="34" /><span>{productBrand.regressionPlatform.shortName}</span><Button type="text" className="hz-agent__icon-button" aria-label="收起侧栏" onClick={() => setSidebar(false)}>{icon(collapse)}</Button></div>
      <ConversationSidebar client={client} canCreate={connection.status === 'CONNECTED'} selectedId={conversationId}
        creation={creation} onCreation={setCreation} revision={historyRevision}
        onCreated={conversation => {
          setHistoryRevision(value => value + 1);
          if (latestLocation.current !== location.key) return;
          setSelectedConversation(conversation); navigate(`/conversations/${conversation.id}`);
          if (window.matchMedia('(max-width: 760px)').matches) setSidebar(false);
        }}
        onSelect={() => { if (compact) setSidebar(false); }} />
      <div className="hz-agent__sidebar-footer">
        <div className="hz-agent__workspace">{icon(safety, 16)}本地演示工作区</div>
        <Button type="text" className="hz-agent__settings-button" icon={icon(settings)} onClick={() => setSettingsOpen(true)}>设置与连接</Button>
        <div className="hz-agent__profile">本机工作区 · 不读取个人资料</div>
      </div>
    </aside>;
  return <div className="hz-agent" data-testid="agent-app">
    {!compact && sidebarContent}
    {compact && <Drawer open={sidebar} onClose={() => setSidebar(false)} placement="left" width={248} closable={false}
      rootClassName="hz-agent-drawer" styles={{ body: { padding: 0 } }}>
      <div className="hz-agent hz-agent__drawer-content">{sidebarContent}</div>
    </Drawer>}
    <main className="hz-agent__main">
      <header className="hz-agent__header">
        {!sidebar && <Button type="text" className="hz-agent__icon-button" aria-label="展开侧栏" onClick={() => setSidebar(true)}>{icon(collapse)}</Button>}
        <span className="hz-agent__conversation-title" title={selected?.title} data-testid="conversation-title">{modelPage ? '模型配置' : selected?.title ?? (conversationId ? '历史会话' : '新对话')}</span>
        {selected && <span className="hz-agent__muted hz-agent__conversation-status" data-testid="conversation-status">{conversationStatus[selectedTurn && selectedTurn.conversationId === conversationId ? selectedTurn.status : selected.status]}</span>}
        <span className="hz-agent__muted" role="status" data-testid="connection-status" hidden={modelPage}>{status}</span>
        {modelPage ? <Button className="hz-agent__back-conversation" onClick={backToConversation}>返回对话</Button> : <Button type="text" className="hz-agent__environment" aria-label="本地演示环境与连接" icon={icon(safety, 16)} onClick={() => setSettingsOpen(true)}>本地演示环境</Button>}
      </header>
      <div className="hz-agent__content">
        {modelPage ? <ModelConfiguration client={client} models={models.models} loading={models.loading} error={models.error} connected={connection.status === 'CONNECTED'} onReload={models.reload} onDefault={model => { models.select(model); setAttempt(value => value + 1); }} /> : <ConversationView key={conversationId ?? 'new'} client={client} conversationId={conversationId} canSend={connection.status === 'CONNECTED' && connection.data.status === 'READY' && (location.pathname === '/' || !!conversationId)}
          model={models.selected} modelError={models.error} modelPicker={<ModelPicker models={models.models} selected={models.selected} unavailable={models.unavailable} disabled={connection.status !== 'CONNECTED' || models.loading} onSelect={models.select} onConfigure={openModels} />}
          connected={connection.status === 'CONNECTED'} draft={draft} onDraft={setDraft} onConversation={setSelectedConversation}
          onChanged={historyChanged} onTurn={turnChanged} onCreation={creationChanged} onCreated={conversation => {
            historyChanged(); if (latestLocation.current !== location.key) return;
            setSelectedConversation(conversation); navigate(`/conversations/${conversation.id}`);
          }} welcome={location.pathname !== '/' ? <section role="alert">页面不存在。请从历史会话选择记录。</section> : <section className="hz-agent__welcome" aria-label="测试目标入口">
          <img className="hz-agent__hero-brand" src={brand} alt="衡准" width="56" height="56" />
          <h1>把测试目标交给衡准</h1>
          <p className="hz-agent__subtitle">从打开浏览器，到核对业务结果。用一句话开始。</p>
          <div className="hz-agent__suggestions">{suggestions.map(([title, description]) => <button key={title} onClick={() => { setDraft(description); document.getElementById('agent-goal')?.focus(); }}>
            <span>{title}</span><span className="hz-agent__secondary">{description}</span>{icon(arrow, 16)}
          </button>)}</div>
          <p className="hz-agent__muted">需要补充业务信息时，我会在对话中询问。</p>
        </section>} />}
      </div>
    </main>
    <Modal title="设置与连接" centered open={settingsOpen} onCancel={() => setSettingsOpen(false)} closeIcon={icon(close)} width={680} rootClassName="hz-agent-dialog"
      footer={<Button type="primary" aria-label="完成" onClick={() => setSettingsOpen(false)}>完成</Button>}>
      <p>只配置连接。任务安排、案例管理和失败处理都在对话中完成。</p>
      <section className="hz-agent__connection-panel" aria-label="连接详情"><span>本地 Agent 服务</span><ConnectionDetails connection={connection} />
        <Button onClick={() => setAttempt(value => value + 1)} disabled={connection.status === 'LOADING'}>重新连接</Button>
      </section>
      <section className="hz-agent__connection-panel"><p>模型绑定 · BYOK 单模型</p><p>手动选择仅用于后续新任务；补输入沿用原任务绑定。登录凭据只通过本地登记流程绑定。</p><Button onClick={openModels}>模型配置</Button></section>
      <section className="hz-agent__connection-panel"><a href="http://127.0.0.1:18788/quality/" target="_blank" rel="noreferrer">打开只读质量门户</a><p>质量门户独立运行，不更改执行状态。</p></section>
      <p>凭据与密钥不进入普通对话、模型上下文或导出报告。</p>
    </Modal>
  </div>;
}
