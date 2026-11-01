import { useEffect, useState } from 'react';
import { Button, Drawer } from 'antd';
import { type AgentClient, type AgentResponse } from './api';
import { historyError } from './history';
import { type Turn, turnOutcome } from './turn';
import close from './assets/close.svg';
import file from './assets/file.svg';
import download from './assets/download.svg';

export function EvidenceDrawer({ client, turn, onClose }: { client: AgentClient; turn: Turn; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0), [evidence, setEvidence] = useState<AgentResponse<'getAgentTurnEvidence'>>();
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [downloading, setDownloading] = useState<string>();
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setEvidence(undefined);
    client.request('getAgentTurnEvidence', { path: { turnId: turn.id } }).then(value => { if (active) { setEvidence(value); setLoading(false); } }, failure => {
      if (active) { setError(historyError(failure).code); setLoading(false); }
    });
    return () => { active = false; };
  }, [client, turn.id, attempt]);
  async function save(artifactId: string, name: string) {
    if (downloading) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    setDownloading(artifactId); setError('');
    try {
      const blob = await client.downloadArtifact({ turnId: turn.id, artifactId });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (failure) { setError(historyError(failure).code); }
    finally { setDownloading(undefined); requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); }); }
  }
  return <Drawer open onClose={onClose} placement="right" width={404} title="报告与证据" closeIcon={<img src={close} width="18" height="18" alt="" />}
    rootClassName="hz-agent-evidence" styles={{ body: { padding: 24 } }}>
    <div className="hz-agent hz-agent__evidence-content">
      <p>{turnOutcome(turn)}</p>
      <p className="hz-agent__muted">当前运行</p>
      <dl>{[['Turn', turn.id], ['Journey', turn.journeyId], ['Run', turn.runId], ['Task', turn.taskId]].map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {loading && <p role="status">正在读取证据…</p>}
      {error && <div role="alert"><p>证据不可用、未授权或工件隔离时不能下载；未将其标记通过。</p><code>{error}</code><Button onClick={() => setAttempt(value => value + 1)} disabled={loading}>重新读取证据</Button></div>}
      {evidence && <>
        <section><p>业务核验</p><p className="hz-agent__secondary">{evidence.status} · {evidence.terminal ? '终态记录' : '尚未终结'}</p></section>
        <p>证据文件</p>
        {!evidence.artifactCards.length && <p className="hz-agent__muted">尚无可下载工件。</p>}
        {evidence.artifactCards.map(card => <div key={card.artifactId} className="hz-agent__evidence-card">
          <img src={file} width="20" height="20" alt="" /><div><p>{card.displayName}</p><p className="hz-agent__muted">{card.mediaType ?? '受控工件'}{card.size !== undefined ? ` · ${card.size} 字节` : ''}</p>{card.sha256 && <code>{card.sha256}</code>}</div>
          <Button type="text" aria-label={`下载 ${card.displayName}`} disabled={!!downloading} loading={downloading === card.artifactId} onClick={() => { void save(card.artifactId, card.displayName); }}><img src={download} width="16" height="16" alt="" /></Button>
        </div>)}
      </>}
      <p className="hz-agent__muted">身份：{turn.modelBinding.releaseIdentityHash}</p><p className="hz-agent__muted">只读证据 · 不在此批准或改变运行</p>
    </div>
  </Drawer>;
}
