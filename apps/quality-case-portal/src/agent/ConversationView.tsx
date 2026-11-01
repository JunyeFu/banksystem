import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import { type AgentClient, type AgentInput, type AgentResponse } from './api';
import { ConversationHistory } from './ConversationHistory';
import { Composer } from './Composer';
import { TurnProgress } from './TurnProgress';
import { EvidenceDrawer } from './EvidenceDrawer';
import { historyError, type Conversation, type ConversationPage } from './history';
import { isActiveTurn, mergeTurn, type Model, type Turn } from './turn';

type Submission = { conversationId: string; body: NonNullable<AgentInput<'submitAgentMessage'>['body']> };

export function ConversationView({ client, conversationId, canSend, connected, model, modelError, modelPicker, draft, onDraft, onConversation, onTurn, onChanged, onCreated, onCreation, welcome }: {
  client: AgentClient; conversationId?: string; canSend: boolean; connected: boolean;
  model?: Model; modelError: string; modelPicker: ReactNode;
  draft: string; onDraft: (value: string) => void; onConversation: (value: Conversation) => void;
  onTurn: (value: Turn) => void;
  onChanged: () => void; onCreated: (value: Conversation) => void; onCreation: (busy: boolean) => void; welcome?: ReactNode;
}) {
  const [turn, setTurn] = useState<Turn>(), [loaded, setLoaded] = useState(!conversationId);
  const [revision, setRevision] = useState(0), [readAttempt, setReadAttempt] = useState(0);
  const [readError, setReadError] = useState(''), [writeError, setWriteError] = useState('');
  const [busy, setBusy] = useState(false), [stopping, setStopping] = useState(false), [pending, setPending] = useState<Submission>();
  const [evidence, setEvidence] = useState<Turn>();
  const [attachmentReset, setAttachmentReset] = useState(0);
  const [submittedTurn, setSubmittedTurn] = useState<string>();
  const rootConversation = useRef<Conversation>();
  const lock = useRef(false), stopLock = useRef(false), currentTurn = useRef(turn), mounted = useRef(true);
  currentTurn.current = turn;
  useEffect(() => () => { mounted.current = false; }, []);
  const historyRead = useCallback((page: ConversationPage) => {
    setLoaded(true);
    const latest = page.turns.find(item => item.id === page.conversation.lastTurnId);
    if (latest) { setTurn(previous => mergeTurn(previous, latest)); onTurn(latest); }
  }, [onTurn]);
  const turnId = turn?.id;
  useEffect(() => {
    if (!turnId) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    setReadError('');
    async function read() {
      let cursor = Math.max(0, ...(currentTurn.current?.events.map(event => event.sequence) ?? []));
      try {
        while (active) {
          const next = await client.request('getAgentTurn', { path: { turnId: turnId! }, query: { after: cursor, limit: 50 } });
          if (!active) return;
          cursor = Math.max(cursor, ...next.events.map(event => event.sequence));
          setTurn(previous => mergeTurn(previous, next));
          onTurn(next);
          if (next.hasMoreEvents) continue;
          if (!isActiveTurn(next)) { setRevision(value => value + 1); onChanged(); return; }
          await new Promise<void>(resolve => { timer = setTimeout(resolve, 1000); });
        }
      } catch (error) { if (active) setReadError(historyError(error).code); }
    }
    void read();
    return () => { active = false; clearTimeout(timer); };
  }, [client, turnId, readAttempt, onChanged, onTurn]);

  async function send(submission: Submission): Promise<boolean> {
    try {
      const accepted = await client.request('submitAgentMessage', { path: { conversationId: submission.conversationId }, body: submission.body });
      if (!mounted.current) return true;
      setPending(undefined); setWriteError(''); setTurn(accepted); onDraft(''); setAttachmentReset(value => value + 1); setRevision(value => value + 1); onChanged();
      setSubmittedTurn(accepted.id);
      onTurn(accepted);
      return true;
    } catch (failure) {
      if (!mounted.current) return false;
      const error = historyError(failure); setWriteError(error.code);
      if (error.status === 0 || error.status >= 500) {
        setPending(submission);
        // Resolve the read side first. Do not infer ownership from similar text or issue a new POST.
        try { await client.request('getAgentConversation', { path: { conversationId: submission.conversationId }, query: { limit: 20 } }); }
        catch (readFailure) { if (mounted.current) setReadError(historyError(readFailure).code); }
        if (!mounted.current) return false;
        setRevision(value => value + 1); onChanged();
      }
      return false;
    }
  }
  async function submit(input: string, image?: File) {
    if (lock.current || !canSend || pending || isActiveTurn(turn)) return false;
    const binding = turn?.status === 'NEEDS_INPUT' ? turn.modelBinding : model && { profileId: model.id, profileVersion: model.version };
    if (!binding) return false;
    lock.current = true; setBusy(true); setWriteError('');
    let created = rootConversation.current;
    try {
      let attachment: AgentResponse<'importAgentAttachment'> | undefined;
      if (image) attachment = await client.importAttachment(image);
      if (!mounted.current) return false;
      if (!conversationId && !created) {
        onCreation(true); created = await client.request('createAgentConversation', { body: { title: input.slice(0, 80) } });
        rootConversation.current = created; onChanged();
      }
      if (!mounted.current) return false;
      const submission: Submission = { conversationId: conversationId ?? created!.id, body: {
        submissionId: crypto.randomUUID(), input, modelProfileId: binding.profileId, modelProfileVersion: binding.profileVersion,
        attachmentRefs: attachment ? [attachment.attachmentRef] : [],
        attachmentMetadata: attachment ? [{ attachmentRef: attachment.attachmentRef, originalFilename: attachment.originalFilename }] : [],
      } };
      const success = await send(submission);
      // A root-screen unknown receipt stays here for explicit same-ID reconciliation.
      if (created && success && mounted.current) onCreated(created);
      return success;
    } catch (failure) { if (mounted.current) setWriteError(historyError(failure).code); return false; }
    finally { lock.current = false; onCreation(false); if (mounted.current) setBusy(false); }
  }
  async function reconcile() {
    if (!pending || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      // Explicit user action, same immutable ID/payload. Reads are always performed before this write.
      await client.request('getAgentConversation', { path: { conversationId: pending.conversationId }, query: { limit: 20 } });
      const success = await send(pending);
      if (success && !conversationId) onCreated((await client.request('getAgentConversation', { path: { conversationId: pending.conversationId }, query: { limit: 1 } })).conversation);
    } catch (failure) { if (mounted.current) setWriteError(historyError(failure).code); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function stop() {
    if (!turn || stopLock.current || !connected) return;
    stopLock.current = true; setStopping(true); setWriteError('');
    try {
      const receipt = await client.request('cancelAgentTurn', { path: { turnId: turn.id }, body: {} });
      if (mounted.current) { setTurn(previous => mergeTurn(previous, receipt)); setReadAttempt(value => value + 1); }
    } catch (failure) { if (mounted.current) { setWriteError(historyError(failure).code); setReadAttempt(value => value + 1); } }
    finally { stopLock.current = false; if (mounted.current) setStopping(false); }
  }
  const running = isActiveTurn(turn), continuation = turn?.status === 'NEEDS_INPUT';
  return <>
    {conversationId ? <ConversationHistory client={client} conversationId={conversationId} onConversation={onConversation} onPage={historyRead} revision={revision} focusTurnId={submittedTurn}
      renderTurn={(record, hasAnswer) => <TurnProgress client={client} turn={turn?.id === record.id ? turn : record} hasAnswer={hasAnswer} onEvidence={setEvidence} />} /> : welcome}
    {(writeError || readError || modelError) && <div className="hz-agent__conversation-notice" role="alert">
      {writeError && <p>请求未完成：<code>{writeError}</code></p>}
      {modelError && <p>模型元数据读取失败：<code>{modelError}</code></p>}
      {readError && <p>任务状态读取失败，已停止自动读取：<code>{readError}</code> <Button onClick={() => setReadAttempt(value => value + 1)}>重新读取任务</Button></p>}
    </div>}
    {pending && <div className="hz-agent__conversation-notice" role="alert"><p>提交结果未知，已请求回读；不自动重发或创建新提交。请核对会话，或显式核对原提交号（若未登记，将提交原目标）。</p><code>{pending.body.submissionId}</code><Button loading={busy} disabled={!connected || busy} onClick={() => { void reconcile(); }}>核对原提交</Button></div>}
    <Composer draft={draft} onDraft={onDraft} modelPicker={modelPicker} boundModel={running || continuation ? `${turn!.modelBinding.model} · v${turn!.modelBinding.profileVersion}` : undefined} disabled={!canSend || !loaded || !model && !continuation || !!pending}
      busy={busy} running={running} stopping={stopping || turn?.status === 'STOP_REQUESTED'} continuation={continuation} attachmentReset={attachmentReset}
      onSubmit={submit} onStop={() => { void stop(); }} />
    {evidence && <EvidenceDrawer key={evidence.id} client={client} turn={turn?.id === evidence.id ? turn : evidence} onClose={() => setEvidence(undefined)} />}
  </>;
}
