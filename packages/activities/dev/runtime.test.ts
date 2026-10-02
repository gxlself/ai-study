import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityContext, ActivityInstance, ActivityPlugin } from '@sprout/plugin-sdk';
import { mountPreview, type PreviewEvents } from './runtime';
import { createPreviewContext } from './context';
import { createStageFocus } from './navigation';

function events(): PreviewEvents {
  return {
    inputMode: 'dpad', languageMode: 'zh-en', reducedMotion: true,
    log: vi.fn(), complete: vi.fn(), setParentHint: vi.fn(), status: vi.fn(), error: vi.fn(),
  };
}
const previews: ReturnType<typeof mountPreview>[] = [];
function setup(mount: ActivityPlugin<Record<string, unknown>>['mount']) {
  const stage = document.createElement('main');
  document.body.append(stage);
  const callbacks = events();
  const plugin: ActivityPlugin<Record<string, unknown>> = {
    type: 'example.test', version: '1.0.0', name: { zh: '测试' }, mount,
  };
  const runtime = mountPreview(plugin, stage, {}, callbacks);
  previews.push(runtime);
  return { stage, callbacks, runtime };
}
afterEach(() => {
  previews.splice(0).forEach((preview) => preview.stop());
  document.body.replaceChildren();
  if (vi.isFakeTimers()) vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('独立实例生命周期', () => {
  it('媒体无人操作90秒自动暂停，暂停冻结，明确恢复后重新计时', async () => {
    vi.useFakeTimers();
    const pause = vi.fn();
    const resume = vi.fn();
    const { runtime, callbacks } = setup(() => ({ unmount: vi.fn(), pause, resume }));
    await runtime.ready;
    await vi.advanceTimersByTimeAsync(89_000);
    expect(pause).not.toHaveBeenCalled();
    runtime.dispatch('ok');
    await vi.advanceTimersByTimeAsync(89_000);
    expect(pause).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(pause).toHaveBeenCalledOnce();
    expect(callbacks.log).toHaveBeenCalledWith('preview:paused', { reason: 'idle' });
    runtime.togglePause();
    expect(resume).toHaveBeenCalledOnce();
    runtime.stop();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('异步 mount 晚到时卸载旧实例，不覆盖新容器或报告运行', async () => {
    let settle!: (value: ActivityInstance) => void;
    let oldContainer!: HTMLElement;
    const old = setup((container) => {
      oldContainer = container;
      return new Promise((resolve) => { settle = resolve; });
    });
    await Promise.resolve();
    old.runtime.stop();
    const replacement = document.createElement('div');
    replacement.textContent = 'new activity';
    old.stage.append(replacement);
    const unmount = vi.fn(() => oldContainer.replaceChildren());
    settle({ unmount });
    await old.runtime.ready;
    await Promise.resolve();
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(old.stage.textContent).toBe('new activity');
    expect(old.callbacks.status).not.toHaveBeenCalledWith('running');
  });

  it('未开始即停止时不会进入 mount', async () => {
    const mount = vi.fn(() => ({ unmount: vi.fn() }));
    const { runtime, stage } = setup(mount);
    runtime.stop();
    await runtime.ready;
    expect(mount).not.toHaveBeenCalled();
    expect(stage.childElementCount).toBe(0);
  });

  it('同步完成只回报一次，中止上下文并释放返回的实例', async () => {
    const unmount = vi.fn();
    let signal!: AbortSignal;
    const { runtime, callbacks } = setup((_container, ctx) => {
      signal = ctx.signal;
      ctx.complete({ data: { count: 1 } });
      ctx.complete({ data: { count: 2 } });
      return { unmount };
    });
    await runtime.ready;
    await Promise.resolve();
    expect(callbacks.complete).toHaveBeenCalledTimes(1);
    expect(callbacks.status).toHaveBeenCalledWith('complete');
    expect(signal.aborted).toBe(true);
    expect(unmount).toHaveBeenCalledTimes(1);
    runtime.stop();
  });

  it('暂停期间不派发输入，恢复再处理，停止幂等且取消 signal', async () => {
    const onKey = vi.fn(() => true);
    const pause = vi.fn();
    const resume = vi.fn();
    const unmount = vi.fn();
    let context!: ActivityContext;
    const { runtime, stage, callbacks } = setup((_container, ctx) => {
      context = ctx;
      return { onKey, pause, resume, unmount };
    });
    await runtime.ready;
    runtime.togglePause();
    runtime.dispatch('ok');
    expect(onKey).not.toHaveBeenCalled();
    expect(stage.firstElementChild?.hasAttribute('inert') || (stage.firstElementChild as HTMLElement).inert).toBeTruthy();
    runtime.togglePause();
    runtime.dispatch('ok');
    expect(onKey).toHaveBeenCalledWith('ok');
    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    runtime.stop();
    runtime.stop();
    await Promise.resolve();
    context.complete();
    expect(context.signal.aborted).toBe(true);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(callbacks.complete).not.toHaveBeenCalled();
  });

  it('mount 失败产生明确错误状态而非空白', async () => {
    const { runtime, callbacks } = setup(async () => { throw new Error('mount failed'); });
    await runtime.ready;
    expect(callbacks.error).toHaveBeenCalledWith('mount failed');
    expect(callbacks.status).toHaveBeenCalledWith('error');
    runtime.stop();
  });
});

describe('SDK 适配', () => {
  it('使用 concepts 数组、locale/input 局部配置并记录按语言展开的朗读', async () => {
    const callbacks = events();
    const controller = new AbortController();
    const preview = createPreviewContext({ count: 3 }, {
      ...callbacks, languageMode: 'en-zh', inputMode: 'touch',
      signal: controller.signal, focus: createStageFocus(document.createElement('div')),
    });
    expect(preview.ctx.concept('apple')?.zh).toBe('苹果');
    expect(preview.ctx.locale.mode).toBe('en-zh');
    expect(preview.ctx.input.mode).toBe('touch');
    expect(preview.ctx.reducedMotion).toBe(true);
    await preview.ctx.speak({ zh: '你好', en: 'Hello' });
    expect(callbacks.log).toHaveBeenCalledWith('speech', {
      parts: [{ lang: 'en', text: 'Hello' }, { lang: 'zh', text: '你好' }],
    });
    controller.abort();
    await expect(preview.ctx.speak({ zh: '不会再读' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(callbacks.log).toHaveBeenCalledTimes(1);
    preview.closeAudio();
  });

  it('音频只在实际需要时创建，暂停挂起、恢复唤醒、退出只关闭一次', async () => {
    const audio = {
      state: 'suspended',
      resume: vi.fn(async () => { audio.state = 'running'; }),
      suspend: vi.fn(async () => { audio.state = 'suspended'; }),
      close: vi.fn(async () => { audio.state = 'closed'; }),
    };
    const constructor = vi.fn(function () { return audio; });
    vi.stubGlobal('AudioContext', constructor);
    const preview = createPreviewContext({}, {
      ...events(), signal: new AbortController().signal,
      focus: createStageFocus(document.createElement('div')),
    });
    expect(constructor).not.toHaveBeenCalled();
    preview.ctx.audioContext();
    preview.unlockAudio();
    expect(audio.resume).toHaveBeenCalledTimes(1);
    preview.pauseAudio();
    expect(audio.suspend).toHaveBeenCalledTimes(1);
    preview.resumeAudio();
    expect(audio.resume).toHaveBeenCalledTimes(2);
    preview.closeAudio();
    preview.closeAudio();
    expect(audio.close).toHaveBeenCalledTimes(1);
  });
});
