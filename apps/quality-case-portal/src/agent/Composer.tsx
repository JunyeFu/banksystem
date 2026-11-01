import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from 'antd';
import paperclip from './assets/paperclip.svg';
import send from './assets/send.svg';
import stop from './assets/stop.svg';
import close from './assets/close.svg';

export function Composer({ draft, onDraft, modelPicker, boundModel, disabled, busy, running, stopping, continuation, attachmentReset, onSubmit, onStop }: {
  draft: string; onDraft: (value: string) => void; modelPicker: ReactNode; boundModel?: string; disabled: boolean; busy: boolean;
  running: boolean; stopping: boolean; continuation: boolean; attachmentReset: number;
  onSubmit: (input: string, file?: File) => Promise<boolean>; onStop: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null), composing = useRef(false), lock = useRef(false);
  const [file, setFile] = useState<File>(), [preview, setPreview] = useState<string>(), [error, setError] = useState('');
  useEffect(() => { setFile(undefined); }, [attachmentReset]);
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function submit() {
    if (lock.current || disabled || busy || running || !draft.trim()) return;
    lock.current = true; setError('');
    try { if (await onSubmit(draft, file)) setFile(undefined); }
    finally { lock.current = false; }
  }
  return <div className="hz-agent__composer-column">
    <div className="hz-agent__composer">
      {file && <div className="hz-agent__attachment">{preview && <img src={preview} alt="待提交图片预览" width="48" height="48" />}<span>{file.name}</span><Button type="text" disabled={busy} aria-label="移除图片" onClick={() => setFile(undefined)}><img src={close} width="18" height="18" alt="" /></Button></div>}
      <label className="hz-agent__sr-only" htmlFor="agent-goal">测试目标</label>
      <textarea id="agent-goal" value={draft} onChange={event => onDraft(event.target.value)} rows={1} maxLength={16000}
        placeholder={running ? '执行中，你可以随时停止当前任务' : continuation ? '补充原任务所需信息…' : '描述测试目标，或继续安排任务…'}
        readOnly={running || busy} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void submit(); } }} aria-describedby="agent-stage" />
      <div className="hz-agent__composer-tools">
        <input ref={picker} className="hz-agent__sr-only" type="file" accept="image/png,image/jpeg" aria-label="选择单张 PNG 或 JPEG" disabled={disabled || busy || running || continuation}
          onChange={event => {
            const files = event.target.files; const next = files?.[0], count = files?.length; event.target.value = '';
            if (!next) return;
            if (count !== 1 || !['image/png', 'image/jpeg'].includes(next.type)) { setError('仅支持单张 PNG 或 JPEG 图片。'); return; }
            setError(''); setFile(next);
          }} />
        <Button type="text" disabled={disabled || busy || running || continuation} aria-label="添加单张图片" onClick={() => picker.current?.click()}><img src={paperclip} width="20" height="20" alt="" /></Button>
        {modelPicker}
        <span className="hz-agent__composer-hint">{running || continuation ? '本次模型已绑定' : 'Enter 发送 · Shift + Enter 换行'}</span>
        {running ? <Button shape="circle" className="hz-agent__stop" loading={stopping} disabled={stopping} aria-label="停止当前任务" onClick={onStop}><img src={stop} width="18" height="18" alt="" /></Button>
          : <Button type="primary" shape="circle" loading={busy} disabled={disabled || busy || !draft.trim()} aria-label="发送目标" onClick={() => { void submit(); }}><img src={send} width="18" height="18" alt="" /></Button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
    <p id="agent-stage" className="hz-agent__stage">{boundModel ? `本次绑定：${boundModel}。${continuation ? '补充输入续接原任务，图片沿用原任务。' : '运行中任务不会切换模型。'}` : '手动选择模型，仅用于后续任务 · 不自动切换或重试'}</p>
  </div>;
}
