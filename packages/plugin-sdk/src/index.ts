/**
 * @sprout/plugin-sdk — 插件作者工具与 React 活动适配器。
 *
 * 这里不静态引入 React 运行时。活动可以显式传入宿主使用的 React，
 * 或从 globalThis.SproutHost 复用宿主实例。
 */
import type * as React from 'react';
import type * as ReactDOMClient from 'react-dom/client';
import { pickText } from '@sprout/schema';
import type {
  ChooseOption,
  ConceptRef,
  LanguageMode,
  Lang,
  LText,
  Speech,
} from '@sprout/schema';
import {
  SDK_VERSION,
  type ActivityContext,
  type ActivityInstance,
  type ActivityPlugin,
  type ActivityResult,
  type InputMode,
  type NavKey,
  type SfxName,
  type SpeakOptions,
  type ConceptView,
} from './types';

export * from './types';

type ReactRuntime = typeof React;
type ReactDOMClientRuntime = typeof ReactDOMClient;
type ActivityComponent<P> = React.ComponentType<{ ctx: ActivityContext<P> }>;
type KeyHandler = (key: NavKey) => boolean;

interface PausedStore {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
  set(value: boolean): void;
}

interface KeyRegistry {
  dispatch(key: NavKey): boolean;
  set(handler: KeyHandler): void;
  clear(handler: KeyHandler): void;
  ready(): void;
  discardPending(): void;
  destroy(): void;
}

interface ActivityHookValue {
  keys: KeyRegistry;
  paused: PausedStore;
}

interface HookRuntime {
  React: ReactRuntime;
  Context: React.Context<ActivityHookValue | null>;
}

let hookRuntime: HookRuntime | undefined;

function createPausedStore(): PausedStore {
  let paused = false;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => paused,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value) {
      if (paused === value) return;
      paused = value;
      for (const listener of [...listeners]) listener();
    },
  };
}

function getHost(): { React?: unknown; ReactDOMClient?: unknown } | undefined {
  return (globalThis as typeof globalThis & {
    SproutHost?: { React?: unknown; ReactDOMClient?: unknown };
  }).SproutHost;
}

function isReactRuntime(value: unknown): value is ReactRuntime {
  if (!value || typeof value !== 'object') return false;
  const runtime = value as Partial<ReactRuntime>;
  return typeof runtime.createContext === 'function'
    && typeof runtime.createElement === 'function'
    && typeof runtime.useContext === 'function'
    && typeof runtime.useRef === 'function'
    && typeof runtime.useCallback === 'function'
    && typeof runtime.useLayoutEffect === 'function'
    && typeof runtime.useSyncExternalStore === 'function';
}

function isReactDOMClientRuntime(value: unknown): value is ReactDOMClientRuntime {
  return !!value
    && typeof value === 'object'
    && typeof (value as Partial<ReactDOMClientRuntime>).createRoot === 'function';
}

function resolveReactRuntime(explicit?: ReactRuntime): ReactRuntime {
  const runtime = explicit ?? getHost()?.React;
  if (!isReactRuntime(runtime)) {
    throw new Error(
      '@sprout/plugin-sdk: React runtime is required. Pass React to defineReactActivity or set globalThis.SproutHost.React.',
    );
  }
  return runtime;
}

function resolveReactDOMClientRuntime(explicit?: ReactDOMClientRuntime): ReactDOMClientRuntime {
  const runtime = explicit ?? getHost()?.ReactDOMClient;
  if (!isReactDOMClientRuntime(runtime)) {
    throw new Error(
      '@sprout/plugin-sdk: ReactDOMClient runtime is required. Pass ReactDOMClient to defineReactActivity or set globalThis.SproutHost.ReactDOMClient.',
    );
  }
  return runtime;
}

function ensureHookRuntime(react: ReactRuntime): HookRuntime {
  if (!hookRuntime) {
    hookRuntime = {
      React: react,
      Context: react.createContext<ActivityHookValue | null>(null),
    };
  } else if (hookRuntime.React.useContext !== react.useContext) {
    throw new Error('@sprout/plugin-sdk: 同一个 SDK 模块内的活动必须复用同一份 React 运行时。');
  }
  return hookRuntime;
}

function currentHookRuntime(): HookRuntime {
  if (hookRuntime) return hookRuntime;
  return ensureHookRuntime(resolveReactRuntime());
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('活动已停止', 'AbortError');
  const error = new Error('活动已停止');
  error.name = 'AbortError';
  return error;
}

function defer(task: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(task);
  } else {
    void Promise.resolve().then(task);
  }
}

function createKeyRegistry(): KeyRegistry {
  let handler: KeyHandler | undefined;
  let destroyed = false;
  let ready = false;
  const queued: NavKey[] = [];

  return {
    dispatch(key) {
      if (destroyed) return false;
      if (ready) return handler?.(key) === true;
      // 首次提交前保留非返回键；提交后没有处理器时交还宿主导航。
      if (key !== 'back') {
        queued.push(key);
        return true;
      }
      return false;
    },
    set(next) {
      if (destroyed) return;
      handler = next;
    },
    clear(current) {
      if (handler === current) handler = undefined;
    },
    ready() {
      defer(() => {
        if (destroyed) return;
        ready = true;
        const pending = queued.splice(0);
        for (const key of pending) {
          if (destroyed) break;
          handler?.(key);
        }
      });
    },
    discardPending() {
      queued.length = 0;
    },
    destroy() {
      destroyed = true;
      handler = undefined;
      queued.length = 0;
    },
  };
}

/**
 * 类型辅助。不会包装或修改插件对象。
 */
export function defineActivity<P = Record<string, unknown>>(
  plugin: ActivityPlugin<P>,
): ActivityPlugin<P> {
  return plugin;
}

export interface DefineReactActivityOptions<P = Record<string, unknown>>
  extends Omit<ActivityPlugin<P>, 'mount'> {
  Component: ActivityComponent<P>;
  /** 内置活动显式传入；第三方插件可省略并复用 SproutHost。 */
  React?: ReactRuntime;
  /** 内置活动显式传入；第三方插件可省略并复用 SproutHost。 */
  ReactDOMClient?: ReactDOMClientRuntime;
}

/**
 * 把一个 React 组件适配成 ActivityPlugin。
 *
 * 每次 mount 都创建自己的按键注册器与暂停 store。root.unmount 永远延迟到
 * 当前 React 生命周期结束后执行，避免 complete/abort 在 effect 内触发同步卸载警告。
 */
export function defineReactActivity<P = Record<string, unknown>>(
  options: DefineReactActivityOptions<P>,
): ActivityPlugin<P> {
  const {
    Component,
    React: explicitReact,
    ReactDOMClient: explicitReactDOMClient,
    ...plugin
  } = options;

  return defineActivity({
    ...plugin,
    mount(el, ctx) {
      const react = resolveReactRuntime(explicitReact);
      const reactDOMClient = resolveReactDOMClientRuntime(explicitReactDOMClient);
      const runtime = ensureHookRuntime(react);
      const keys = createKeyRegistry();
      const paused = createPausedStore();
      const value: ActivityHookValue = { keys, paused };
      const controller = new AbortController();
      let disposed = false;
      let root: ReactDOMClient.Root | undefined;
      // 每次挂载独占一个根节点，延迟卸载不会误删同一舞台的新活动。
      const container = el.ownerDocument.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      container.dataset.sproutActivity = plugin.type;

      const dispose = () => {
        if (disposed) return;
        disposed = true;
        keys.destroy();
        ctx.signal.removeEventListener('abort', onAbort);
        controller.abort(ctx.signal.aborted ? ctx.signal.reason : undefined);
        container.remove();
        // React effect 内也可能结束活动，必须等当前提交结束才卸载根。
        defer(() => root?.unmount());
        try {
          ctx.stopSpeaking();
        } finally {
          ctx.setParentHint(null);
        }
      };
      const onAbort = () => dispose();
      const activityContext = Object.create(ctx, {
        signal: { value: controller.signal, enumerable: true },
      }) as ActivityContext<P>;

      const instance: ActivityInstance = {
        unmount: dispose,
        onKey(key) {
          if (disposed) return false;
          if (paused.getSnapshot()) return key !== 'back';
          return keys.dispatch(key);
        },
        pause() {
          if (disposed || paused.getSnapshot()) return;
          keys.discardPending();
          paused.set(true);
          ctx.stopSpeaking();
        },
        resume() {
          if (disposed) return;
          paused.set(false);
        },
      };

      function ActivityRoot() {
        react.useLayoutEffect(() => {
          keys.ready();
        }, []);
        return react.createElement(
          runtime.Context.Provider,
          { value },
          react.createElement(Component, { ctx: activityContext }),
        );
      }

      ctx.signal.addEventListener('abort', onAbort, { once: true });
      if (ctx.signal.aborted) {
        dispose();
      } else {
        try {
          el.append(container);
          root = reactDOMClient.createRoot(container);
          root.render(react.createElement(ActivityRoot));
        } catch (error) {
          dispose();
          throw error;
        }
      }
      return instance;
    },
  });
}

/**
 * 为当前实例注册最近一次已提交渲染的处理器；被放弃的渲染不会替换它。
 */
export function useActivityKeys(handler: KeyHandler): void {
  const runtime = currentHookRuntime();
  const value = runtime.React.useContext(runtime.Context);
  if (!value) throw new Error('useActivityKeys 必须在 defineReactActivity 的组件内使用。');
  runtime.React.useLayoutEffect(() => {
    value.keys.set(handler);
    return () => value.keys.clear(handler);
  });
}

/**
 * 读取当前实例的暂停状态。useSyncExternalStore 能在 pause/resume 时同步读取
 * 最新 snapshot，同时让多个活动实例彼此隔离。
 */
export function useActivityPaused(): boolean {
  const runtime = currentHookRuntime();
  const value = runtime.React.useContext(runtime.Context);
  if (!value) throw new Error('useActivityPaused 必须在 defineReactActivity 的组件内使用。');
  const store = value.paused;
  return runtime.React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

/**
 * 确定性洗牌。返回新数组，不修改输入；seed 可以是数字或字符串。
 */
export function shuffle<T>(items: readonly T[], seed: number | string): T[] {
  const result = [...items];
  let state = hashSeed(seed);
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function hashSeed(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed | 0;
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

/**
 * 可中止的延时。AbortSignal 已中止或在等待中中止时 reject AbortError。
 */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, Math.max(0, ms));
  });
}

/** 把 choose 活动中简写的词库 id 规范化为完整选项。 */
export function chooseOptions(options: readonly (string | ChooseOption)[]): ChooseOption[] {
  return options.map((option) => (
    typeof option === 'string'
      ? { id: option, concept: option }
      : { ...option }
  ));
}

export interface MockContextOverrides<P = Record<string, unknown>> {
  sdkVersion?: string;
  lesson?: Partial<ActivityContext<P>['lesson']>;
  child?: Partial<ActivityContext<P>['child']>;
  locale?: {
    mode?: LanguageMode;
    showPinyin?: boolean;
    pick?: ActivityContext<P>['locale']['pick'];
  };
  input?: {
    mode?: InputMode;
    onChange?: ActivityContext<P>['input']['onChange'];
  };
  reducedMotion?: boolean;
  concepts?: readonly ConceptView[] | Record<string, ConceptView>;
  resolveAsset?: ActivityContext<P>['resolveAsset'];
  concept?: ActivityContext<P>['concept'];
  speak?: ActivityContext<P>['speak'];
  say?: ActivityContext<P>['say'];
  stopSpeaking?: ActivityContext<P>['stopSpeaking'];
  sfx?: ActivityContext<P>['sfx'];
  playAudio?: ActivityContext<P>['playAudio'];
  audioContext?: ActivityContext<P>['audioContext'];
  complete?: ActivityContext<P>['complete'];
  log?: ActivityContext<P>['log'];
  setParentHint?: ActivityContext<P>['setParentHint'];
  focus?: Partial<ActivityContext<P>['focus']>;
  signal?: AbortSignal;
}

export interface MockLogEntry {
  type: string;
  data?: Record<string, unknown>;
}

export interface MockContextTools {
  readonly speeches: (Speech | string)[];
  readonly sayings: { lang: Lang; text: string }[];
  readonly sfx: SfxName[];
  readonly audio: string[];
  readonly logs: MockLogEntry[];
  readonly completions: ActivityResult[];
  readonly parentHints: (string | null)[];
  readonly stopSpeakingCount: number;
  readonly inputMode: InputMode;
  setInputMode(mode: InputMode): void;
  setConcepts(concepts: readonly ConceptView[] | Record<string, ConceptView>): void;
  abort(): void;
}

export type MockActivityContext<P = Record<string, unknown>> = ActivityContext<P> & {
  mock: MockContextTools;
};

function conceptMapFrom(
  concepts: readonly ConceptView[] | Record<string, ConceptView> | undefined,
): Map<string, ConceptView> {
  const map = new Map<string, ConceptView>();
  if (Array.isArray(concepts)) {
    concepts.forEach((concept) => map.set(concept.id, concept));
  } else if (concepts) {
    Object.entries(concepts).forEach(([id, concept]) => {
      map.set(concept.id, concept);
      map.set(id, concept);
    });
  }
  return map;
}

function createInlineConcept(
  ref: Exclude<ConceptRef, string>,
  resolveAsset: (path: string) => string,
): ConceptView {
  return {
    id: ref.id ?? `inline:${ref.zh}`,
    category: 'other',
    zh: ref.zh,
    en: ref.en ?? ref.zh,
    pinyin: ref.pinyin,
    imageUrl: resolveAsset(ref.image),
    sound: ref.sound,
    phrase: ref.phrase,
  };
}

interface MockAudioParam {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
  cancelScheduledValues(time: number): void;
}

function mockAudioParam(value = 0): MockAudioParam {
  return {
    value,
    setValueAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    exponentialRampToValueAtTime(next) { this.value = next; },
    cancelScheduledValues() {},
  };
}

function createMockAudioContext(): AudioContext {
  const node = () => ({
    connect<T>(destination: T) { return destination; },
    disconnect() {},
  });
  class SilentAudioContext extends EventTarget {
    state: AudioContextState = 'running';
    readonly sampleRate = 44100;
    readonly destination = node();
    private elapsed = 0;
    private startedAt = Date.now();

    get currentTime() {
      return this.elapsed + (this.state === 'running' ? (Date.now() - this.startedAt) / 1000 : 0);
    }

    private changeState(state: AudioContextState) {
      if (this.state === state) return;
      this.elapsed = this.currentTime;
      this.startedAt = Date.now();
      this.state = state;
      this.dispatchEvent(new Event('statechange'));
    }

    createGain() {
      return { ...node(), gain: mockAudioParam(1) };
    }
    createOscillator() {
      return {
        ...node(),
        type: 'sine',
        frequency: mockAudioParam(440),
        detune: mockAudioParam(0),
        start() {},
        stop() {},
      };
    }
    createBufferSource() {
      return { ...node(), start() {}, stop() {}, buffer: null };
    }
    async resume() {
      if (this.state === 'closed') throw new DOMException('音频上下文已关闭', 'InvalidStateError');
      this.changeState('running');
    }
    async suspend() {
      if (this.state === 'closed') throw new DOMException('音频上下文已关闭', 'InvalidStateError');
      this.changeState('suspended');
    }
    async close() {
      this.changeState('closed');
    }
  }
  return new SilentAudioContext() as unknown as AudioContext;
}

function replaceConceptMap(
  map: Map<string, ConceptView>,
  concepts: readonly ConceptView[] | Record<string, ConceptView>,
): void {
  map.clear();
  for (const [id, concept] of conceptMapFrom(concepts)) map.set(id, concept);
}

/**
 * 创建给 playground / 单元测试使用的 ActivityContext。
 *
 * concepts 同时接受 ConceptView[] 与 Record<string, ConceptView>；两者都会按
 * concept.id（record 也按 key）建立索引。返回值额外挂有 mock 工具，可用
 * mock.setInputMode()、mock.abort()、mock.completions 和 mock.logs 检查活动行为。
 */
export function createMockContext<P = Record<string, unknown>>(
  props: P,
  overrides: MockContextOverrides<P> = {},
): MockActivityContext<P> {
  const ownController = new AbortController();
  const signal = ownController.signal;
  const concepts = conceptMapFrom(overrides.concepts);
  let inputMode = overrides.input?.mode ?? 'dpad';
  let stopSpeakingCount = 0;
  const inputListeners = new Set<(mode: InputMode) => void>();
  const speeches: (Speech | string)[] = [];
  const sayings: { lang: Lang; text: string }[] = [];
  const sfx: SfxName[] = [];
  const audio: string[] = [];
  const logs: MockLogEntry[] = [];
  const completions: ActivityResult[] = [];
  const parentHints: (string | null)[] = [];
  let audioContext: AudioContext | undefined;
  let completed = false;

  const tools: MockContextTools = {
    speeches,
    sayings,
    sfx,
    audio,
    logs,
    completions,
    parentHints,
    get stopSpeakingCount() { return stopSpeakingCount; },
    get inputMode() { return inputMode; },
    setInputMode(mode) {
      if (signal.aborted || inputMode === mode) return;
      inputMode = mode;
      for (const listener of [...inputListeners]) listener(mode);
    },
    setConcepts(next) {
      replaceConceptMap(concepts, next);
    },
    abort() {
      ownController.abort();
    },
  };

  const resolveAsset = overrides.resolveAsset ?? ((path: string) => path);
  const concept = overrides.concept ?? ((ref: ConceptRef): ConceptView | undefined => {
    if (typeof ref === 'object') return createInlineConcept(ref, resolveAsset);
    return concepts.get(ref);
  });
  const localeMode = overrides.locale?.mode ?? 'zh-en';
  const localePick = overrides.locale?.pick ?? ((text: LText | { zh?: string; en?: string }) => {
    return pickText({ zh: text.zh ?? text.en ?? '', en: text.en }, localeMode);
  });

  const input: ActivityContext<P>['input'] = {
    get mode() {
      return inputMode;
    },
    onChange(callback) {
      inputListeners.add(callback);
      const unsubscribe = overrides.input?.onChange?.(callback);
      return () => {
        inputListeners.delete(callback);
        unsubscribe?.();
      };
    },
  };

  const speak = async (speech: Speech | string, options?: SpeakOptions) => {
    if (signal.aborted) throw abortError();
    speeches.push(speech);
    if (overrides.speak) await overrides.speak(speech, options);
    else console.log('[sprout mock] speak', speech);
  };
  const say = async (lang: Lang, text: string) => {
    if (signal.aborted) throw abortError();
    sayings.push({ lang, text });
    if (overrides.say) await overrides.say(lang, text);
    else console.log('[sprout mock] say', lang, text);
  };
  const stopSpeaking = () => {
    stopSpeakingCount += 1;
    overrides.stopSpeaking?.();
  };
  const playAudio = async (url: string) => {
    if (signal.aborted) throw abortError();
    audio.push(url);
    if (overrides.playAudio) await overrides.playAudio(url);
    else console.log('[sprout mock] audio', url);
  };
  const complete = (result?: ActivityResult) => {
    if (completed || signal.aborted) return;
    completed = true;
    completions.push(result ?? {});
    overrides.complete?.(result);
  };
  const log = (type: string, data?: Record<string, unknown>) => {
    logs.push({ type, data });
    overrides.log?.(type, data);
  };
  const setParentHint = (text: string | null) => {
    parentHints.push(text);
    overrides.setParentHint?.(text);
  };
  const focusCurrent = { value: null as HTMLElement | null };
  const focus: ActivityContext<P>['focus'] = {
    refresh: overrides.focus?.refresh ?? (() => undefined),
    focus: overrides.focus?.focus ?? ((element) => {
      focusCurrent.value = element;
      element?.focus();
    }),
    current: overrides.focus?.current ?? (() => focusCurrent.value),
  };

  const context: MockActivityContext<P> = {
    props,
    sdkVersion: overrides.sdkVersion ?? SDK_VERSION,
    lesson: {
      id: 'mock.lesson',
      title: { zh: '测试活动', en: 'Mock activity' },
      stepIndex: 0,
      stepCount: 1,
      ...overrides.lesson,
    },
    child: {
      name: '芽芽',
      ageMonths: 24,
      ...overrides.child,
    },
    locale: {
      mode: localeMode,
      pick: localePick,
      showPinyin: overrides.locale?.showPinyin ?? false,
    },
    input,
    reducedMotion: overrides.reducedMotion ?? false,
    resolveAsset,
    concept,
    speak,
    say,
    stopSpeaking,
    sfx(name) {
      if (signal.aborted) return;
      sfx.push(name);
      overrides.sfx?.(name);
    },
    playAudio,
    audioContext: overrides.audioContext ?? (() => {
      if (signal.aborted) throw abortError();
      return audioContext ??= createMockAudioContext();
    }),
    complete,
    log,
    setParentHint,
    focus,
    signal,
    mock: tools,
  };

  const onExternalAbort = () => ownController.abort(overrides.signal?.reason);
  signal.addEventListener('abort', () => {
    overrides.signal?.removeEventListener('abort', onExternalAbort);
    inputListeners.clear();
    try {
      stopSpeaking();
    } finally {
      setParentHint(null);
    }
  }, { once: true });
  overrides.signal?.addEventListener('abort', onExternalAbort, { once: true });
  if (overrides.signal?.aborted) onExternalAbort();
  return context;
}
