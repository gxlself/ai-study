import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Armchair, ArrowRight, Eye, Leaf, NotebookPen, Pause, Play, Printer, Sparkles, Users, X } from 'lucide-react';
import { ageOf, type ChildProfile, type ResolvedConcept, type ScreenStatus, type SessionInput } from '@sprout/schema';
import { screenStatus } from '@sprout/core';
import type { ActivityResult } from '../../../../packages/plugin-sdk/src/types';
import { useApp } from '../state/AppContext';
import { ActivityRegistry, createResources, preloadLesson } from '../host';
import type { DataSource, LessonData } from '../data';
import { resolvePlaybackMode } from '../data';
import { effectiveScreen, grantEvents, VisibleClock } from '../state/policy';
import { InteractionWatch } from '../state/idle';
import { BackButton, IconButton, Loading, OfflineCards, Page, Problem } from '../ui/common';
import { ActivityStage } from '../ui/ActivityStage';
import { OfflineLesson } from './OfflineLesson';
import { tryFullscreen } from '../compat';

export function LessonPlayer() {
  const { id = '' } = useParams();
  const { source, bootstrap } = useApp();
  const navigate = useNavigate();
  const requestedOffline = useLocation().state?.offlineOnly === true;
  const [data, setData] = useState<LessonData | null>(null);
  const [screen, setScreen] = useState<ScreenStatus | null>(null);
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(''); setOfflineOnly(false);
    if (!source || !bootstrap?.child) return;
    void source.lesson(id).then(async (loaded) => {
      if (!active) return;
      if (loaded.lesson.audience === 'parent' || requestedOffline) {
        setScreen(null); setOfflineOnly(requestedOffline && loaded.lesson.audience !== 'parent'); setData(loaded); return;
      }
      const status = await source.screen(bootstrap.child!.id);
      if (!active) return;
      if (resolvePlaybackMode(status, bootstrap.child!) === 'parent-only') {
        setScreen(null); setOfflineOnly(true); setData(loaded); return;
      }
      if (!effectiveScreen(status, bootstrap.child!.id).allowedNow) { navigate('/rest', { replace: true }); return; }
      setScreen(status); setData(loaded);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : '课程暂时无法打开'); });
    return () => { active = false; };
  }, [source, bootstrap?.child?.id, id, attempt, navigate, requestedOffline]);
  if (!data) return <Page onBack={() => navigate('/')}><BackButton onClick={() => navigate('/')} />{error ? <Problem message={error} retry={() => setAttempt(attempt + 1)} /> : <Loading />}</Page>;
  if (offlineOnly) return <OfflineLesson key={`${bootstrap?.child?.id}:${data.lesson.id}`} data={data} />;
  return <LessonExperience key={data.lesson.id} data={data} initialScreen={screen ?? undefined} />;
}

export interface PreviewEnvironment {
  source: DataSource;
  concepts: ResolvedConcept[];
  registry: ActivityRegistry;
  child: ChildProfile;
}

export function LessonExperience({ data, initialScreen, preview }: { data: LessonData; initialScreen?: ScreenStatus; preview?: PreviewEnvironment }) {
  const app = useApp();
  const navigate = useNavigate();
  const lesson = data.lesson;
  const parentLesson = lesson.audience === 'parent';
  const source = preview?.source ?? app.source!;
  const child = preview?.child ?? app.bootstrap!.child!;
  const registry = preview?.registry ?? app.registry;
  const concepts = preview?.concepts ?? app.concepts;
  const [phase, setPhase] = useState<'intro' | 'preload' | 'distance' | 'playing' | 'ended' | 'rest'>('intro');
  const [stepIndex, setStepIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [distanceSeconds, setDistanceSeconds] = useState(3);
  const [hidden, setHidden] = useState(document.hidden);
  const [manualPause, setManualPause] = useState(false);
  const [idlePaused, setIdlePaused] = useState(false);
  const [companionPlaying, setCompanionPlaying] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(Boolean(preview));
  const [celebrate, setCelebrate] = useState(false);
  const [startError, setStartError] = useState('');
  const [screen, setScreen] = useState(initialScreen);
  const clock = useRef(new VisibleClock());
  const startedAt = useRef<string | null>(null);
  const stepsCompleted = useRef(0);
  const events = useRef<NonNullable<SessionInput['events']>>(preview || parentLesson ? [] : grantEvents(child.id));
  const clientId = useRef(globalThis.crypto?.randomUUID?.() ?? `player-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const pendingRecord = useRef<SessionInput | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const savedRef = useRef(Boolean(preview));
  const alive = useRef(true);
  const phaseRef = useRef(phase);
  const preloadController = useRef<AbortController | null>(null);
  const starting = useRef(false);
  const watch = useRef(new InteractionWatch());
  const paused = hidden || manualPause || idlePaused || (!preview && app.gateOpen);
  const runtime = useRef({ paused, idlePaused, gateOpen: app.gateOpen });
  runtime.current = { paused, idlePaused, gateOpen: app.gateOpen };
  phaseRef.current = phase;
  const resources = useMemo(() => createResources({ packId: data.packId, concepts, resolveAsset: (packId, path) => source.resolveAsset(packId, path) }), [data.packId, concepts, source]);
  const activityChild = useMemo(() => ({ name: child.name, languageMode: child.languageMode, showPinyin: child.showPinyin, ageMonths: ageOf(child.birthday).months }), [child.name, child.languageMode, child.showPinyin, child.birthday]);
  const cover = lesson.cover?.image ? resources.resolveAsset(lesson.cover.image) : lesson.cover?.concept ? resources.concept(lesson.cover.concept)?.imageUrl : undefined;

  const log = useCallback((type: string, value?: Record<string, unknown>) => {
    if (parentLesson && lesson.steps[stepIndex]?.type === 'guide') {
      if (type === 'guide:start' && typeof value?.playMin === 'number' && value.playMin > 0) setCompanionPlaying(true);
      if (type === 'guide:play-end') { setCompanionPlaying(false); watch.current.touch(); }
    }
    if (events.current.length >= 498) return;
    let safeData: unknown;
    try { safeData = value ? JSON.parse(JSON.stringify(value)) : undefined; } catch { safeData = { invalidData: true }; }
    events.current.push({ t: clock.current.seconds(), type: type.slice(0, 120), data: safeData });
  }, [parentLesson, lesson.steps, stepIndex]);
  const save = useCallback((completed: boolean): Promise<void> => {
    if (preview || !startedAt.current || savedRef.current) return Promise.resolve();
    if (saving.current) return saving.current;
    clock.current.setRunning(false);
    pendingRecord.current ??= {
      clientId: clientId.current, childId: child.id, lessonId: lesson.id,
      startedAt: startedAt.current, endedAt: new Date().toISOString(),
      durationSec: Math.min(7200, clock.current.seconds()), completed,
      audience: parentLesson ? 'parent' : 'child',
      stepsCompleted: stepsCompleted.current, stepsTotal: lesson.steps.length, events: events.current,
    };
    const promise = source.saveSession(pendingRecord.current).then(() => {
      savedRef.current = true;
      if (alive.current) { setSaved(true); setSaveError(''); }
    }).catch((e: unknown) => {
      if (alive.current) setSaveError(e instanceof Error ? e.message : '学习记录暂时无法保存');
      throw e;
    }).finally(() => { saving.current = null; });
    saving.current = promise;
    return promise;
  }, [preview, child.id, lesson.id, lesson.steps.length, source, parentLesson]);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    alive.current = true;
    const onVisibility = () => {
      setHidden(document.hidden);
      if (document.hidden) { clock.current.setRunning(false); app.speech.pause(); }
      else watch.current.touch();
    };
    const onPageHide = () => {
      clock.current.setRunning(false);
      if (startedAt.current && !['ended', 'rest'].includes(phaseRef.current)) setPhase('rest');
      void saveRef.current(false).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [app.speech]);
  useEffect(() => () => {
    alive.current = false; preloadController.current?.abort(); clock.current.setRunning(false);
    void saveRef.current(false).catch(() => undefined);
  }, []);
  useEffect(() => {
    clock.current.setRunning(phase === 'playing' && !paused);
    if (paused) app.speech.pause(); else app.speech.resume();
    if (!paused) watch.current.touch();
  }, [phase, paused, app.speech]);
  useEffect(() => {
    let swallowClick = false;
    let resetClick: ReturnType<typeof setTimeout> | undefined;
    const input = (event: Event) => {
      watch.current.touch();
      if (runtime.current.gateOpen || !runtime.current.idlePaused) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'pointerdown') {
        swallowClick = true;
        clearTimeout(resetClick);
        resetClick = setTimeout(() => { swallowClick = false; }, 700);
      }
      runtime.current.idlePaused = false;
      setIdlePaused(false);
    };
    const click = (event: Event) => {
      if (swallowClick) { event.preventDefault(); event.stopImmediatePropagation(); swallowClick = false; }
      else input(event);
    };
    document.addEventListener('keydown', input, true);
    document.addEventListener('pointerdown', input, true);
    document.addEventListener('click', click, true);
    document.addEventListener('wheel', input, { capture: true, passive: false });
    return () => {
      clearTimeout(resetClick);
      document.removeEventListener('keydown', input, true);
      document.removeEventListener('pointerdown', input, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('wheel', input, true);
    };
  }, []);
  useEffect(() => {
    if (phase !== 'playing' || preview || paused || (parentLesson && companionPlaying)) return;
    const timer = setInterval(() => {
      if (!watch.current.expired()) return;
      clock.current.setRunning(false);
      runtime.current.idlePaused = true;
      app.speech.pause();
      setIdlePaused(true);
      log('session.idle-pause', { afterSec: 180 });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, preview, paused, parentLesson, companionPlaying, app.speech, log]);
  useEffect(() => {
    if (phase !== 'distance') return;
    const timer = setInterval(() => {
      if (!paused) setDistanceSeconds((seconds) => seconds - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, paused]);
  useEffect(() => { if (phase === 'distance' && distanceSeconds <= 0) setPhase('playing'); }, [phase, distanceSeconds]);
  useEffect(() => {
    if (phase !== 'ended' || parentLesson) return;
    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 2000);
    return () => clearTimeout(timer);
  }, [phase, parentLesson]);
  useEffect(() => {
    if (phase !== 'playing' || preview || parentLesson || !screen) return;
    const timer = setInterval(() => {
      const elapsed = clock.current.seconds();
      const raw = screenStatus({
        policy: { sessionMaxMin: screen.sessionMaxSec / 60, dailyMaxMin: screen.dailyMaxSec / 60, lessonsPerDay: 1, coView: screen.coView },
        windows: child.screen.windows, usedSec: screen.usedSec + elapsed, now: new Date(),
      });
      const sessionLimit = Math.min(screen.sessionMaxSec, ageOf(child.birthday).months < 24 ? 8 * 60 : 20 * 60);
      if (elapsed >= sessionLimit || !effectiveScreen(raw, child.id).allowedNow) {
        clock.current.setRunning(false);
        log('screen.limit', { reason: elapsed >= sessionLimit ? 'session-limit' : raw.reason ?? 'daily-limit' });
        setPhase('rest'); app.speech.stopSpeaking(); void save(false).catch(() => undefined);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [phase, preview, parentLesson, screen, child, log, save, app.speech]);

  async function begin() {
    if (phase !== 'intro' || starting.current) return;
    starting.current = true;
    const controller = new AbortController();
    preloadController.current = controller;
    setStartError(''); setPhase('preload');
    await app.speech.unlock().catch(() => undefined);
    if (!preview && !document.fullscreenElement && window.innerWidth >= 1366) void tryFullscreen(document.documentElement);
    try {
      if (!alive.current || controller.signal.aborted) return;
      if (!preview && !parentLesson) {
        const status = await source.screen(child.id);
        if (!alive.current || controller.signal.aborted) return;
        if (resolvePlaybackMode(status, child) === 'parent-only') { navigate('/', { replace: true }); return; }
        if (!effectiveScreen(status, child.id).allowedNow) { navigate('/rest', { replace: true }); return; }
        setScreen(status);
      }
      await preloadLesson(lesson, registry, resources, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      startedAt.current = new Date().toISOString();
      log('lesson.start', { preview: Boolean(preview) });
      setPhase(!preview && !parentLesson && child.screen.distanceReminder ? 'distance' : 'playing');
    } catch (e) {
      if (alive.current) { setPhase('intro'); setStartError(e instanceof Error ? e.message : '课程暂时无法开始'); }
    } finally { starting.current = false; }
  }
  function complete(result?: ActivityResult) {
    if (phaseRef.current !== 'playing') return;
    stepsCompleted.current += 1;
    log('step.complete', { step: stepIndex, ...result });
    setHint(null); setCompanionPlaying(false);
    if (stepIndex + 1 >= lesson.steps.length) {
      clock.current.setRunning(false); setPhase('ended'); void save(true).catch(() => undefined);
    } else setStepIndex((index) => index + 1);
  }
  async function exit() {
    if (!preview && !parentLesson && !await app.askParent()) return;
    preloadController.current?.abort();
    log('lesson.exit');
    clock.current.setRunning(false);
    app.speech.stopSpeaking();
    if (startedAt.current && !preview) setPhase('rest');
    try { await save(false); } catch { return; }
    if (preview) { setPhase('intro'); setStepIndex(0); stepsCompleted.current = 0; }
    else { void app.refresh().catch(() => undefined); navigate('/'); }
  }
  async function home() {
    try { await save(phase === 'ended'); } catch { return; }
    if (preview) { setPhase('intro'); setStepIndex(0); stepsCompleted.current = 0; return; }
    void app.refresh().catch(() => undefined); navigate('/');
  }

  return <Page className={`lesson-page phase-${phase} ${parentLesson ? 'audience-parent' : ''} ${companionPlaying ? 'guide-dim' : ''}`} onBack={() => void exit()}>
    {phase === 'intro' && <>
      <header><BackButton onClick={() => void exit()} /><span className="co-view"><Users />{parentLesson ? '只给家长看' : '需要家长全程陪同'}</span></header>
      <main className="lesson-intro">
        <div className="intro-cover">{cover ? <img src={cover} alt="" /> : <Leaf />}</div>
        <div className="intro-copy"><span className="eyebrow">{preview ? '课程预览' : parentLesson ? '家长指引' : '家长导语'} · {lesson.durationMin} 分钟</span><h1>{lesson.title.zh}</h1>{lesson.title.en && <p className="english-title" lang="en">{lesson.title.en}</p>}
          {parentLesson && <p className="parent-reading-note">读完放下屏幕，去和宝宝玩真东西。</p>}
          {!!lesson.printables?.length && <p className="printable-note"><Printer />可在后台打印卡片</p>}
          <p className="intro-text">{lesson.parentGuide.intro}</p>
          {lesson.parentGuide.phrases?.length ? <div className="parent-phrases">{lesson.parentGuide.phrases.map((phrase, i) => <p key={i}><strong>{phrase.zh}</strong>{phrase.en && <span lang="en">{phrase.en}</span>}</p>)}</div> : null}
          {startError && <p role="alert" className="form-error">{startError}</p>}
          <button data-focusable className="primary start-lesson" onClick={() => void begin()}><Play fill="currentColor" />开始</button>
        </div>
      </main>
    </>}
    {phase === 'preload' && <><BackButton onClick={() => void exit()} /><Loading text="把小小的发现准备好" /></>}
    {phase === 'distance' && <div className="distance-reminder"><div className="distance-art" aria-hidden="true"><Armchair /><Eye /></div><h1>坐远一点，保护眼睛</h1><span className="distance-count">{distanceSeconds}</span></div>}
    {phase === 'playing' && <>
      <div className="lesson-topbar"><IconButton label="退出课程" onClick={() => void exit()}><X /></IconButton>
        <div className="step-dots" aria-label={`第 ${stepIndex + 1} 步，共 ${lesson.steps.length} 步`}>{lesson.steps.map((_, i) => <span key={i} className={i <= stepIndex ? 'active' : ''} />)}</div>
        <IconButton label={manualPause ? '继续课程' : '暂停课程'} onClick={() => setManualPause(!manualPause)}>{manualPause ? <Play /> : <Pause />}</IconButton>
      </div>
      <ActivityStage key={`${lesson.id}:${stepIndex}`} lesson={lesson} index={stepIndex} child={activityChild} resources={resources} registry={registry} paused={paused} onComplete={complete} onLog={log} onHint={setHint} />
      {app.prefs.parentHints && !companionPlaying && !(parentLesson && lesson.steps[stepIndex].type === 'guide') && <aside className="parent-hint"><Users /><span>{hint ?? lesson.steps[stepIndex].parentTip ?? lesson.parentGuide.tips?.[0] ?? '陪在宝宝身边，等一等他的回应。'}</span></aside>}
      {manualPause && <PauseOverlay onResume={() => setManualPause(false)} onExit={() => void exit()} />}
      {idlePaused && <PauseOverlay idle onResume={() => { watch.current.touch(); setIdlePaused(false); }} onExit={() => void exit()} />}
    </>}
    {(phase === 'ended' || phase === 'rest') && <>
      <main className="lesson-end">
        <div className={`end-art ${!parentLesson && celebrate && !app.reducedMotion ? 'celebrate' : ''}`} aria-hidden="true">{parentLesson ? <NotebookPen /> : phase === 'ended' ? <Sparkles /> : <Leaf />}</div>
        <h1>{parentLesson ? '放下屏幕，去陪宝宝玩吧' : phase === 'ended' ? '你今天看得真认真！' : '休息一下'}</h1><p className="end-subtitle">{parentLesson ? '跟随宝宝的兴趣，随时调整玩法' : '接下来，和家人一起玩'}</p>
        <OfflineCards items={lesson.offline} />
        {saveError ? <Problem message={saveError} retry={() => void save(phase === 'ended').catch(() => undefined)} /> : !saved && <p role="status">正在保存这次小旅程</p>}
        <button className="primary" data-focusable disabled={!saved && Boolean(startedAt.current)} onClick={() => void home()}>{preview ? '重新预览' : '回到首页'}<ArrowRight /></button>
      </main>
    </>}
    {saveError && phase !== 'ended' && phase !== 'rest' && <div className="save-warning" role="alert">{saveError}<button data-focusable onClick={() => void save(false).catch(() => undefined)}>重试保存</button></div>}
  </Page>;
}

function PauseOverlay({ onResume, onExit, idle = false }: { onResume(): void; onExit(): void; idle?: boolean }) {
  return <Page className="pause-overlay" onBack={idle ? onResume : onExit} onKey={idle ? () => { onResume(); return true; } : undefined}><Pause /><h2>{idle ? '还在一起看吗？' : '歇一小会儿'}</h2><button data-focusable className="primary" onClick={onResume}><Play />继续</button>{!idle && <button data-focusable className="secondary" onClick={onExit}>结束这次小旅程</button>}</Page>;
}
