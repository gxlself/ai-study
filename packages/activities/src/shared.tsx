import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type DependencyList, type ReactNode,
} from 'react';
import {
  BUILTIN_ACTIVITY_META, cardinalitySpeech, numberToEn, numberToZh,
  type BuiltinActivityType, type ConceptRef, type LText, type Speech,
} from '@sprout/schema';
import {
  defineReactActivity, useActivityKeys, useActivityPaused,
  type ActivityContext, type ActivityPlugin, type ActivityResult, type NavKey, type SfxName,
} from '@sprout/plugin-sdk';
import { mediaAsset } from './security';

export const countSpeech = (n: number): Speech => ({ zh: numberToZh(n), en: numberToEn(n) });
export const speechForConcept = (ref?: ConceptRef): Speech | undefined =>
  typeof ref === 'object' ? { zh: ref.zh, en: ref.en } : undefined;

export function collectAssets(props: unknown, helpers: Parameters<NonNullable<ActivityPlugin['preload']>>[1]) {
  const assets = new Set<string>();
  const concept = (ref: ConceptRef) => {
    const image = helpers.concept(ref)?.imageUrl;
    if (image) assets.add(image);
    else if (typeof ref === 'object') assets.add(helpers.resolveAsset(ref.image));
  };
  function visit(value: unknown, key = '') {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (['poster', 'src', 'captions'].includes(key)) {
        const url = mediaAsset(value, helpers);
        if (url) assets.add(url);
      }
      if (key === 'image') {
        try { const url = helpers.resolveAsset(value); if (url) assets.add(url); } catch { /* 跳过不可信素材。 */ }
      }
      if (['concept', 'item', 'items', 'sequence', 'options'].includes(key)) concept(value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => visit(v, key));
    } else if (typeof value === 'object') {
      if ('zh' in value && 'image' in value) concept(value as ConceptRef);
      for (const [k, v] of Object.entries(value)) visit(v, k);
    }
  }
  visit(props);
  return [...assets];
}

export function collectSpeeches(props: unknown): Speech[] {
  const found = new Map<string, Speech>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    if (typeof record.zh === 'string' || typeof record.en === 'string') {
      const speech = {
        ...(typeof record.zh === 'string' && record.zh ? { zh: record.zh } : {}),
        ...(typeof record.en === 'string' && record.en ? { en: record.en } : {}),
      };
      if (speech.zh || speech.en) found.set(JSON.stringify(speech), speech);
    }
    Object.values(record).forEach(visit);
  }
  visit(props);
  return [...found.values()];
}

export function defineBuiltin<P>(
  type: BuiltinActivityType,
  Component: React.ComponentType<{ ctx: ActivityContext<P> }>,
  speeches?: (props: P) => Speech[],
): ActivityPlugin<P> {
  const meta = BUILTIN_ACTIVITY_META[type];
  return defineReactActivity<P>({
    type, version: '1.0.0', name: { zh: meta.zh, en: meta.en }, ageRange: meta.ageRange,
    React, ReactDOMClient, Component,
    preload: collectAssets,
    speeches: (props) => speeches?.(props) ?? [],
  });
}

const abortError = () => new DOMException('活动已停止', 'AbortError');

export interface ActivitySession<P = any> {
  ctx: ActivityContext<P>;
  signal: AbortSignal;
  paused: boolean;
  active(): boolean;
  delay(ms: number, signal?: AbortSignal): Promise<void>;
  speak(speech: Speech | string | undefined, signal?: AbortSignal): Promise<void>;
  sfx(name: SfxName): void;
  complete(result?: ActivityResult): void;
  run(task: () => Promise<void>): void;
}

export function useSession<P>(ctx: ActivityContext<P>): ActivitySession<P> {
  const paused = useActivityPaused();
  const session = useMemo(() => {
    const controller = new AbortController();
    let completed = false;
    const s: ActivitySession<P> = {
      ctx, signal: controller.signal, paused: false,
      active: () => !controller.signal.aborted && !ctx.signal.aborted && !completed,
      delay(ms, signal = controller.signal) {
        return new Promise<void>((resolve, reject) => {
          let remaining = Math.max(0, ms);
          let previous = Date.now();
          let timer: ReturnType<typeof setTimeout>;
          const signals = [...new Set([signal, controller.signal, ctx.signal])];
          const cleanup = () => {
            clearTimeout(timer);
            signals.forEach((item) => item.removeEventListener('abort', abort));
          };
          const abort = () => { cleanup(); reject(abortError()); };
          const tick = () => {
            if (signals.some((item) => item.aborted) || completed) return abort();
            const now = Date.now();
            if (!s.paused) remaining -= now - previous;
            previous = now;
            if (remaining <= 0 && !s.paused) { cleanup(); resolve(); }
            else timer = setTimeout(tick, s.paused ? 50 : Math.min(50, Math.max(1, remaining)));
          };
          signals.forEach((item) => item.addEventListener('abort', abort, { once: true }));
          tick();
        });
      },
      async speak(speech, signal = controller.signal) {
        if (!speech) return;
        await s.delay(0, signal);
        await new Promise<void>((resolve, reject) => {
          const signals = [...new Set([signal, controller.signal, ctx.signal])];
          const cleanup = () => signals.forEach((item) => item.removeEventListener('abort', abort));
          const abort = () => { cleanup(); ctx.stopSpeaking(); reject(abortError()); };
          signals.forEach((item) => item.addEventListener('abort', abort, { once: true }));
          if (signals.some((item) => item.aborted)) return abort();
          Promise.resolve(ctx.speak(speech)).then(
            () => { cleanup(); resolve(); },
            (error: unknown) => { cleanup(); reject(error); },
          );
        });
        await s.delay(0, signal);
      },
      sfx(name) { if (s.active() && !s.paused) ctx.sfx(name); },
      complete(result = {}) {
        if (!s.active()) return;
        completed = true;
        ctx.stopSpeaking();
        ctx.log('activity:complete', { ...result.data });
        ctx.complete(result);
        controller.abort();
      },
      run(task) {
        if (!s.active()) return;
        void task().catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError') && s.active()) {
            ctx.log('activity:error', { message: error instanceof Error ? error.message : String(error) });
          }
        });
      },
    };
    return { s, controller };
  }, [ctx]);
  session.s.paused = paused;
  useEffect(() => {
    const abort = () => { session.controller.abort(); ctx.stopSpeaking(); };
    ctx.signal.addEventListener('abort', abort, { once: true });
    if (ctx.signal.aborted) abort();
    return () => {
      ctx.signal.removeEventListener('abort', abort);
      abort();
      ctx.setParentHint(null);
    };
  }, [ctx, session]);
  useEffect(() => { if (paused) ctx.stopSpeaking(); }, [ctx, paused]);
  return session.s;
}

export function useTask(
  s: ActivitySession,
  task: (signal: AbortSignal) => Promise<void>,
  deps: DependencyList,
) {
  useEffect(() => {
    const controller = new AbortController();
    s.run(() => task(controller.signal));
    return () => controller.abort();
  }, [s, ...deps]);
}

export function useInputMode(ctx: ActivityContext<any>) {
  const [mode, setMode] = useState(ctx.input.mode);
  useEffect(() => ctx.input.onChange(setMode), [ctx]);
  return mode;
}

export function useNav(ctx: ActivityContext<any>, handler: (key: NavKey) => boolean) {
  const paused = useActivityPaused();
  useActivityKeys((key) => key === 'back' ? false : ctx.signal.aborted || paused ? true : handler(key));
  useLayoutEffect(() => { if (!ctx.signal.aborted) ctx.focus.refresh(); });
}

export function Stage({ ctx, children, className = '' }: {
  ctx: ActivityContext<any>; children: ReactNode; className?: string;
}) {
  const paused = useActivityPaused();
  useInputMode(ctx);
  return <section
    className={`spa-stage ${className}`}
    data-reduced-motion={ctx.reducedMotion || undefined}
    data-paused={paused || undefined}
    aria-label={ctx.locale.pick(ctx.lesson.title).primary}
  >{children}</section>;
}

export function Text({ ctx, text, className = '' }: {
  ctx: ActivityContext<any>; text: LText | Speech; className?: string;
}) {
  const value = ctx.locale.pick(text);
  return <span className={`spa-text ${className}`}>
    <span>{value.primary}</span>
    {value.secondary && <small>{value.secondary}</small>}
  </span>;
}

export function InputHint({ ctx, text }: { ctx: ActivityContext<any>; text?: string }) {
  const mode = useInputMode(ctx);
  const english = ctx.locale.mode === 'en' || ctx.locale.mode === 'en-zh';
  return <p className="spa-input-hint">
    {mode === 'dpad' ? (english ? 'Press OK' : '按 OK') : (english ? 'Tap' : '点一点')}
    {text && ` · ${text}`}
  </p>;
}

export function Action({ ctx, onClick, children, className = '', disabled = false, label }: {
  ctx: ActivityContext<any>; onClick(): void; children: ReactNode;
  className?: string; disabled?: boolean; label?: string;
}) {
  const paused = useActivityPaused();
  return <button type="button" data-focusable className={`spa-action ${className}`}
    disabled={disabled || paused || ctx.signal.aborted} aria-label={label} title={label}
    onClick={() => { if (!paused && !ctx.signal.aborted && !disabled) onClick(); }}>
    {children}
  </button>;
}

export function ConceptImage({ ctx, concept, image, className = '', style, alt }: {
  ctx: ActivityContext<any>; concept?: ConceptRef; image?: string;
  className?: string; style?: CSSProperties; alt?: string;
}) {
  const view = concept ? ctx.concept(concept) : undefined;
  const src = image ? ctx.resolveAsset(image) : view?.imageUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const label = alt ?? (view ? ctx.locale.pick(view).primary : typeof concept === 'object' ? concept.zh : '');
  return src && !failed
    ? <img className={`spa-image ${className}`} src={src} alt={label} style={style} draggable={false} onError={() => setFailed(true)} />
    : <span role="img" aria-label={label || '圆点'} className={`spa-image spa-image-fallback ${className}`} style={style}>
      {label ? <span>{label}</span> : <span className="spa-dot" />}
    </span>;
}

export function conceptSpeech(ctx: ActivityContext<any>, ref?: ConceptRef): Speech | undefined {
  const view = ref && ctx.concept(ref);
  return view ? { zh: view.zh, en: view.en } : speechForConcept(ref);
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return {
    busy,
    async perform(s: ActivitySession, task: () => Promise<void>) {
      if (lock.current || !s.active() || s.paused) return;
      lock.current = true;
      setBusy(true);
      try { await task(); }
      finally { lock.current = false; if (s.active()) setBusy(false); }
    },
  };
}

export function quantitySpeeches(ref: ConceptRef, count: number): Speech[] {
  return [
    ...Array.from({ length: count }, (_, i) => countSpeech(i + 1)),
    ...(typeof ref === 'object' ? [cardinalitySpeech(count, ref)] : []),
  ];
}
