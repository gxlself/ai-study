// @vitest-environment node
import { createRequire } from 'node:module';
import * as React from 'react';
import { act } from 'react';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  chooseOptions,
  createMockContext,
  defineActivity,
  defineReactActivity,
  SDK_VERSION,
  shuffle,
  useActivityKeys,
  useActivityPaused,
  wait,
  type ActivityContext,
  type ActivityInstance,
  type ActivityPlugin,
  type ConceptView,
  type NavKey,
} from './index';
import type { ChooseOption, LanguageMode } from '@sprout/schema';

const tools = createRequire(new URL('../../activities/package.json', import.meta.url));
const { JSDOM } = tools('jsdom') as {
  JSDOM: new (html?: string, options?: Record<string, unknown>) => {
    window: Window & typeof globalThis;
  };
};
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});

function installDomGlobals(): void {
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    EventTarget: dom.window.EventTarget,
    DOMException: dom.window.DOMException,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  };
  for (const [name, value] of Object.entries(globals)) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
}

installDomGlobals();
const ReactDOMClient = await import('react-dom/client');

type ProbeProps = { id: string };

function Probe({ ctx }: { ctx: ActivityContext<ProbeProps> }) {
  const [count, setCount] = React.useState(0);
  const [inputMode, setInputMode] = React.useState(ctx.input.mode);
  const paused = useActivityPaused();

  React.useEffect(() => (
    ctx.input.onChange((mode) => setInputMode(mode))
  ), [ctx]);

  useActivityKeys((key) => {
    if (key !== 'ok') return false;
    ctx.log('key', { id: ctx.props.id, count, inputMode });
    setCount((current) => current + 1);
    return true;
  });

  return React.createElement(
    'button',
    {
      'data-probe': ctx.props.id,
      'data-focusable': '',
      'data-paused': paused ? 'true' : 'false',
      onClick: () => setCount((current) => current + 1),
    },
    `${ctx.props.id}:${count}:${inputMode}`,
  );
}

const explicitReactPlugin = defineReactActivity<ProbeProps>({
  type: 'test.react-probe',
  version: '1.0.0',
  name: { zh: '测试活动', en: 'Test activity' },
  React,
  ReactDOMClient,
  Component: Probe,
});

const mounted: Array<{ instance: ActivityInstance; stage: HTMLElement }> = [];

function mountNow<P>(
  plugin: ActivityPlugin<P>,
  ctx: ActivityContext<P>,
  stage = document.createElement('section'),
) {
  if (!stage.isConnected) document.body.append(stage);
  const instance = plugin.mount(stage, ctx);
  if (instance instanceof Promise) {
    throw new Error('此测试仅挂载同步的 React 适配器。');
  }
  mounted.push({ instance, stage });
  return { instance, stage };
}

async function mountProbe<P>(
  plugin: ActivityPlugin<P>,
  ctx: ActivityContext<P>,
  stage?: HTMLElement,
) {
  let result!: ReturnType<typeof mountNow<P>>;
  await act(async () => {
    result = mountNow(plugin, ctx, stage);
  });
  return result;
}

async function press(instance: ActivityInstance, key: NavKey) {
  let handled = false;
  await act(async () => {
    handled = instance.onKey?.(key) ?? false;
  });
  return handled;
}

beforeEach(() => {
  vi.stubGlobal('SproutHost', undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => {
    for (const { instance } of mounted.splice(0)) instance.unmount();
    await Promise.resolve();
  });
  document.body.replaceChildren();
  if (vi.isFakeTimers()) vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('纯函数工具', () => {
  it('defineActivity 保留插件对象及其回调的 identity，不调用或修改它', () => {
    const mount = vi.fn(() => ({ unmount() {} }));
    const preload = vi.fn(() => ['apple.svg']);
    const plugin = Object.freeze({
      type: 'example.identity',
      version: '1.0.0',
      name: { zh: '原样插件' },
      mount,
      preload,
    } satisfies ActivityPlugin);

    expect(defineActivity(plugin)).toBe(plugin);
    expect(defineActivity(plugin).mount).toBe(mount);
    expect(defineActivity(plugin).preload).toBe(preload);
    expect(mount).not.toHaveBeenCalled();
    expect(preload).not.toHaveBeenCalled();
  });

  it.each([0, -7, 42, 'sprout-seed', ''])('shuffle seed=%j 确定且保留所有元素，不修改只读输入', (seed) => {
    const input = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    const random = vi.spyOn(Math, 'random');
    const first = shuffle(input, seed);
    expect(first).toEqual(shuffle(input, seed));
    expect(first).not.toBe(input);
    expect([...first].sort()).toEqual(input);
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    expect(random).not.toHaveBeenCalled();
  });

  it('shuffle 使用 seed，并保持对象引用、重复元素及空/单元素边界', () => {
    const input = Array.from({ length: 12 }, (_, id) => ({ id }));
    expect(shuffle(input, 1)).not.toEqual(shuffle(input, 2));
    const objects = shuffle(input, 'objects');
    expect(new Set(objects)).toEqual(new Set(input));
    expect(objects.every((item) => input.includes(item))).toBe(true);
    expect(shuffle(['a', 'a', 'b'], 42).sort()).toEqual(['a', 'a', 'b']);
    expect(shuffle([], 42)).toEqual([]);
    expect(shuffle([input[0]], 42)).toEqual([input[0]]);
  });

  it('chooseOptions 保留完整 props，复制对象，不修改只读输入', () => {
    const original: ChooseOption = Object.freeze({
      id: 'ball',
      concept: 'ball',
      image: 'ball.svg',
      label: { zh: '皮球', en: 'ball' },
      count: 2,
      scale: 0.8,
      tint: '#abc',
    });
    const input = Object.freeze(['apple', original]);
    const result = chooseOptions(input);

    expect(result).toEqual([{ id: 'apple', concept: 'apple' }, original]);
    expect(result).not.toBe(input);
    expect(result[1]).not.toBe(original);
    result[1].id = 'changed';
    expect(original.id).toBe('ball');
    expect(input[0]).toBe('apple');
    expect(chooseOptions([])).toEqual([]);
    const duplicates = chooseOptions(['apple', 'apple']);
    expect(duplicates[0]).toEqual(duplicates[1]);
    expect(duplicates[0]).not.toBe(duplicates[1]);
  });
});

describe('wait', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  it('到达指定时长才 resolve，并移除注册的 abort 监听器', async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const settled = vi.fn();
    const pending = wait(250, controller.signal);
    void pending.then(settled);
    expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    await vi.advanceTimersByTimeAsync(249);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
    expect(settled).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('等待中止 reject AbortError，同时清除计时器和监听器', async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = wait(1_000, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await rejected;
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(remove).toHaveBeenCalledOnce();
  });

  it('signal 预先中止时不注册监听器、不创建计时器', async () => {
    const controller = new AbortController();
    controller.abort();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    await expect(wait(100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('没有 signal 时也可等待，并把负时长规范化为异步零延时', async () => {
    const pending = wait(-20);
    const settled = vi.fn();
    void pending.then(settled);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    expect(settled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('createMockContext', () => {
  it('保留 props identity，提供默认上下文并深层补全部分 overrides', () => {
    const props = { id: 'mock' };
    const defaults = createMockContext(props);
    const ctx = createMockContext(props, {
      lesson: { id: 'test.lesson', stepIndex: 1, stepCount: 3 },
      child: { name: '小芽' },
      locale: { showPinyin: true },
      input: { mode: 'touch' },
      reducedMotion: true,
    });

    expect(defaults.props).toBe(props);
    expect(defaults.sdkVersion).toBe(SDK_VERSION);
    expect(defaults.locale.mode).toBe('zh-en');
    expect(defaults.input.mode).toBe('dpad');
    expect(defaults.signal.aborted).toBe(false);
    expect(defaults.resolveAsset('image.svg')).toBe('image.svg');
    expect(ctx.lesson).toEqual({
      ...defaults.lesson, id: 'test.lesson', stepIndex: 1, stepCount: 3,
    });
    expect(ctx.child).toEqual({ ...defaults.child, name: '小芽' });
    expect(ctx.locale.showPinyin).toBe(true);
    expect(ctx.input.mode).toBe('touch');
    expect(ctx.reducedMotion).toBe(true);
  });

  it('按数组 id 和 record 别名解析词库，setConcepts 替换而非累积旧索引', () => {
    const apple: ConceptView = { id: 'apple', zh: '苹果', en: 'apple', imageUrl: '/apple.svg' };
    const ball: ConceptView = { id: 'ball', zh: '皮球', en: 'ball', imageUrl: '/ball.svg' };
    const ctx = createMockContext({}, { concepts: [apple] });
    expect(ctx.concept('apple')).toBe(apple);
    expect(ctx.concept('missing')).toBeUndefined();
    ctx.mock.setConcepts({ toy: ball });
    expect(ctx.concept('apple')).toBeUndefined();
    expect(ctx.concept('toy')).toBe(ball);
    expect(ctx.concept('ball')).toBe(ball);
    ctx.mock.setConcepts([apple]);
    expect(ctx.concept('toy')).toBeUndefined();
    expect(ctx.concept('ball')).toBeUndefined();
    expect(ctx.concept('apple')).toBe(apple);
    expect(createMockContext({}, { concepts: { fruit: apple } }).concept('fruit')).toBe(apple);
  });

  it('内联概念保留双语/短句字段并解析图片，缺省 id 和英文有后备值', () => {
    const ctx = createMockContext({}, { resolveAsset: (path) => `/packs/test/${path}` });
    const ref = {
      id: 'inline', zh: '皮球', en: 'ball', pinyin: 'pí qiú', image: 'ball.svg',
      sound: { zh: '咚', en: 'bounce' },
      phrase: { zh: '皮球滚一滚', en: 'Roll the ball.' },
    };
    expect(ctx.concept(ref)).toEqual({
      id: 'inline', category: 'other', zh: ref.zh, en: ref.en, pinyin: ref.pinyin,
      imageUrl: '/packs/test/ball.svg', sound: ref.sound, phrase: ref.phrase,
    });
    expect(ctx.concept({ zh: '家人', image: 'family.svg' })).toMatchObject({
      id: 'inline:家人', en: '家人', imageUrl: '/packs/test/family.svg',
    });
    const custom = vi.fn(() => ctx.concept(ref));
    const overridden = createMockContext({}, { concept: custom });
    expect(overridden.concept('special')).toEqual(ctx.concept(ref));
    expect(custom).toHaveBeenCalledWith('special');
  });

  it.each(['zh', 'zh-en', 'en-zh', 'en'] as LanguageMode[])('语言模式 %s 选择正确的主/副文本', (mode) => {
    const expected = {
      zh: { primary: '苹果', secondary: undefined },
      'zh-en': { primary: '苹果', secondary: 'apple' },
      'en-zh': { primary: 'apple', secondary: '苹果' },
      en: { primary: 'apple', secondary: undefined },
    };
    const ctx = createMockContext({}, { locale: { mode } });
    expect(ctx.locale.pick({ zh: '苹果', en: 'apple' })).toEqual(expected[mode]);
    expect(ctx.locale.pick({ zh: '苹果' })).toEqual({ primary: '苹果', secondary: undefined });
    expect(ctx.locale.pick({ en: 'apple' })).toEqual({ primary: 'apple', secondary: undefined });
  });

  it('支持自定义 locale.pick，默认 focus 跟踪实际 DOM 焦点', () => {
    const pick = vi.fn(() => ({ primary: 'custom' }));
    const ctx = createMockContext({}, { locale: { pick } });
    const text = { zh: '苹果', en: 'apple' };
    expect(ctx.locale.pick(text)).toEqual({ primary: 'custom' });
    expect(pick).toHaveBeenCalledWith(text);
    const button = document.createElement('button');
    document.body.append(button);
    expect(ctx.focus.current()).toBeNull();
    ctx.focus.refresh();
    ctx.focus.focus(button);
    expect(ctx.focus.current()).toBe(button);
    expect(document.activeElement).toBe(button);
    ctx.focus.focus(null);
    expect(ctx.focus.current()).toBeNull();
  });

  it('动态输入只通知真实变化，退订会转发给 override，实例之间不共享输入', () => {
    const externalUnsubscribe = vi.fn();
    const externalSubscribe = vi.fn(() => externalUnsubscribe);
    const inputListener = vi.fn();
    const ctx = createMockContext({}, { input: { onChange: externalSubscribe } });
    const other = createMockContext({}, { input: { mode: 'touch' } });
    const unsubscribe = ctx.input.onChange(inputListener);
    expect(externalSubscribe).toHaveBeenCalledWith(inputListener);
    ctx.mock.setInputMode('dpad');
    expect(inputListener).not.toHaveBeenCalled();
    ctx.mock.setInputMode('pointer');
    ctx.mock.setInputMode('pointer');
    expect(inputListener).toHaveBeenCalledWith('pointer');
    expect(ctx.input.mode).toBe('pointer');
    expect(ctx.mock.inputMode).toBe('pointer');
    expect(other.input.mode).toBe('touch');
    unsubscribe();
    expect(externalUnsubscribe).toHaveBeenCalledOnce();
    ctx.mock.setInputMode('touch');
    expect(inputListener).toHaveBeenCalledOnce();
  });

  it('默认声音方法仅记录/打印并 resolve，不访问真实音频设备', async () => {
    const ctx = createMockContext({});
    await ctx.speak({ zh: '看苹果' });
    await ctx.speak('苹果');
    await ctx.say('en', 'Apple');
    ctx.sfx('tap');
    await ctx.playAudio('/apple.mp3');
    expect(ctx.mock.speeches).toEqual([{ zh: '看苹果' }, '苹果']);
    expect(ctx.mock.sayings).toEqual([{ lang: 'en', text: 'Apple' }]);
    expect(ctx.mock.sfx).toEqual(['tap']);
    expect(ctx.mock.audio).toEqual(['/apple.mp3']);
    expect(console.log).toHaveBeenCalledWith('[sprout mock] speak', { zh: '看苹果' });
    expect(console.log).toHaveBeenCalledWith('[sprout mock] say', 'en', 'Apple');
    expect(console.log).toHaveBeenCalledWith('[sprout mock] audio', '/apple.mp3');
  });

  it('声音 overrides 保留 mock 记录、转发参数，并等待 override 完成', async () => {
    let finishSpeech!: () => void;
    const speak = vi.fn(() => new Promise<void>((resolve) => { finishSpeech = resolve; }));
    const say = vi.fn(async () => {});
    const playAudio = vi.fn(async () => {});
    const sfx = vi.fn();
    const ctx = createMockContext({}, { speak, say, playAudio, sfx });
    const speech = { zh: '看苹果', en: 'Look at the apple.' };
    const options = { mode: 'zh-en' as const, gapMs: 500, interrupt: false };
    const pending = ctx.speak(speech, options);
    const settled = vi.fn();
    void pending.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledWith(speech, options);
    finishSpeech();
    await pending;
    expect(settled).toHaveBeenCalledOnce();
    await ctx.say('en', 'Apple');
    await ctx.playAudio('/apple.mp3');
    ctx.sfx('chime');
    expect(say).toHaveBeenCalledWith('en', 'Apple');
    expect(playAudio).toHaveBeenCalledWith('/apple.mp3');
    expect(sfx).toHaveBeenCalledWith('chime');
    expect(ctx.mock.speeches).toEqual([speech]);
    expect(ctx.mock.sayings).toEqual([{ lang: 'en', text: 'Apple' }]);
    expect(ctx.mock.audio).toEqual(['/apple.mp3']);
    expect(ctx.mock.sfx).toEqual(['chime']);
  });

  it('complete 只生效一次，记录结果、日志和家长提示并转发 overrides', () => {
    const complete = vi.fn();
    const log = vi.fn();
    const setParentHint = vi.fn();
    const ctx = createMockContext({}, { complete, log, setParentHint });
    const result = { accuracy: 1, data: { selected: 'apple' } };
    ctx.setParentHint('找一找苹果');
    ctx.complete(result);
    ctx.complete({ accuracy: 0 });
    ctx.log('selected', { id: 'apple' });
    ctx.log('finished');
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(result);
    expect(ctx.mock.completions).toEqual([result]);
    expect(ctx.mock.logs).toEqual([
      { type: 'selected', data: { id: 'apple' } }, { type: 'finished', data: undefined },
    ]);
    expect(log).toHaveBeenCalledWith('selected', { id: 'apple' });
    expect(setParentHint).toHaveBeenCalledWith('找一找苹果');
    const withoutResult = createMockContext({});
    withoutResult.complete();
    withoutResult.complete();
    expect(withoutResult.mock.completions).toEqual([{}]);
  });

  it('mock.abort 幂等清理输入、声音和提示，拒绝新声音/音效/完成但不 abort 外部 signal', async () => {
    const external = new AbortController();
    const add = vi.spyOn(external.signal, 'addEventListener');
    const remove = vi.spyOn(external.signal, 'removeEventListener');
    const stopSpeaking = vi.fn();
    const ctx = createMockContext({}, { signal: external.signal, stopSpeaking });
    const changed = vi.fn();
    ctx.input.onChange(changed);
    ctx.setParentHint('陪宝宝找苹果');
    ctx.mock.abort();
    ctx.mock.abort();
    expect(ctx.signal.aborted).toBe(true);
    expect(external.signal.aborted).toBe(false);
    expect(stopSpeaking).toHaveBeenCalledOnce();
    expect(ctx.mock.parentHints.at(-1)).toBeNull();
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    ctx.mock.setInputMode('touch');
    expect(changed).not.toHaveBeenCalled();
    expect(ctx.input.mode).toBe('dpad');
    await expect(ctx.speak('停止')).rejects.toMatchObject({ name: 'AbortError' });
    await expect(ctx.say('en', 'Stop')).rejects.toMatchObject({ name: 'AbortError' });
    await expect(ctx.playAudio('/stop.mp3')).rejects.toMatchObject({ name: 'AbortError' });
    expect(() => ctx.audioContext()).toThrow();
    ctx.sfx('chime');
    ctx.complete();
    expect(ctx.mock.speeches).toEqual([]);
    expect(ctx.mock.sayings).toEqual([]);
    expect(ctx.mock.audio).toEqual([]);
    expect(ctx.mock.sfx).toEqual([]);
    expect(ctx.mock.completions).toEqual([]);
    external.abort();
    expect(stopSpeaking).toHaveBeenCalledOnce();
  });

  it.each([false, true])('外部 signal 中止（预先中止=%s）转发 reason 并清理上下文', (preAborted) => {
    const external = new AbortController();
    const reason = new Error('host stopped');
    if (preAborted) external.abort(reason);
    const ctx = createMockContext({}, { signal: external.signal });
    if (!preAborted) external.abort(reason);
    expect(ctx.signal).not.toBe(external.signal);
    expect(ctx.signal.aborted).toBe(true);
    expect(ctx.signal.reason).toBe(reason);
    expect(ctx.mock.stopSpeakingCount).toBe(1);
    expect(ctx.mock.parentHints).toEqual([null]);
    ctx.complete();
    expect(ctx.mock.completions).toEqual([]);
  });

  it('静默 AudioContext 按实例缓存，暂停冻结时钟，恢复/关闭正确派发 statechange', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(0);
    const ctx = createMockContext({});
    const audio = ctx.audioContext();
    const stateChanged = vi.fn();
    audio.addEventListener('statechange', stateChanged);
    expect(audio).toBe(ctx.audioContext());
    expect(audio).not.toBe(createMockContext({}).audioContext());
    expect(audio.state).toBe('running');
    expect(audio.sampleRate).toBe(44100);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(audio.currentTime).toBe(1.5);
    await audio.suspend();
    await audio.suspend();
    expect(audio.state).toBe('suspended');
    expect(stateChanged).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(audio.currentTime).toBe(1.5);
    await audio.resume();
    await vi.advanceTimersByTimeAsync(500);
    expect(audio.currentTime).toBe(2);
    await audio.close();
    await audio.close();
    expect(audio.state).toBe('closed');
    expect(stateChanged).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(audio.currentTime).toBe(2);
    await expect(audio.resume()).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(audio.suspend()).rejects.toMatchObject({ name: 'InvalidStateError' });
  });

  it('mock 音频节点可连接、调参/开始/停止，支持注入共享 audioContext', () => {
    const audio = createMockContext({}).audioContext();
    const gain = audio.createGain();
    const oscillator = audio.createOscillator();
    const buffer = audio.createBufferSource();
    expect(oscillator.connect(gain)).toBe(gain);
    expect(gain.connect(audio.destination)).toBe(audio.destination);
    expect(gain.gain.value).toBe(1);
    gain.gain.setValueAtTime(0.18, 0);
    expect(gain.gain.value).toBe(0.18);
    gain.gain.linearRampToValueAtTime(0.1, 1);
    expect(gain.gain.value).toBe(0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, 2);
    gain.gain.cancelScheduledValues(3);
    expect(gain.gain.value).toBe(0.001);
    expect(oscillator.frequency.value).toBe(440);
    oscillator.frequency.setValueAtTime(220, 0);
    expect(oscillator.frequency.value).toBe(220);
    oscillator.type = 'triangle';
    oscillator.start();
    oscillator.stop();
    oscillator.disconnect();
    buffer.start();
    buffer.stop();
    buffer.disconnect();
    gain.disconnect();
    const customAudio = vi.fn(() => audio);
    expect(createMockContext({}, { audioContext: customAudio }).audioContext()).toBe(audio);
    expect(customAudio).toHaveBeenCalledOnce();
  });
});

describe('defineReactActivity', () => {
  it('最新按键处理器生效，多个实例隔离，并支持暂停/恢复', async () => {
    const firstLog = vi.fn();
    const secondLog = vi.fn();
    const first = createMockContext<ProbeProps>({ id: 'first' }, { log: firstLog });
    const second = createMockContext<ProbeProps>({ id: 'second' }, { log: secondLog });
    const firstMounted = await mountProbe(explicitReactPlugin, first);
    const secondMounted = await mountProbe(explicitReactPlugin, second);

    expect(await press(firstMounted.instance, 'ok')).toBe(true);
    expect(firstLog).toHaveBeenLastCalledWith('key', {
      id: 'first',
      count: 0,
      inputMode: 'dpad',
    });
    expect(secondLog).not.toHaveBeenCalled();

    await act(async () => first.mock.setInputMode('touch'));
    expect(await press(firstMounted.instance, 'ok')).toBe(true);
    expect(firstLog).toHaveBeenLastCalledWith('key', {
      id: 'first',
      count: 1,
      inputMode: 'touch',
    });

    expect(await press(secondMounted.instance, 'ok')).toBe(true);
    expect(secondLog).toHaveBeenLastCalledWith('key', {
      id: 'second',
      count: 0,
      inputMode: 'dpad',
    });

    await act(async () => {
      firstMounted.instance.pause?.();
      firstMounted.instance.pause?.();
    });
    expect(first.mock.stopSpeakingCount).toBe(1);
    expect(firstMounted.stage.querySelector('[data-probe="first"]')?.getAttribute('data-paused')).toBe('true');
    expect(secondMounted.stage.querySelector('[data-probe="second"]')?.getAttribute('data-paused')).toBe('false');
    expect(await press(firstMounted.instance, 'ok')).toBe(true);
    expect(await press(firstMounted.instance, 'left')).toBe(true);
    expect(await press(firstMounted.instance, 'back')).toBe(false);
    expect(firstLog).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstMounted.instance.resume?.();
      firstMounted.instance.resume?.();
    });
    expect(firstMounted.stage.querySelector('[data-probe="first"]')?.getAttribute('data-paused')).toBe('false');
    expect(await press(firstMounted.instance, 'ok')).toBe(true);
    expect(firstLog).toHaveBeenLastCalledWith('key', {
      id: 'first', count: 2, inputMode: 'touch',
    });
    await act(async () => {
      firstMounted.stage.querySelector<HTMLButtonElement>('button')!.click();
    });
    await press(firstMounted.instance, 'ok');
    expect(firstLog).toHaveBeenLastCalledWith('key', {
      id: 'first', count: 4, inputMode: 'touch',
    });
    expect(firstLog).toHaveBeenCalledTimes(4);
    expect(secondLog).toHaveBeenCalledOnce();
    expect(await press(firstMounted.instance, 'left')).toBe(false);
    expect(await press(firstMounted.instance, 'back')).toBe(false);
  });

  it('首帧提交前保留 OK，返回键立即交还宿主，提交后仅处理一次', async () => {
    const ctx = createMockContext<ProbeProps>({ id: 'early' });
    let value!: ReturnType<typeof mountNow<ProbeProps>>;
    await act(async () => {
      value = mountNow(explicitReactPlugin, ctx);
      expect(value.instance.onKey?.('ok')).toBe(true);
      expect(value.instance.onKey?.('back')).toBe(false);
      expect(ctx.mock.logs).toEqual([]);
    });
    expect(value.stage.textContent).toBe('early:1:dpad');
    expect(ctx.mock.logs).toEqual([{
      type: 'key', data: { id: 'early', count: 0, inputMode: 'dpad' },
    }]);
  });

  it('首帧前暂停会丢弃待处理按键，恢复后不会重放旧按键', async () => {
    const ctx = createMockContext<ProbeProps>({ id: 'paused-early' });
    let value!: ReturnType<typeof mountNow<ProbeProps>>;
    await act(async () => {
      value = mountNow(explicitReactPlugin, ctx);
      value.instance.onKey?.('ok');
      value.instance.pause?.();
    });
    expect(ctx.mock.logs).toEqual([]);
    expect(value.stage.querySelector('button')?.dataset.paused).toBe('true');
    await act(async () => { value.instance.resume?.(); });
    expect(ctx.mock.logs).toEqual([]);
    await press(value.instance, 'ok');
    expect(ctx.mock.logs).toHaveLength(1);
    expect(value.stage.textContent).toBe('paused-early:1:dpad');
  });

  it('已提交但未注册 handler 时不吞宿主导航按键', async () => {
    const plugin = defineReactActivity({
      type: 'test.no-handler', version: '1.0.0', name: { zh: '无按键处理器' },
      React, ReactDOMClient, Component: () => React.createElement('div', null, 'ready'),
    });
    const value = await mountProbe(plugin, createMockContext({}));
    for (const key of ['left', 'ok', 'back'] as const) {
      expect(await press(value.instance, key)).toBe(false);
    }
  });

  it.each(['abort', 'unmount'] as const)('%s 中止 scoped signal、清理定时器/effect，且卸载幂等', async (action) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const controller = new AbortController();
    const ctx = createMockContext<ProbeProps>({ id: 'scoped' }, { signal: controller.signal });
    const add = vi.spyOn(ctx.signal, 'addEventListener');
    const remove = vi.spyOn(ctx.signal, 'removeEventListener');
    const aborted = vi.fn();
    const cleanup = vi.fn();
    let received!: ActivityContext<ProbeProps>;
    let pending!: Promise<void>;
    let cancelled: unknown;
    function Timed({ ctx: scoped }: { ctx: ActivityContext<ProbeProps> }) {
      received = scoped;
      useActivityKeys(() => true);
      React.useEffect(() => {
        scoped.signal.addEventListener('abort', aborted, { once: true });
        pending = wait(10_000, scoped.signal).then(
          () => { scoped.complete(); },
          (error: unknown) => { cancelled = error; },
        );
        return () => {
          scoped.signal.removeEventListener('abort', aborted);
          cleanup();
        };
      }, [scoped]);
      return React.createElement('div', null, scoped.props.id);
    }
    const plugin = defineReactActivity<ProbeProps>({
      type: 'test.scoped', version: '1.0.0', name: { zh: '作用域测试' },
      React, ReactDOMClient, Component: Timed,
    });
    const value = await mountProbe(plugin, ctx);
    const reason = new Error('host stopped');
    expect(received).not.toBe(ctx);
    expect(received.signal).not.toBe(ctx.signal);
    expect(received.props).toBe(ctx.props);
    expect(received.locale).toBe(ctx.locale);
    expect(received.speak).toBe(ctx.speak);
    expect(vi.getTimerCount()).toBe(1);
    ctx.setParentHint('陪宝宝玩一会儿');

    await act(async () => {
      if (action === 'abort') controller.abort(reason);
      else value.instance.unmount();
    });
    await pending;
    expect(received.signal.aborted).toBe(true);
    expect(ctx.signal.aborted).toBe(action === 'abort');
    if (action === 'abort') expect(received.signal.reason).toBe(reason);
    expect(cancelled).toMatchObject({ name: 'AbortError' });
    expect(aborted).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    expect(value.stage.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ctx.mock.completions).toEqual([]);
    expect(ctx.mock.stopSpeakingCount).toBeGreaterThan(0);
    expect(ctx.mock.parentHints.at(-1)).toBeNull();
    const stops = ctx.mock.stopSpeakingCount;
    await act(async () => {
      value.instance.unmount();
      value.instance.unmount();
      value.instance.pause?.();
      value.instance.resume?.();
    });
    expect(ctx.mock.stopSpeakingCount).toBe(stops);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(await press(value.instance, 'ok')).toBe(false);
    expect(await press(value.instance, 'back')).toBe(false);
  });

  it('signal 预先中止时不创建 React root，不渲染活动', async () => {
    const createRoot = vi.fn(ReactDOMClient.createRoot);
    const Component = vi.fn(() => React.createElement('div'));
    const ctx = createMockContext({});
    ctx.mock.abort();
    const plugin = defineReactActivity({
      type: 'test.pre-aborted', version: '1.0.0', name: { zh: '预先中止' },
      React, ReactDOMClient: { ...ReactDOMClient, createRoot }, Component,
    });
    const value = await mountProbe(plugin, ctx);
    expect(createRoot).not.toHaveBeenCalled();
    expect(Component).not.toHaveBeenCalled();
    expect(value.stage.childElementCount).toBe(0);
    expect(await press(value.instance, 'ok')).toBe(false);
  });

  it('延迟卸载旧实例期间可立即挂载新实例，不误删舞台兄弟节点或新活动', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stage = document.createElement('section');
    const outside = document.createElement('aside');
    outside.textContent = 'host-owned';
    stage.append(outside);
    const oldCtx = createMockContext<ProbeProps>({ id: 'old' });
    const first = await mountProbe(
      explicitReactPlugin, oldCtx, stage,
    );
    const oldContainer = stage.querySelector('[data-sprout-activity]')!;
    let second!: ReturnType<typeof mountNow<ProbeProps>>;
    await act(async () => {
      first.instance.unmount();
      expect(oldContainer.isConnected).toBe(false);
      second = mountNow(explicitReactPlugin, createMockContext<ProbeProps>({ id: 'new' }), stage);
      first.instance.unmount();
    });
    expect(oldCtx.signal.aborted).toBe(false);
    expect(stage.querySelectorAll('[data-sprout-activity="test.react-probe"]')).toHaveLength(1);
    expect(stage.querySelector('[data-probe="new"]')).not.toBeNull();
    expect(stage.contains(outside)).toBe(true);
    expect(stage.childElementCount).toBe(2);
    expect(await press(second.instance, 'ok')).toBe(true);
    expect(second.stage.textContent).toContain('new:1:dpad');
    expect(errors).not.toHaveBeenCalled();
  });

  it('在 React layout effect 内 complete/切换活动时，延迟 unmount 无同步卸载警告', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stage = document.createElement('section');
    let first!: ReturnType<typeof mountNow<ProbeProps>>;
    let next!: ReturnType<typeof mountNow<ProbeProps>>;
    function Finish({ ctx }: { ctx: ActivityContext<ProbeProps> }) {
      React.useLayoutEffect(() => { ctx.complete(); }, [ctx]);
      return React.createElement('div', null, 'finish');
    }
    const plugin = defineReactActivity<ProbeProps>({
      type: 'test.finish', version: '1.0.0', name: { zh: '结束后切换' },
      React, ReactDOMClient, Component: Finish,
    });
    const ctx = createMockContext<ProbeProps>({ id: 'finish' }, {
      complete() {
        first.instance.unmount();
        next = mountNow(explicitReactPlugin, createMockContext<ProbeProps>({ id: 'next' }), stage);
      },
    });
    await act(async () => { first = mountNow(plugin, ctx, stage); });
    expect(ctx.mock.completions).toEqual([{}]);
    expect(stage.querySelector('[data-probe="next"]')).not.toBeNull();
    expect(stage.querySelector('[data-sprout-activity="test.finish"]')).toBeNull();
    expect(await press(first.instance, 'ok')).toBe(false);
    expect(await press(next.instance, 'ok')).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it('活动创建后才绑定 SproutHost，每次 mount 都延迟解析当前宿主运行时', async () => {
    expect(globalThis.SproutHost).toBeUndefined();
    const plugin = defineReactActivity<ProbeProps>({
      type: 'test.react-host-fallback',
      version: '1.0.0',
      name: { zh: '宿主回退', en: 'Host fallback' },
      Component: Probe,
    });
    const firstRoot = vi.fn(ReactDOMClient.createRoot);
    vi.stubGlobal('SproutHost', {
      sdkVersion: SDK_VERSION, React,
      ReactDOMClient: { ...ReactDOMClient, createRoot: firstRoot },
      registerActivity: vi.fn(),
    });
    const first = await mountProbe(plugin, createMockContext<ProbeProps>({ id: 'host-first' }));
    expect(firstRoot).toHaveBeenCalledOnce();
    const nextRoot = vi.fn(ReactDOMClient.createRoot);
    vi.stubGlobal('SproutHost', {
      sdkVersion: SDK_VERSION, React,
      ReactDOMClient: { ...ReactDOMClient, createRoot: nextRoot },
      registerActivity: vi.fn(),
    });
    const next = await mountProbe(plugin, createMockContext<ProbeProps>({ id: 'host-next' }));
    expect(firstRoot).toHaveBeenCalledOnce();
    expect(nextRoot).toHaveBeenCalledOnce();
    expect(await press(first.instance, 'ok')).toBe(true);
    expect(await press(next.instance, 'ok')).toBe(true);
    expect(next.stage.textContent).toBe('host-next:1:dpad');
  });

  it('显式 React/ReactDOMClient 优先于无效的宿主运行时', async () => {
    const hostRoot = vi.fn(() => { throw new Error('不应使用宿主 root'); });
    vi.stubGlobal('SproutHost', {
      sdkVersion: SDK_VERSION, React: {},
      ReactDOMClient: { createRoot: hostRoot }, registerActivity: vi.fn(),
    });
    const value = await mountProbe(explicitReactPlugin, createMockContext<ProbeProps>({ id: 'explicit' }));
    expect(await press(value.instance, 'ok')).toBe(true);
    expect(hostRoot).not.toHaveBeenCalled();
  });

  it('只在 mount 时要求宿主运行时，错误清晰且绑定运行时后可重试同一插件', async () => {
    const plugin = defineReactActivity<ProbeProps>({
      type: 'test.missing-runtime', version: '1.0.0', name: { zh: '宿主尚未绑定' },
      Component: Probe,
    });
    const ctx = createMockContext<ProbeProps>({ id: 'retry' });
    const stage = document.createElement('section');
    expect(() => plugin.mount(stage, ctx)).toThrow(/React runtime is required/);
    vi.stubGlobal('SproutHost', {
      sdkVersion: SDK_VERSION, React, ReactDOMClient: {}, registerActivity: vi.fn(),
    });
    expect(() => plugin.mount(stage, ctx)).toThrow(/ReactDOMClient runtime is required/);
    expect(stage.childElementCount).toBe(0);
    vi.stubGlobal('SproutHost', {
      sdkVersion: SDK_VERSION, React, ReactDOMClient, registerActivity: vi.fn(),
    });
    const value = await mountProbe(plugin, ctx, stage);
    expect(await press(value.instance, 'ok')).toBe(true);
  });
});
