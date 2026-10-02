import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BUILTIN_ACTIVITY_META, BUILTIN_ACTIVITY_PROPS, BUILTIN_ACTIVITY_TYPES,
  type BuiltinActivityType, type LanguageMode,
} from '@sprout/schema';
import type { ActivityResult, InputMode, NavKey } from '@sprout/plugin-sdk';
import { builtinActivities } from '../src/index';
import { samples } from './samples';
import { navKeyForEvent } from './navigation';
import { mountPreview, type PreviewStatus } from './runtime';

type LogEntry = { id: number; time: string; type: string; data?: Record<string, unknown> };
const statusText: Record<PreviewStatus, string> = {
  loading: '加载中', running: '运行中', paused: '已暂停', complete: '已完成', error: '发生错误', stopped: '已停止',
};
const modes: { value: InputMode; label: string }[] = [
  { value: 'dpad', label: '遥控器' }, { value: 'touch', label: '触屏' }, { value: 'pointer', label: '鼠标' },
];
const navButtons: { key: NavKey; label: string; symbol: string }[] = [
  { key: 'up', label: '向上', symbol: '↑' },
  { key: 'left', label: '向左', symbol: '←' },
  { key: 'ok', label: '确认', symbol: 'OK' },
  { key: 'right', label: '向右', symbol: '→' },
  { key: 'down', label: '向下', symbol: '↓' },
  { key: 'back', label: '返回宿主', symbol: '↶' },
];

export function Playground() {
  const [type, setType] = useState<BuiltinActivityType>('word-cards');
  const [inputMode, setInputMode] = useState<InputMode>('dpad');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('zh-en');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<PreviewStatus>('loading');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ActivityResult>();
  const [hint, setHint] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<ReturnType<typeof mountPreview> | null>(null);
  const nextLogId = useRef(0);
  const log = useCallback((event: string, data?: Record<string, unknown>) => {
    const entry = { id: ++nextLogId.current, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), type: event, data };
    setLogs((current) => [entry, ...current].slice(0, 150));
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setResult(undefined);
    setError('');
    setHint(null);
    const plugin = builtinActivities.find((activity) => activity.type === type);
    if (!plugin) {
      setStatus('error');
      setError(`活动入口尚未注册：${type}`);
      return;
    }
    const props = BUILTIN_ACTIVITY_PROPS[type].parse(structuredClone(samples[type]));
    const preview = mountPreview(plugin, stage, props, {
      inputMode, languageMode, reducedMotion, log,
      status: setStatus, error: setError, setParentHint: setHint,
      complete: (value = {}) => { setResult(value); log('preview:complete', { ...value }); },
    });
    runtime.current = preview;
    const onKey = (event: KeyboardEvent) => {
      const key = navKeyForEvent(event);
      if (!key) return;
      event.preventDefault();
      if (!event.repeat || key !== 'ok') preview.dispatch(key);
    };
    const onError = (event: ErrorEvent) => preview.fail(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof Error && event.reason.name === 'AbortError') return;
      preview.fail(event.reason);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      preview.stop();
      if (runtime.current === preview) runtime.current = null;
    };
  }, [type, inputMode, languageMode, reducedMotion, revision, log]);

  function stop() {
    runtime.current?.stop();
    runtime.current = null;
    setStatus('stopped');
    setHint(null);
    log('preview:stopped');
  }
  const enabled = status === 'running' || status === 'paused';

  return <div className="pg-shell">
    <header className="pg-header" data-playground-controls>
      <img src={new URL('./assets/flower.svg', import.meta.url).href} alt="" width="32" height="32" />
      <h1>芽芽成长 <span>活动实验台</span></h1>
      <span className="pg-environment">LOCAL / 5312</span>
    </header>
    <div className="pg-layout">
      <aside className="pg-sidebar" data-playground-controls>
        <h2>内置活动 <span>{BUILTIN_ACTIVITY_TYPES.length}</span></h2>
        <nav aria-label="内置活动">
          {BUILTIN_ACTIVITY_TYPES.map((key, index) => <button
            key={key} type="button" aria-current={type === key ? 'page' : undefined}
            onClick={() => { setType(key); if (key === type) setRevision((value) => value + 1); }}
          >
            <span className="pg-order">{String(index + 1).padStart(2, '0')}</span>
            <span>{BUILTIN_ACTIVITY_META[key].zh}<small>{key}</small></span>
          </button>)}
        </nav>
      </aside>
      <main className="pg-main">
        <section className="pg-toolbar" data-playground-controls aria-label="运行设置">
          <fieldset className="pg-modes">
            <legend>输入方式</legend>
            {modes.map((mode) => <label key={mode.value}>
              <input type="radio" name="inputMode" value={mode.value} checked={inputMode === mode.value}
                onChange={() => setInputMode(mode.value)} />
              <span>{mode.label}</span>
            </label>)}
          </fieldset>
          <label className="pg-field">语言
            <select value={languageMode} onChange={(event) => setLanguageMode(event.target.value as LanguageMode)}>
              <option value="zh">中文</option><option value="zh-en">中文 / English</option>
              <option value="en-zh">English / 中文</option><option value="en">English</option>
            </select>
          </label>
          <label className="pg-checkbox">
            <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />
            减少动画
          </label>
          <div className="pg-actions">
            <button className="pg-icon" type="button" title="重新开始" aria-label="重新开始"
              onClick={() => setRevision((value) => value + 1)}>↻</button>
            <button className="pg-icon" type="button" title={status === 'paused' ? '继续' : '暂停'}
              aria-label={status === 'paused' ? '继续' : '暂停'} disabled={!enabled}
              onClick={() => runtime.current?.togglePause()}>{status === 'paused' ? '▷' : 'Ⅱ'}</button>
            <button className="pg-icon" type="button" title="停止" aria-label="停止" disabled={!enabled} onClick={stop}>□</button>
          </div>
        </section>
        <div className="pg-stage-heading">
          <h2>{BUILTIN_ACTIVITY_META[type].zh} <code>{type}</code></h2>
          <span className={`pg-status pg-status-${status}`} role="status">{statusText[status]}</span>
        </div>
        <section className="pg-stage-frame" aria-label="活动舞台">
          <div className="pg-stage" ref={stageRef} tabIndex={0} aria-label="16:9 活动预览"
            onPointerDownCapture={() => runtime.current?.unlockAudio()} />
          {(['loading', 'complete', 'error', 'stopped'] as PreviewStatus[]).includes(status) && <div
            className="pg-overlay" role={status === 'error' ? 'alert' : undefined}
          >
            <strong>{status === 'complete' ? '本次样例已完成' : statusText[status]}</strong>
            {error && <p>{error}</p>}
            {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
          </div>}
        </section>
        <div className="pg-stage-footer">
          <p className="pg-hint">{hint ?? '暂无家长提示'}</p>
          <div className="pg-remote" aria-label="遥控器" data-playground-controls>
            {navButtons.map((item) => <button key={item.key} type="button" className="pg-icon"
              title={item.label} aria-label={item.label} disabled={status !== 'running'}
              onClick={() => runtime.current?.dispatch(item.key)}>{item.symbol}</button>)}
          </div>
        </div>
        <details className="pg-props" data-playground-controls>
          <summary>样例 props</summary><pre>{JSON.stringify(samples[type], null, 2)}</pre>
        </details>
        <section className="pg-log">
          <header data-playground-controls><h2>事件日志 <span>{logs.length}</span></h2>
            <button className="pg-icon" type="button" title="清空日志" aria-label="清空日志" onClick={() => setLogs([])}>×</button>
          </header>
          <ol aria-label="事件日志">
            {logs.length === 0 && <li className="pg-empty">暂无事件</li>}
            {logs.map((entry) => <li key={entry.id}>
              <time>{entry.time}</time><code>{entry.type}</code>
              {entry.data && <pre>{JSON.stringify(entry.data)}</pre>}
            </li>)}
          </ol>
        </section>
      </main>
    </div>
  </div>;
}
