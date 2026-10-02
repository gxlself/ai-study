import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Puzzle } from 'lucide-react';
import { pickText, type ChildProfile, type Lesson } from '@sprout/schema';
import type { ActivityContext, ActivityInstance, ActivityResult } from '../../../../packages/plugin-sdk/src/types';
import { SDK_VERSION } from '../../../../packages/plugin-sdk/src/types';
import { ActivityRegistry, type ActivityResources } from '../host';
import { useApp } from '../state/AppContext';

interface Props {
  lesson: Lesson;
  index: number;
  child: Pick<ChildProfile, 'name' | 'languageMode' | 'showPinyin'> & { ageMonths: number };
  resources: ActivityResources;
  registry: ActivityRegistry;
  paused: boolean;
  onComplete(result?: ActivityResult): void;
  onLog(type: string, data?: Record<string, unknown>): void;
  onHint(hint: string | null): void;
}

export function ActivityStage(props: Props) {
  const app = useApp();
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<ActivityInstance | null>(null);
  const deferredComplete = useRef<{ result?: ActivityResult } | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [failure, setFailure] = useState('');
  const step = props.lesson.steps[props.index];
  const plugin = props.registry.get(step.type);

  useLayoutEffect(() => {
    if (!element.current) return;
    return app.navigation.pushScope(element.current, {
      onKey: (key) => key !== 'back' && !latest.current.paused ? instance.current?.onKey?.(key) ?? false : false,
    });
  }, [app.navigation]);

  useEffect(() => {
    const el = element.current;
    if (!el || !plugin) return;
    let completed = false;
    deferredComplete.current = null;
    const controller = new AbortController();
    setFailure('');
    const context: ActivityContext = {
      props: step.props,
      sdkVersion: SDK_VERSION,
      lesson: { id: props.lesson.id, title: props.lesson.title, stepIndex: props.index, stepCount: props.lesson.steps.length },
      child: { name: props.child.name, ageMonths: props.child.ageMonths },
      locale: {
        mode: props.child.languageMode,
        showPinyin: props.child.showPinyin,
        pick: (text) => pickText({ zh: text.zh || text.en || '', en: text.en || undefined }, props.child.languageMode),
      },
      reducedMotion: app.reducedMotion,
      input: app.navigation.input,
      ...props.resources,
      speak: (text, options) => controller.signal.aborted ? Promise.resolve() : app.speech.speak(text, props.child.languageMode, options),
      say: (lang, text) => controller.signal.aborted ? Promise.resolve() : app.speech.say(lang, text),
      playAudio: (url) => controller.signal.aborted ? Promise.resolve() : app.speech.playAudio(props.resources.resolveAsset(url)),
      stopSpeaking: () => app.speech.stopSpeaking(),
      sfx: (name) => { if (!controller.signal.aborted && !latest.current.paused) app.speech.sfx(name); },
      audioContext: () => app.speech.audioContext(),
      complete: (result) => {
        if (completed || controller.signal.aborted) return;
        completed = true; app.speech.stopSpeaking();
        if (latest.current.paused) deferredComplete.current = { result };
        else latest.current.onComplete(result);
      },
      log: (type, data) => { if (!controller.signal.aborted) latest.current.onLog(type, data); },
      setParentHint: (hint) => { if (!controller.signal.aborted) latest.current.onHint(hint); },
      focus: { refresh: () => app.navigation.refresh(), focus: (target) => app.navigation.focus(target), current: () => app.navigation.current() },
      signal: controller.signal,
    };
    try {
      void Promise.resolve(plugin.mount(el, context)).then((mounted) => {
        if (controller.signal.aborted) { mounted.unmount(); return; }
        instance.current = mounted;
        if (latest.current.paused) mounted.pause?.();
        app.navigation.refresh();
      }).catch(() => { if (!controller.signal.aborted) setFailure('这个活动暂时没有准备好'); });
    } catch { setFailure('这个活动暂时没有准备好'); }
    return () => {
      controller.abort();
      app.speech.stopSpeaking();
      const mounted = instance.current;
      instance.current = null;
      // 插件可能持有独立 React root，等当前 root 提交完成再释放它。
      queueMicrotask(() => mounted?.unmount());
    };
  }, [plugin, step, props.lesson, props.index, props.resources, props.child, app.navigation, app.speech, app.reducedMotion]);
  useEffect(() => {
    if (props.paused) { instance.current?.pause?.(); app.speech.pause(); }
    else {
      app.speech.resume(); instance.current?.resume?.();
      if (deferredComplete.current) {
        const { result } = deferredComplete.current;
        deferredComplete.current = null;
        latest.current.onComplete(result);
      }
    }
  }, [props.paused, app.speech]);

  return <div className="activity-stage" ref={element} aria-label={step.title?.zh ?? props.lesson.title.zh} aria-busy={props.paused}>
    {(!plugin || failure) && <div className="missing-activity"><Puzzle /><h2>{failure || `需要安装插件 ${step.type}`}</h2><button data-focusable className="primary" disabled={props.paused} onClick={() => props.onComplete({ data: { skipped: true, type: step.type } })}>跳过</button></div>}
  </div>;
}
