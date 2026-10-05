import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Delete, Leaf, Monitor, RefreshCw } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { BackButton, Brand, Loading, Page } from '../ui/common';
import { ChildForm } from '../ui/ChildForm';
import { normalizeServer } from '../data';
import { requestDeadline } from '../compat';
import { IS_DEMO } from '../demo';

interface Pairing { pairingId: string; code: string; expiresAt: string }
export function Setup() {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'choose' | 'remote' | 'local' | 'children'>(
    params.has('children') ? 'children' : params.has('connect') && !IS_DEMO ? 'remote' : params.has('offline') || IS_DEMO ? 'local' : 'choose',
  );
  const [server, setServer] = useState(() => {
    const saved = localStorage.getItem('sprout.server');
    return saved || (/^https?:$/.test(location.protocol) ? location.origin : '');
  });
  const [host, setHost] = useState('192.168.');
  const [port, setPort] = useState('4310');
  const [field, setField] = useState<'host' | 'port'>('host');
  const [pair, setPair] = useState<Pairing | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const request = useRef<AbortController | null>(null);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!approved || app.loading || !app.bootstrap || app.source?.kind !== 'remote') return;
    if (app.bootstrap.child) navigate('/', { replace: true });
    else setMode('children');
  }, [approved, app.loading, app.bootstrap, app.source, navigate]);
  useEffect(() => {
    if (!pair || approved) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function poll() {
      if (!alive) return;
      setClock(Date.now());
      if (Date.now() >= new Date(pair!.expiresAt).getTime()) { setError('配对码已过期，请重新获取'); return; }
      const deadline = requestDeadline(abort.signal, 8000);
      try {
        const response = await fetch(`${server}/api/pair/${encodeURIComponent(pair!.pairingId)}`, { signal: deadline.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('暂时连接不上家庭服务器');
        const result = await response.json() as { status: string; deviceToken?: string };
        if (!alive) return;
        if (result.status === 'approved' && result.deviceToken) {
          // 配对 token 只下发一次，交给数据源立即持久化后再引导选孩子。
          await app.useRemote(server, result.deviceToken);
          if (alive) { setApproved(true); setPair(null); }
          return;
        }
        if (result.status === 'expired') { setError('配对码已过期，请重新获取'); return; }
        setError('');
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '等待连接恢复');
      } finally {
        deadline.dispose();
      }
      if (alive) timer = setTimeout(() => void poll(), 2000);
    }
    timer = setTimeout(() => void poll(), 2000);
    return () => { alive = false; clearTimeout(timer); abort.abort(); };
  }, [pair, server, approved, app.useRemote]);

  async function connect() {
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setBusy(true); setError(''); setPair(null);
    const deadline = requestDeadline(abort.signal, 10_000);
    try {
      const address = normalizeServer(server || `http://${host}:${port}`);
      setServer(address);
      const signal = deadline.signal;
      const health = await fetch(`${address}/api/health`, { signal, cache: 'no-store' });
      if (!health.ok || !(await health.json() as { ok?: boolean }).ok) throw new Error('未找到家庭服务器，请检查地址和网络');
      const response = await fetch(`${address}/api/pair/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '芽芽播放端', kind: /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'tv' }), signal });
      if (!response.ok) throw new Error('无法生成配对码，请稍后重试');
      const result = await response.json() as Pairing;
      if (!/^\d{6}$/.test(result.code) || !result.pairingId || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('服务器返回了无效的配对信息');
      setClock(Date.now()); setPair(result);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '连接失败');
    } finally { deadline.dispose(); if (!abort.signal.aborted) setBusy(false); }
  }
  function digit(value: string) {
    setServer('');
    if (value === ':') { setField('port'); return; }
    const update = (current: string) => value === 'delete' ? current.slice(0, -1) : `${current}${value}`.slice(0, field === 'host' ? 60 : 5);
    if (field === 'host') setHost(update); else setPort(update);
  }
  function back() {
    request.current?.abort(); setBusy(false); setPair(null); setError('');
    if (mode !== 'choose') setMode('choose'); else if (app.bootstrap?.child) navigate('/');
  }

  return <Page className={`setup setup-${mode}`} onBack={back}>
    <header><Brand />{(mode !== 'choose' || app.bootstrap?.child) && <BackButton onClick={back} />}</header>
    {mode === 'choose' && <main className="setup-welcome">
      <div className="welcome-art" aria-hidden="true"><Leaf /><span className="seed-line" /></div>
      <h1>一起，慢慢长大</h1>
      <div className={`setup-options${IS_DEMO ? ' demo-only' : ''}`}>
        {!IS_DEMO && <button data-focusable className="setup-option remote" onClick={() => setMode('remote')}><Monitor /><span>连接家庭服务器</span><ArrowRight /></button>}
        <button data-focusable className="setup-option local" onClick={() => setMode('local')}><Leaf /><span>先离线体验</span><ArrowRight /></button>
      </div>
    </main>}
    {mode === 'local' && <main className="setup-form"><h1>认识一下小小的你</h1><ChildForm onSave={async (input) => { await app.useLocal(input); navigate('/', { replace: true }); }} /></main>}
    {mode === 'remote' && <main className={`pairing${!pair && !approved ? ' pairing-entry' : ''}`}>
      {pair ? <>
        <h1>等待家长确认</h1><div className="pair-code" aria-label={`配对码 ${pair.code}`}>{pair.code.split('').map((digit, i) => <span key={i}>{digit}</span>)}</div>
        <p>请在后台「设备」页输入此码</p><small>{Math.max(0, Math.ceil((Date.parse(pair.expiresAt) - clock) / 60_000))} 分钟内有效</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="secondary" data-focusable onClick={() => void connect()}><RefreshCw />重新获取</button>
      </> : approved ? <>{app.error ? <><p role="alert">{app.error}</p><button data-focusable className="primary" onClick={() => void app.refresh().catch(() => undefined)}>重新连接</button></> : <Loading text="正在连接孩子的成长路线" />}</> : <>
        <div className="pairing-details">
          <h1>连接家庭服务器</h1>
          <div className="server-display">
            <span>http://</span>
            <input data-focusable aria-label="服务器 IP" value={host} onFocus={() => setField('host')} onChange={(e) => { setHost(e.target.value); setServer(''); }} className={field === 'host' ? 'active' : ''} />
            <span>:</span><input data-focusable aria-label="服务器端口" value={port} onFocus={() => setField('port')} onChange={(e) => { setPort(e.target.value.replace(/\D/g, '').slice(0, 5)); setServer(''); }} className={field === 'port' ? 'active' : ''} />
          </div>
          {server && <p className="server-address">{server}</p>}
          <label className="advanced-address">完整地址<input data-focusable aria-label="完整服务器地址" value={server} placeholder="http://192.168.1.10:4310" onChange={(e) => setServer(e.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="numeric-keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', ':'].map((value) => <button data-focusable key={value} onClick={() => digit(value)}>{value}</button>)}
          <button data-focusable aria-label="删除一位" title="删除一位" onClick={() => digit('delete')}><Delete /></button>
          <button data-focusable className="primary keypad-confirm" disabled={busy} onClick={() => void connect()}>{busy ? '连接中' : '确认'}<ArrowRight /></button>
        </div>
      </>}
    </main>}
    {mode === 'children' && <main className="choose-child"><h1>谁的小旅程？</h1>
      {app.loading ? <Loading /> : app.bootstrap?.children.length ? <div className="children-list">{app.bootstrap.children.map((child) => <button data-focusable key={child.id} onClick={() => {
        setBusy(true); void app.switchChild(child.id).then(() => navigate('/', { replace: true })).catch((e: unknown) => setError(e instanceof Error ? e.message : '切换失败')).finally(() => setBusy(false));
      }} disabled={busy}><Leaf /><strong>{child.nickname || child.name}</strong></button>)}</div> : <p>请先在家庭服务器后台添加孩子</p>}
      <button data-focusable className="secondary" onClick={() => void app.refresh().catch(() => undefined)}><RefreshCw />刷新</button>
      {(error || app.error) && <p className="form-error" role="alert">{error || app.error}</p>}
    </main>}
  </Page>;
}
