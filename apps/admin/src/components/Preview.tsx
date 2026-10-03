import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { ageOf, type Lesson, type PreviewToken } from '@sprout/schema';
import { useFamily } from '../context';
import { api } from '../lib/api';
import { previewUrl } from '../lib/preview';

export default function Preview({ lessonId, lesson, packId = 'sprout.custom', title = '课程预览' }: {
  lessonId?: string; lesson?: Lesson; packId?: string; title?: string;
}) {
  const { child } = useFamily();
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [revision, setRevision] = useState(0);
  const [paused, setPaused] = useState(document.hidden);
  const [credential, setCredential] = useState<{ key: string; value: PreviewToken } | null>(null);
  const [error, setError] = useState<string>();
  const lastInteraction = useRef(Date.now());
  const player = new URL(location.origin);
  if (import.meta.env.DEV) player.port = '5310';
  const playerOrigin = player.origin;
  const id = lessonId ?? lesson?.id ?? 'custom.draft';
  const mode = child?.languageMode ?? 'zh-en';
  const age = child ? ageOf(child.birthday).months : 18;
  const requestKey = JSON.stringify([id, mode, age, playerOrigin, revision]);
  const current = credential?.key === requestKey ? credential.value : null;
  const source = current ? previewUrl(id, current.token, mode, age, playerOrigin,
    import.meta.env.DEV ? location.origin : undefined) : undefined;

  useEffect(() => {
    if (paused) return;
    const controller = new AbortController();
    let expired: number | undefined;
    setCredential(null);
    setError(undefined);
    setLoaded(false);
    setTimedOut(false);
    const deadline = window.setTimeout(() => {
      controller.abort();
      setError('申请预览凭据超时，请重试。');
    }, 10000);
    void api.post<PreviewToken>('/api/preview/token', undefined, { signal: controller.signal }).then((value) => {
      if (controller.signal.aborted) return;
      const expiresIn = Date.parse(value.expiresAt) - Date.now();
      if (!value.token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error('预览凭据无效或已过期，请重新申请。');
      }
      setCredential({ key: requestKey, value });
      expired = window.setTimeout(() => {
        setCredential(null);
        setError('预览凭据已过期，请重新预览。');
      }, expiresIn);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '无法申请预览凭据，请重试。');
    }).finally(() => window.clearTimeout(deadline));
    return () => {
      controller.abort();
      window.clearTimeout(deadline);
      window.clearTimeout(expired);
    };
  }, [requestKey, paused]);
  useEffect(() => {
    if (!source || paused) return;
    setLoaded(false);
    setTimedOut(false);
    const timer = window.setTimeout(() => setTimedOut(true), 10000);
    return () => window.clearTimeout(timer);
  }, [source, paused]);
  useEffect(() => {
    if (!source || paused || !loaded) return;
    setTimedOut(false);
    if (!lesson) return;
    const timer = window.setTimeout(() => {
      frame.current?.contentWindow?.postMessage({ type: 'sprout:preview', lesson, packId }, playerOrigin);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [lesson, packId, loaded, playerOrigin, source, paused]);
  // 播放端初始化完成后可发送 ready，再补发一次，避免加载慢时丢失草稿。
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!source || paused || event.source !== frame.current?.contentWindow || event.origin !== playerOrigin) return;
      if (event.data?.type === 'sprout:preview:ready' && lesson) {
        frame.current?.contentWindow?.postMessage({ type: 'sprout:preview', lesson, packId }, playerOrigin);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [lesson, packId, playerOrigin, source, paused]);
  useEffect(() => {
    const activity = () => { lastInteraction.current = Date.now(); };
    const hidden = () => { if (document.hidden) setPaused(true); };
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.origin === playerOrigin &&
        event.data?.type === 'sprout:preview:activity') activity();
    };
    const timer = window.setInterval(() => {
      if (Date.now() - lastInteraction.current >= 90000) setPaused(true);
    }, 5000);
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [playerOrigin]);
  if (paused) return <div className="preview-paused">
    <span>预览已暂停</span>
    <Button onClick={() => {
      lastInteraction.current = Date.now();
      setLoaded(false);
      setPaused(false);
      setRevision((value) => value + 1);
    }}>继续预览</Button>
  </div>;
  return <div className="preview-container">
    {error && <Alert type="error" showIcon title="预览暂不可用" description={error}
      action={<Button icon={<ReloadOutlined />} onClick={() => setRevision((value) => value + 1)}>重试</Button>} />}
    {!source && !error && <div className="preview-paused" role="status"><Spin /><span>正在申请只读预览凭据…</span></div>}
    {timedOut && !loaded && <Alert type="warning" showIcon title="播放端尚未就绪" description="请确认播放端服务正在运行，再重试预览。" action={<Button icon={<ReloadOutlined />} onClick={() => setRevision((value) => value + 1)}>重试</Button>} />}
    {source && <iframe key={source} ref={frame} className="preview-frame" title={title} src={source}
      onPointerEnter={() => { lastInteraction.current = Date.now(); }}
      sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen" referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)} />}
  </div>;
}
