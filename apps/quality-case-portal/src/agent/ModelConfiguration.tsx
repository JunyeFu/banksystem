import { useEffect, useRef, useState } from 'react';
import { Button, Input } from 'antd';
import { type AgentClient } from './api';
import { historyError } from './history';
import { type Model } from './turn';
import { modelCheckInput } from './models';
import check from './assets/model-selected.svg';
import plus from './assets/model-plus.svg';

export function ModelConfiguration({ client, models, loading, error, connected, onReload, onDefault }: {
  client: AgentClient; models: Model[]; loading: boolean; error: string; connected: boolean;
  onReload: () => Promise<Model[] | undefined>; onDefault: (model: Model) => void;
}) {
  const [profile, setProfile] = useState<Model>();
  const [name, setName] = useState(''), [model, setModel] = useState(''), [baseUrl, setBaseUrl] = useState(''), [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'check' | 'save'>(), [checkResult, setCheckResult] = useState('未检测');
  const [notice, setNotice] = useState(''), [saved, setSaved] = useState<Model>();
  const initialized = useRef(false), mounted = useRef(true), lock = useRef(false);
  useEffect(() => () => { mounted.current = false; }, []);
  function edit(next?: Model) {
    setProfile(next); setName(next?.displayName ?? ''); setModel(next?.model ?? ''); setBaseUrl(next?.baseUrl ?? '');
    setApiKey(''); setSaved(undefined); setCheckResult('未检测'); setNotice('');
  }
  useEffect(() => {
    if (!initialized.current && connected && !loading && !error) { initialized.current = true; edit(models.find(item => item.isDefault) ?? models[0]); }
  }, [models, connected, loading, error]);
  function change(update: () => void) { update(); setSaved(undefined); setNotice(''); setCheckResult('未检测'); }
  async function conflict(code: string, id = profile?.id) {
    const latest = await onReload();
    if (!mounted.current) return;
    if (latest) edit(latest.find(item => item.id === id));
    setNotice(`配置冲突，未自动覆盖。已请求重新读取，请核对后再提交：${code}`);
  }
  async function probe() {
    if (lock.current || !connected) return;
    lock.current = true; setBusy('check'); setCheckResult('检查中'); setNotice('');
    try {
      const result = await client.request('checkAgentModel', { body: modelCheckInput(model, baseUrl, apiKey, profile) });
      if (mounted.current) setCheckResult(`${result.status === 'READY' ? '连接检查通过' : '连接检查失败'} · ${result.code}`);
    } catch (failure) {
      if (!mounted.current) return;
      const issue = historyError(failure);
      if (issue.status === 409) await conflict(issue.code);
      else setCheckResult(`连接检查失败 · ${issue.code}`);
    } finally { lock.current = false; if (mounted.current) setBusy(undefined); }
  }
  async function save() {
    if (lock.current || !connected) return;
    lock.current = true; setBusy('save'); setNotice('');
    let stored = saved;
    try {
      if (!stored) {
        const body = { displayName: name, model, baseUrl, ...(apiKey ? { apiKey } : {}) };
        stored = profile
          ? await client.request('updateAgentModel', { path: { modelId: profile.id }, body: { ...body, version: profile.version } })
          : await client.request('createAgentModel', { body });
        if (!mounted.current) return;
        setProfile(stored); setApiKey(''); setSaved(stored); setNotice('配置已保存；正在设置默认模型。');
      }
      // Explicit composite action: a successful save is not a successful default change.
      const selected = await client.request('setDefaultAgentModel', { path: { modelId: stored.id }, body: { version: stored.version } });
      if (!mounted.current) return;
      setProfile(selected); setSaved(undefined); setNotice('配置已保存，并设为后续任务的默认模型。'); onDefault(selected);
      await onReload();
    } catch (failure) {
      if (!mounted.current) return;
      const issue = historyError(failure);
      if (issue.status === 409) {
        await conflict(issue.code, stored?.id);
        if (mounted.current && stored) setNotice(`配置已保存；设置默认发生冲突，未自动覆盖。已请求重新读取：${issue.code}`);
      } else {
        setNotice(`${stored ? '配置已保存，但设置默认失败；可显式重试设置默认' : '保存未完成，请核对配置后再提交'}：${issue.code}`);
        if (stored) await onReload();
      }
    } finally { lock.current = false; if (mounted.current) setBusy(undefined); }
  }
  return <section className="hz-agent__models" aria-label="本地模型配置">
    <div className="hz-agent__model-intro"><h1>接入你自己的模型服务</h1><p className="hz-agent__secondary">手动选择使用哪个模型。每个任务只绑定一个模型，不自动切换或重试。</p></div>
    {loading && <p role="status">正在读取模型配置…</p>}
    {!connected && !loading && <p role="alert">本机 Agent 未连接，请通过“设置与连接”重新连接。</p>}
    {error && <p role="alert">模型读取失败：<code>{error}</code> <Button onClick={() => { void onReload(); }}>重新读取模型</Button></p>}
    <div className="hz-agent__model-layout">
      <nav className="hz-agent__model-list" aria-label="已配置模型">
        <p className="hz-agent__secondary">已配置模型</p>
        {!loading && !error && !models.length && <p className="hz-agent__muted">尚未配置模型，请添加。</p>}
        {models.map(item => <button key={item.id} disabled={!!busy} aria-current={profile?.id === item.id ? 'true' : undefined} onClick={() => edit(item)}><span>{item.displayName}</span>{item.isDefault && <span className="hz-agent__model-icon"><img src={check} width="24" height="24" alt="默认模型" /></span>}</button>)}
        <Button type="text" disabled={!!busy || loading} icon={<span className="hz-agent__model-icon"><img src={plus} width="24" height="24" alt="" /></span>} onClick={() => edit()}>添加模型</Button>
      </nav>
      <form className="hz-agent__model-form" onSubmit={event => { event.preventDefault(); void save(); }} autoComplete="off">
        <p className="hz-agent__model-protocol"><span className="hz-agent__secondary">连接协议</span><span>OpenAI-compatible</span></p>
        <label htmlFor="model-display-name">显示名称<Input id="model-display-name" required value={name} disabled={!!busy || loading} onChange={event => change(() => setName(event.target.value))} /></label>
        <label htmlFor="model-id">模型 ID<Input id="model-id" aria-label="模型 ID" required value={model} placeholder="填写服务商提供的模型 ID" disabled={!!busy || loading} onChange={event => change(() => setModel(event.target.value))} /><span className="hz-agent__muted">以服务商实际支持的模型标识为准。</span></label>
        <label htmlFor="model-base-url">Base URL<Input id="model-base-url" type="url" required value={baseUrl} placeholder="https://your-provider.example/v1" disabled={!!busy || loading} onChange={event => change(() => setBaseUrl(event.target.value))} /></label>
        <label htmlFor="model-key">API Key<Input id="model-key" aria-label="API Key" type="password" autoComplete="off" required={!profile?.keyConfigured} value={apiKey} placeholder={profile?.keyConfigured ? '已配置，留空保持' : '输入 API Key'} disabled={!!busy || loading} onChange={event => change(() => setApiKey(event.target.value))} /><span className="hz-agent__muted">仅在本地保存，不进入对话、日志或导出报告。</span></label>
        <div className="hz-agent__model-actions"><Button aria-label="检查连接" loading={busy === 'check'} disabled={!connected || loading || !!busy || !model || !baseUrl || (!apiKey && !profile?.keyConfigured)} onClick={() => { void probe(); }}>检查连接</Button><span role="status" className="hz-agent__muted">{checkResult}</span><Button type="primary" htmlType="submit" loading={busy === 'save'} disabled={!connected || loading || !!busy}>{saved ? '设为默认' : '保存并设为默认'}</Button></div>
        {notice && <p role="status" data-testid="model-save-status">{notice}</p>}
        <p className="hz-agent__muted">切换仅用于后续任务；已运行任务保留原模型绑定。</p>
      </form>
    </div>
    <p className="hz-agent__muted">连接检查、配置保存与执行就绪分别核验；配置变更不代表取得当前身份的 LIVE 授权。</p>
  </section>;
}
