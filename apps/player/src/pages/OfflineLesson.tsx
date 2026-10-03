import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Leaf } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { SessionInput } from '@sprout/schema';
import type { LessonData } from '../data';
import { newId } from '../data/storage';
import { useApp } from '../state/AppContext';
import { VisibleClock } from '../state/policy';
import { BackButton, OfflineCards, Page, Problem } from '../ui/common';

export function OfflineLesson({ data }: { data: LessonData }) {
  const app = useApp();
  const navigate = useNavigate();
  const { lesson } = data;
  const child = app.bootstrap!.child!;
  const clock = useRef(new VisibleClock());
  const startedAt = useRef(new Date().toISOString());
  const clientId = useRef(newId('offline-session', new Date()));
  const record = useRef<SessionInput | null>(null);
  const saved = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    app.speech.stopSpeaking();
    const visibility = () => clock.current.setRunning(!document.hidden && !app.gateOpen);
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { clock.current.setRunning(false); document.removeEventListener('visibilitychange', visibility); };
  }, [app.speech, app.gateOpen]);
  const save = useCallback((completed: boolean) => {
    if (saved.current) return Promise.resolve();
    if (saving.current) return saving.current;
    clock.current.setRunning(false);
    record.current ??= {
      clientId: clientId.current, childId: child.id, lessonId: lesson.id,
      startedAt: startedAt.current, endedAt: new Date().toISOString(),
      durationSec: Math.min(7200, clock.current.seconds()), completed,
      audience: 'parent', stepsCompleted: 0, stepsTotal: 0,
      events: [{ t: 0, type: 'lesson.offline-only' }],
    };
    saving.current = app.source!.saveSession(record.current).then(() => { saved.current = true; })
      .finally(() => { saving.current = null; });
    return saving.current;
  }, [app.source, child.id, lesson.id]);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => { void saveRef.current(false).catch(() => undefined); }, []);

  async function finish(completed: boolean) {
    setBusy(true); setError('');
    try {
      await save(completed);
      void app.refresh().catch(() => undefined);
      navigate('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '记录暂时无法保存');
      setBusy(false);
    }
  }
  return <Page className="offline-lesson audience-parent" onBack={() => void finish(false)}>
    <header><BackButton onClick={() => void finish(false)} /><span className="offline-badge"><Leaf />线下版</span></header>
    <main>
      <h1>{lesson.title.zh}</h1>
      <p className="intro-text">{lesson.parentGuide.intro}</p>
      {!!lesson.parentGuide.phrases?.length && <div className="parent-phrases">{lesson.parentGuide.phrases.map((phrase, index) =>
        <p key={index}><strong>{phrase.zh}</strong>{phrase.en && <span lang="en">{phrase.en}</span>}</p>)}</div>}
      <OfflineCards items={lesson.offline} />
      {error && <Problem message={error} retry={() => void finish(record.current?.completed ?? false)} />}
      <button data-focusable className="primary" disabled={busy} onClick={() => void finish(true)}><Check />完成线下活动，回到首页</button>
    </main>
  </Page>;
}
