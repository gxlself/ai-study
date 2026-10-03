import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ChildInput, LanguageMode, validateLesson, type ChildProfile, type PluginInfo, type ResolvedConcept } from '@sprout/schema';
import { LocalSource, normalizeServer, RemoteSource, type LessonData } from '../data';
import { ActivityRegistry } from '../host';
import { useApp } from '../state/AppContext';
import { Loading, Page, Problem } from '../ui/common';
import { LessonExperience } from './LessonPlayer';
import { requestDeadline } from '../compat';
import { adminOrigin, consumePreviewCredential, trustedPreviewMessage } from '../security/preview';

export function Preview() {
  const { lessonId } = useParams();
  const [params] = useSearchParams();
  const { speech } = useApp();
  const [data, setData] = useState<LessonData | null>(null);
  const [concepts, setConcepts] = useState<ResolvedConcept[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const serverValue = params.get('server') || (/^https?:$/.test(location.protocol) ? location.origin : '');
  const [credential] = useState(() => consumePreviewCredential(params));
  const token = credential.token;
  const parsedMode = LanguageMode.safeParse(params.get('mode') ?? 'zh-en');
  const mode = parsedMode.success ? parsedMode.data : 'zh-en';
  const inputAge = Number(params.get('age') ?? 24);
  const age = Number.isFinite(inputAge) ? Math.max(0, Math.min(72, Math.floor(inputAge))) : 24;
  const registry = useMemo(() => new ActivityRegistry(), []);
  const connection = useMemo(() => {
    try {
      const server = serverValue ? normalizeServer(serverValue) : '';
      return {
        server, source: server && token ? new RemoteSource(server, token, { preview: true }) : new LocalSource(),
        origin: adminOrigin(server, location.origin, import.meta.env.VITE_SPROUT_ADMIN_ORIGIN, import.meta.env.DEV),
        error: credential.error,
      };
    } catch (e) {
      return { server: '', origin: '', source: new LocalSource(), error: e instanceof Error ? e.message : '预览地址不正确' };
    }
  }, [serverValue, token, credential.error]);
  const child = useMemo<ChildProfile>(() => {
    const now = new Date();
    const born = new Date(now.getFullYear(), now.getMonth() - age, 1);
    return {
      ...ChildInput.parse({ name: '芽芽', birthday: `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-01`, languageMode: mode }),
      id: 'preview', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
  }, [age, mode]);

  useEffect(() => {
    let active = true;
    let messageReceived = false;
    setData(null); setError(connection.error); setReady(false);
    const controller = new AbortController();
    const acceptMessage = (event: MessageEvent<unknown>) => {
      if (!trustedPreviewMessage(event, connection.origin) || connection.error) return;
      const message = event.data;
      if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'sprout:preview') return;
      if (!('lesson' in message)) return;
      const result = validateLesson(message.lesson);
      if (!result.lesson || result.issues.some((issue) => issue.level === 'error')) { setError('预览课程未通过内容校验'); return; }
      const packId = 'packId' in message && typeof message.packId === 'string' && /^[a-z0-9._-]+$/.test(message.packId) ? message.packId : 'sprout.custom';
      messageReceived = true;
      setError('');
      setData({ lesson: result.lesson, packId, baseUrl: connection.source.resolveAsset(packId, '') });
      setRevision((value) => value + 1);
    };
    window.addEventListener('message', acceptMessage);
    async function initialize() {
      if (connection.error) { setReady(true); return; }
      try {
        const [words, manifests] = await Promise.all([
          connection.source.lexicon().catch(() => []),
          connection.source.audioManifests().catch(() => []),
        ]);
        let plugins: PluginInfo[] = [];
        if (connection.server && token) {
          const deadline = requestDeadline(controller.signal, 10_000);
          try {
            const response = await fetch(`${connection.server}/api/plugins`, {
              headers: { Authorization: `Bearer ${token}` }, signal: deadline.signal,
              redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
            });
            if (response.ok) plugins = await response.json() as PluginInfo[];
          } catch { /* 未保存课程仍可用内置活动和内联词条预览。 */ }
          finally { deadline.dispose(); }
        }
        await registry.load(plugins, (url) => new URL(url, `${connection.server || location.origin}/`).href, connection.server);
        if (!active) return;
        setConcepts(words); speech.setManifests(manifests); setReady(true);
        if (window.parent !== window) window.parent.postMessage({ type: 'sprout:preview:ready' }, connection.origin);
        if (lessonId && !messageReceived) {
          const loaded = await connection.source.lesson(lessonId);
          if (active && !messageReceived) { setData(loaded); setRevision((value) => value + 1); }
        }
      } catch (e) {
        if (active) { setReady(true); setError(e instanceof Error ? e.message : '预览暂时无法载入'); }
      }
    }
    void initialize();
    return () => { active = false; controller.abort(); window.removeEventListener('message', acceptMessage); speech.stopSpeaking(); };
  }, [connection, lessonId, registry, speech, token]);
  if (error) return <Page className="preview-page"><Problem message={error} /></Page>;
  if (!ready || !data) return <Page className="preview-page"><Loading text={ready ? '等待预览课程' : '预览准备中'} /></Page>;
  return <LessonExperience key={`${data.lesson.id}:${revision}:${mode}:${age}`} data={data} preview={{ source: connection.source, concepts, registry, child }} />;
}
