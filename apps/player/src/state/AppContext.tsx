import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'react-router';
import type { ChildInput, DeviceBootstrap, LessonSummary, ResolvedConcept, TodayPlan } from '@sprout/schema';
import { LocalSource, RemoteSource, readConnection, saveConnection, type DataSource } from '../data';
import { ActivityRegistry, NavigationManager, SpeechEngine } from '../host';
import { ParentGate } from '../ui/ParentGate';

export interface Preferences { parentHints: boolean; reducedMotion: boolean; volume: number }
function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('sprout.preferences') ?? '{}') as Partial<Preferences>;
    return { parentHints: value.parentHints !== false, reducedMotion: value.reducedMotion === true, volume: typeof value.volume === 'number' ? Math.min(1, Math.max(0, value.volume)) : 0.7 };
  } catch { return { parentHints: true, reducedMotion: false, volume: 0.7 }; }
}

function initialSource(): DataSource | null {
  const saved = readConnection();
  if (!saved) return null;
  return saved.kind === 'remote' && saved.server && saved.token ? new RemoteSource(saved.server, saved.token) : new LocalSource();
}

interface AppState {
  source: DataSource | null;
  bootstrap: DeviceBootstrap | null;
  plan: TodayPlan | null;
  lessons: LessonSummary[];
  concepts: ResolvedConcept[];
  loading: boolean;
  error: string;
  prefs: Preferences;
  reducedMotion: boolean;
  navigation: NavigationManager;
  speech: SpeechEngine;
  registry: ActivityRegistry;
  gateOpen: boolean;
  parentAccess: boolean;
  setParentAccess(value: boolean): void;
  askParent(): Promise<boolean>;
  setPrefs(prefs: Partial<Preferences>): void;
  refresh(): Promise<void>;
  useRemote(server: string, token: string): Promise<void>;
  useLocal(input?: ChildInput): Promise<void>;
  switchChild(id: string): Promise<void>;
}
const Context = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const previewMode = useLocation().pathname.startsWith('/preview');
  const [source, setSource] = useState<DataSource | null>(initialSource);
  const sourceRef = useRef(source);
  const [bootstrap, setBootstrap] = useState<DeviceBootstrap | null>(null);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [concepts, setConcepts] = useState<ResolvedConcept[]>([]);
  const [loading, setLoading] = useState(Boolean(source));
  const [error, setError] = useState('');
  const [prefs, setPreferences] = useState(loadPreferences);
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [parentAccess, setParentAccess] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const gateResolve = useRef<((value: boolean) => void) | null>(null);
  const navigation = useMemo(() => new NavigationManager(), []);
  const speech = useMemo(() => new SpeechEngine(), []);
  const registry = useMemo(() => new ActivityRegistry(), []);
  const generation = useRef(0);

  const load = useCallback(async (next: DataSource, blocking = false) => {
    const version = ++generation.current;
    if (blocking) setLoading(true);
    setError('');
    try {
      await next.flush().catch(() => undefined);
      const boot = await next.bootstrap();
      if (version === generation.current) setBootstrap(boot);
      const [catalog, words, manifests, today] = await Promise.all([
        next.lessons(), next.lexicon(), next.audioManifests(),
        boot.child ? next.today(boot.child.id) : Promise.resolve(null),
      ]);
      await registry.load(boot.plugins, (url) => next.resolveAsset('sprout.core', url));
      if (version !== generation.current) return;
      speech.setManifests(manifests);
      setBootstrap(boot);
      setLessons(catalog);
      setConcepts(words);
      setPlan(today);
    } catch (e) {
      if (version === generation.current) setError(e instanceof Error ? e.message : '暂时连接不上，请稍后再试');
      throw e;
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [registry, speech]);
  const refresh = useCallback(async () => {
    if (sourceRef.current) await load(sourceRef.current);
  }, [load]);

  useEffect(() => {
    sourceRef.current = source;
    if (source && !previewMode) void load(source, true).catch(() => undefined);
  }, [source, load, previewMode]);
  useEffect(() => navigation.start(), [navigation]);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    speech.setVolume(prefs.volume);
    document.documentElement.dataset.reducedMotion = String(prefs.reducedMotion || systemReduced);
  }, [prefs, speech, systemReduced]);
  useEffect(() => {
    if (previewMode) return;
    const retry = () => { void sourceRef.current?.flush().catch(() => undefined); };
    window.addEventListener('online', retry);
    const id = window.setInterval(retry, 30_000);
    return () => { window.removeEventListener('online', retry); clearInterval(id); };
  }, [previewMode]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removed = false;
    const listener = NativeApp.addListener('backButton', () => navigation.dispatch('back'));
    void listener.then((handle) => { if (removed) void handle.remove(); });
    return () => { removed = true; void listener.then((handle) => handle.remove()); };
  }, [navigation]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) speech.pause();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); speech.stopSpeaking(); };
  }, [speech]);

  const askParent = useCallback((): Promise<boolean> => {
    gateResolve.current?.(false);
    setGateOpen(true);
    return new Promise((resolve) => { gateResolve.current = resolve; });
  }, []);
  const closeGate = useCallback((passed: boolean) => {
    setGateOpen(false);
    gateResolve.current?.(passed);
    gateResolve.current = null;
  }, []);
  const setPrefs = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem('sprout.preferences', JSON.stringify(next));
      return next;
    });
  }, []);
  const useRemote = useCallback(async (server: string, token: string) => {
    const next = new RemoteSource(server, token);
    saveConnection({ kind: 'remote', server, token });
    generation.current += 1;
    setLoading(true); setBootstrap(null); setPlan(null);
    sourceRef.current = next;
    setSource(next);
  }, []);
  const useLocal = useCallback(async (input?: ChildInput) => {
    const next = new LocalSource();
    if (input) {
      const child = await next.saveChild(input);
      await next.selectChild(child.id);
    }
    saveConnection({ kind: 'local' });
    generation.current += 1;
    setLoading(true); setBootstrap(null); setPlan(null);
    sourceRef.current = next;
    setSource(next);
  }, []);
  const switchChild = useCallback(async (id: string) => {
    const current = sourceRef.current;
    if (!current) return;
    await current.selectChild(id);
    await load(current, true);
  }, [load]);

  return <Context.Provider value={{
    source, bootstrap, plan, lessons, concepts, loading, error, prefs, reducedMotion: prefs.reducedMotion || systemReduced,
    navigation, speech, registry, gateOpen, parentAccess, setParentAccess, askParent, setPrefs, refresh, useLocal, useRemote, switchChild,
  }}>
    {children}
    {gateOpen && <ParentGate navigation={navigation} onClose={closeGate} />}
  </Context.Provider>;
}

export function useApp(): AppState {
  const value = useContext(Context);
  if (!value) throw new Error('播放端上下文尚未就绪');
  return value;
}
