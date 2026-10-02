import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityContext, ActivityInstance, ActivityPlugin } from '../../../../packages/plugin-sdk/src/types';
import type { Lesson } from '@sprout/schema';
import { ActivityStage } from './ActivityStage';

const state = vi.hoisted(() => ({
  navigation: { pushScope: vi.fn(() => vi.fn()), refresh: vi.fn(), focus: vi.fn(), current: vi.fn(() => null), input: { mode: 'dpad', onChange: vi.fn(() => vi.fn()) } },
  speech: { speak: vi.fn(async () => {}), say: vi.fn(async () => {}), playAudio: vi.fn(async () => {}), stopSpeaking: vi.fn(), sfx: vi.fn(), audioContext: vi.fn(), pause: vi.fn(), resume: vi.fn() },
  reducedMotion: false,
}));
vi.mock('../state/AppContext', () => ({ useApp: () => state }));

const lesson = {
  id: 'test.lesson', title: { zh: '测试' }, steps: [{ type: 'test.activity', props: {} }],
} as Lesson;
const child = { name: '芽芽', ageMonths: 24, languageMode: 'zh-en' as const, showPinyin: false };
const resources = { resolveAsset: (path: string) => path, concept: () => undefined };

describe('宿主生命周期', () => {
  let root: Root;
  let element: HTMLDivElement;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    element = document.createElement('div');
    document.body.append(element);
    root = createRoot(element);
    vi.clearAllMocks();
  });
  afterEach(async () => { await act(async () => root.unmount()); element.remove(); });

  function props(plugin: ActivityPlugin) {
    return {
      lesson, index: 0, child, resources,
      registry: { get: () => plugin } as unknown as import('../host').ActivityRegistry,
      paused: false, onComplete: vi.fn(), onLog: vi.fn(), onHint: vi.fn(),
    };
  }
  it('同一步多次 complete 只生效一次，卸载中止 signal', async () => {
    let ctx!: ActivityContext;
    const instance: ActivityInstance = { unmount: vi.fn() };
    const plugin: ActivityPlugin = { type: 'test.activity', version: '1', name: { zh: '测试' }, mount: vi.fn((_el, context) => { ctx = context; return instance; }) };
    const value = props(plugin);
    await act(async () => root.render(<ActivityStage {...value} />));
    await act(async () => { ctx.complete(); ctx.complete(); });
    expect(value.onComplete).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(ctx.signal.aborted).toBe(true);
    expect(instance.unmount).toHaveBeenCalledOnce();
    root = createRoot(element);
  });
  it('隐藏或遮罩暂停期间完成结果延期到恢复，不能丢掉活动结束', async () => {
    let ctx!: ActivityContext;
    const instance: ActivityInstance = { unmount: vi.fn(), pause: vi.fn(), resume: vi.fn() };
    const plugin: ActivityPlugin = { type: 'test.activity', version: '1', name: { zh: '测试' }, mount: (_el, context) => { ctx = context; return instance; } };
    const value = props(plugin);
    await act(async () => root.render(<ActivityStage {...value} paused />));
    await act(async () => ctx.complete({ data: { observed: true } }));
    expect(value.onComplete).not.toHaveBeenCalled();
    await act(async () => root.render(<ActivityStage {...value} paused={false} />));
    expect(value.onComplete).toHaveBeenCalledExactlyOnceWith({ data: { observed: true } });
    expect(instance.pause).toHaveBeenCalled();
  });
  it('异步 mount 退出后返回的实例立即卸载，不重新夺取焦点', async () => {
    let resolve!: (instance: ActivityInstance) => void;
    let ctx!: ActivityContext;
    const plugin: ActivityPlugin = {
      type: 'test.activity', version: '1', name: { zh: '测试' },
      mount: (_el, context) => { ctx = context; return new Promise((done) => { resolve = done; }); },
    };
    const value = props(plugin);
    await act(async () => root.render(<ActivityStage {...value} />));
    await act(async () => root.unmount());
    const refreshes = state.navigation.refresh.mock.calls.length;
    const instance: ActivityInstance = { unmount: vi.fn() };
    await act(async () => resolve(instance));
    expect(ctx.signal.aborted).toBe(true);
    expect(instance.unmount).toHaveBeenCalledOnce();
    expect(state.navigation.refresh.mock.calls.length).toBe(refreshes);
    root = createRoot(element);
  });
});
