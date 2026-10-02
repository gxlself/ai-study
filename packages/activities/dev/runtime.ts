import type { ActivityInstance, ActivityPlugin, ActivityResult, NavKey } from '@sprout/plugin-sdk';
import { createPreviewContext, type PreviewOptions } from './context';
import { createStageFocus, dispatchNavigation } from './navigation';

export type PreviewStatus = 'loading' | 'running' | 'paused' | 'complete' | 'error' | 'stopped';
export interface PreviewEvents extends Omit<PreviewOptions, 'signal' | 'focus' | 'complete'> {
  complete(result?: ActivityResult): void;
  status(value: PreviewStatus): void;
  error(message: string): void;
}

export function mountPreview<P>(
  plugin: ActivityPlugin<P>,
  stage: HTMLElement,
  props: P,
  events: PreviewEvents,
) {
  // 独立容器让旧异步 mount 即使晚返回，也无法覆盖下一实例的 DOM。
  const container = document.createElement('div');
  container.className = 'pg-activity';
  stage.append(container);
  const controller = new AbortController();
  const focus = createStageFocus(container);
  let instance: ActivityInstance | undefined;
  let disposed = false;
  let ended = false;
  let paused = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const released = new WeakSet<ActivityInstance>();
  function clearIdle() {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  function armIdle() {
    clearIdle();
    // guide 的暗屏倒计时用于屏幕外陪玩，没有背景媒体。
    if (!instance || disposed || ended || paused || plugin.type === 'guide') return;
    idleTimer = setTimeout(() => setPaused(true, 'idle'), 90_000);
  }
  function setPaused(next: boolean, reason = 'manual') {
    if (!instance || disposed || ended || paused === next) return;
    paused = next;
    container.inert = paused;
    clearIdle();
    if (paused) { instance.pause?.(); context.pauseAudio(); }
    else { instance.resume?.(); context.resumeAudio(); armIdle(); }
    log(paused ? 'preview:paused' : 'preview:resumed', { reason });
    events.status(paused ? 'paused' : 'running');
  }
  const visibility = () => {
    if (document.hidden) setPaused(true, 'background');
  };
  container.addEventListener('pointerdown', armIdle);
  document.addEventListener('visibilitychange', visibility);
  controller.signal.addEventListener('abort', () => {
    clearIdle();
    container.removeEventListener('pointerdown', armIdle);
    document.removeEventListener('visibilitychange', visibility);
  }, { once: true });
  const log: PreviewOptions['log'] = (type, data) => { if (!disposed) events.log(type, data); };
  const context = createPreviewContext(props, {
    ...events,
    signal: controller.signal,
    focus,
    log,
    setParentHint: (text) => { if (!disposed && !ended) events.setParentHint(text); },
    complete(result) {
      if (disposed || ended) return;
      ended = true;
      events.complete(result);
      events.status('complete');
      events.setParentHint(null);
      controller.abort();
      context.closeAudio();
      if (instance) release(instance);
    },
  });
  function release(value: ActivityInstance) {
    if (released.has(value)) return;
    released.add(value);
    // 避开父 React root 提交阶段同步卸载另一个 root。
    queueMicrotask(() => {
      try { value.unmount(); }
      catch (error) { log('unmount:error', { message: String(error) }); }
    });
  }
  function fail(error: unknown) {
    if (disposed || ended) return;
    ended = true;
    const message = error instanceof Error ? error.message : String(error);
    log('preview:error', { message });
    events.error(message);
    events.status('error');
    events.setParentHint(null);
    controller.abort();
    context.closeAudio();
    if (instance) release(instance);
  }
  events.status('loading');
  const ready = Promise.resolve().then(async () => {
    if (disposed) return;
    const value = await plugin.mount(container, context.ctx);
    if (disposed || ended) { release(value); return; }
    instance = value;
    focus.refresh();
    log('preview:mounted', { type: plugin.type });
    events.status('running');
    armIdle();
    visibility();
  }).catch(fail);

  return {
    ready,
    fail,
    unlockAudio: () => context.unlockAudio(),
    dispatch(key: NavKey) {
      if (!instance || disposed || ended || paused) return;
      armIdle();
      context.unlockAudio();
      try {
        const handled = dispatchNavigation(instance, focus, key);
        log(key === 'back' ? 'host:back' : 'input:key', { key, handled });
      } catch (error) { fail(error); }
    },
    togglePause() {
      if (!instance || disposed || ended) return;
      try {
        setPaused(!paused);
      } catch (error) { fail(error); }
    },
    stop() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      context.closeAudio();
      focus.clear();
      container.remove();
      if (instance) release(instance);
    },
  };
}
