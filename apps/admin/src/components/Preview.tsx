import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { ageOf, type Lesson } from '@sprout/schema';
import { useFamily } from '../context';
import { getToken } from '../lib/api';
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
  const lastInteraction = useRef(Date.now());
  const playerOrigin = import.meta.env.DEV ? `${location.protocol}//${location.hostname}:5310` : location.origin;
  const source = useMemo(() => previewUrl(
    lessonId ?? lesson?.id ?? 'custom.draft', getToken(), child?.languageMode ?? 'zh-en',
    child ? ageOf(child.birthday).months : 18, playerOrigin, import.meta.env.DEV ? location.origin : undefined,
  ), [lessonId, lesson?.id, child?.languageMode, child?.birthday, playerOrigin]);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    const timer = window.setTimeout(() => setTimedOut(true), 10000);
    return () => window.clearTimeout(timer);
  }, [source, revision]);
  useEffect(() => {
    if (!loaded) return;
    setTimedOut(false);
    if (!lesson) return;
    const timer = window.setTimeout(() => {
      frame.current?.contentWindow?.postMessage({ type: 'sprout:preview', lesson, packId }, playerOrigin);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [lesson, packId, loaded, playerOrigin]);
  // 播放端初始化完成后可发送 ready，再补发一次，避免加载慢时丢失草稿。
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== playerOrigin) return;
      if (event.data?.type === 'sprout:preview:ready' && lesson) {
        frame.current?.contentWindow?.postMessage({ type: 'sprout:preview', lesson, packId }, playerOrigin);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [lesson, packId, playerOrigin]);
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
    {timedOut && !loaded && <Alert type="warning" showIcon title="播放端尚未就绪" description="请确认播放端服务正在运行，再重试预览。" action={<Button icon={<ReloadOutlined />} onClick={() => setRevision((value) => value + 1)}>重试</Button>} />}
    <iframe key={revision} ref={frame} className="preview-frame" title={title} src={source}
      onPointerEnter={() => { lastInteraction.current = Date.now(); }}
      sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen" referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)} />
  </div>;
}
