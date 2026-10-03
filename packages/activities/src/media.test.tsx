// @vitest-environment node
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MovementProps, PHRASES, SequenceProps, SongProps, StoryProps, VideoProps, WebProps, pickText,
} from '@sprout/schema';
import type { ConceptRef, LanguageMode, LText } from '@sprout/schema';
import type { ActivityContext, ActivityInstance, ActivityPlugin, InputMode } from '@sprout/plugin-sdk';
import { sequenceActivity } from './activities/sequence';
import { storyActivity } from './activities/story';
import { songActivity } from './activities/song';
import { movementActivity } from './activities/movement';
import { videoActivity } from './activities/video';
import { webActivity } from './activities/web';
import { createSongPlayer, parseNotes } from './music';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const scene = {
  bg: 'grass', ground: 'grass',
  sprites: [{ concept: 'flower', x: 50, y: 50, size: 35, anim: 'sway', delay: 0.5 }],
};
const sequenceProps = SequenceProps.parse({
  steps: [
    { image: 'water.svg', caption: { zh: '洗一洗', en: 'Wash' } },
    { image: 'towel.svg', caption: { zh: '擦一擦', en: 'Dry' } },
  ],
});
const storyProps = StoryProps.parse({
  title: { zh: '小花', en: 'Flower' },
  pages: [
    {
      scene, text: { zh: '小花轻轻摇', en: 'The flower sways.' },
      prompts: [{ kind: 'point', zh: '小花在哪里？', en: 'Where is the flower?' }],
    },
    { scene: { ...scene, bg: 'night' }, text: { zh: '晚安', en: 'Good night' }, narrate: false },
  ],
});
const songProps = SongProps.parse({
  title: { zh: '一起唱', en: 'Sing' }, bpm: 60, instrument: 'flute', scene,
  lines: [
    { lang: 'zh', text: '轻轻唱', notes: 'C4/0.5 R/0.5' },
    { lang: 'en', text: 'Sing softly', notes: 'D4/1' },
  ], repeat: 2, actions: [{ zh: '拍拍手', en: 'Clap' }],
});
const movementProps = MovementProps.parse({
  bpm: 60,
  moves: [
    { image: 'hands.svg', name: { zh: '拍拍手', en: 'Clap' }, say: { zh: '拍拍小手' }, seconds: 3 },
    { image: 'flower.svg', name: { zh: '轻轻摇', en: 'Sway' }, say: { zh: '轻轻摇一摇' }, seconds: 3 },
  ],
});
const videoProps = VideoProps.parse({ src: 'video.mp4', poster: 'poster.svg', captions: 'video.vtt', maxSec: 10 });
const webProps = WebProps.parse({ url: 'https://child.example.test/lesson', maxSec: 10 });

function parameter() {
  return {
    setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function gainNode() {
  return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
}
function oscillatorNode() {
  return { type: 'sine', frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
}

function fakeAudio() {
  const events = new EventTarget();
  const gains: Array<ReturnType<typeof gainNode>> = [];
  const oscillators: Array<ReturnType<typeof oscillatorNode>> = [];
  function gain() {
    const value = gainNode();
    gains.push(value);
    return value;
  }
  function oscillator() {
    const value = oscillatorNode();
    oscillators.push(value);
    return value;
  }
  const raw = {
    state: 'running', currentTime: 0, destination: {},
    createGain: vi.fn(gain), createOscillator: vi.fn(oscillator),
    resume: vi.fn(async () => { raw.state = 'running'; events.dispatchEvent(new Event('statechange')); }),
    suspend: vi.fn(async () => {}), close: vi.fn(async () => {}),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  return {
    audio: raw as unknown as AudioContext, raw, gains, oscillators,
    change(state: string) { raw.state = state; events.dispatchEvent(new Event('statechange')); },
  };
}

function testDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function context<P>(props: P, language: LanguageMode = 'zh-en') {
  const controller = new AbortController();
  const sound = fakeAudio();
  const listeners = new Set<(mode: InputMode) => void>();
  let mode: InputMode = 'dpad';
  let focused: HTMLElement | null = null;
  const ctx: ActivityContext<P> = {
    props, sdkVersion: '1.0.0', lesson: { id: 'test.lesson', title: { zh: '测试', en: 'Test' }, stepIndex: 0, stepCount: 1 },
    child: { name: '芽芽', ageMonths: 24 },
    locale: {
      mode: language, showPinyin: false,
      pick: (text) => pickText({ zh: text.zh ?? text.en ?? '', en: text.en } as LText, language),
    },
    input: {
      get mode() { return mode; },
      onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    },
    reducedMotion: false,
    resolveAsset: (path) => /^https?:/.test(path) ? path : `/packs/test/${path}`,
    concept(ref: ConceptRef) {
      return typeof ref === 'object' ? { ...ref, en: ref.en ?? ref.zh, id: ref.id ?? 'inline', imageUrl: `/packs/test/${ref.image}` }
        : { id: ref, zh: '小花', en: 'flower', imageUrl: `/packs/test/${ref}.svg` };
    },
    speak: vi.fn(async () => {}), say: vi.fn(async () => {}), stopSpeaking: vi.fn(),
    sfx: vi.fn(), playAudio: vi.fn(async () => {}), audioContext: () => sound.audio,
    complete: vi.fn(), log: vi.fn(), setParentHint: vi.fn(),
    focus: {
      refresh: vi.fn(), focus: (element) => { focused = element; }, current: () => focused,
    },
    signal: controller.signal,
  };
  return {
    ctx, controller, sound,
    input(next: InputMode) { mode = next; listeners.forEach((callback) => callback(next)); },
  };
}

const instances: Array<{ instance: ActivityInstance; root: HTMLElement }> = [];
async function mount<P>(plugin: ActivityPlugin<P>, props: P, options: { language?: LanguageMode; audioState?: string } = {}) {
  const value = context(props, options.language);
  if (options.audioState) value.sound.raw.state = options.audioState;
  const root = document.createElement('div');
  document.body.append(root);
  let instance!: ActivityInstance;
  await act(async () => { instance = await plugin.mount(root, value.ctx); });
  instances.push({ instance, root });
  return { ...value, root, instance };
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => { (element as HTMLElement).click(); });
}
async function key(instance: ActivityInstance, value: Parameters<NonNullable<ActivityInstance['onKey']>>[0]) {
  let handled: boolean | undefined;
  await act(async () => { handled = instance.onKey?.(value); });
  return handled;
}
async function message(root: HTMLElement, origin: string, data: unknown, source?: MessageEventSource | null) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', {
      origin, data, source: source === undefined ? root.querySelector('iframe')?.contentWindow : source,
    }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, 'url', { value: String(url) });
    return response;
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    for (const { instance, root } of instances.splice(0)) {
      instance.unmount();
      root.remove();
    }
  });
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('parseNotes', () => {
  it('解析频率、升降号、休止符、拍长和累计起点', () => {
    const notes = parseNotes('A4/1 F#4/0.5 Bb3/2 R/1', 120);
    expect(notes.map((note) => note.durationMs)).toEqual([500, 250, 1000, 500]);
    expect(notes.map((note) => note.offsetMs)).toEqual([0, 500, 750, 1750]);
    expect(notes.map((note) => note.midi)).toEqual([69, 66, 58, null]);
    expect(notes[0].frequency).toBe(440);
    expect(notes[1].frequency).toBeCloseTo(369.994, 2);
    expect(notes[2].frequency).toBeCloseTo(233.082, 2);
    expect(notes[3].frequency).toBeNull();
  });
  it('兼容契约允许的相邻音符与换行，不忽略非法尾部', () => {
    expect(parseNotes(' C4/1D4/1\nR/0.5 ', 60).map((note) => note.pitch)).toEqual(['C4', 'D4', 'R']);
    expect(() => parseNotes('C4/1 garbage')).toThrow(SyntaxError);
  });
  it.each(['', ' ', 'C1/1', 'H4/1', 'C4/-1', 'R/0', 'C4/0', 'C4/1e2', 'C4/1/2', 'C4/1.'])(
    '拒绝不安全或错误旋律 %j', (value) => { expect(() => parseNotes(value)).toThrow(); },
  );
  it.each([0, -1, NaN, Infinity])('拒绝非法 bpm %s', (bpm) => {
    expect(() => parseNotes('C4/1', bpm)).toThrow(RangeError);
  });
});

describe('独立歌曲音频节点', () => {
  it.each(['musicbox', 'marimba', 'flute', 'piano'] as const)('合成 %s 并在结束时释放自身节点', async (instrument) => {
    const sound = fakeAudio();
    const onNote = vi.fn();
    const onFinish = vi.fn();
    const player = createSongPlayer({
      audio: sound.audio, lines: [{ lang: 'zh', text: '轻轻唱', notes: 'A4/0.5 R/0.5' }],
      bpm: 60, instrument, repeat: 1, signal: new AbortController().signal, delay: testDelay, onNote, onFinish,
    });
    player.resume();
    expect(sound.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.18, 0);
    expect(onNote.mock.calls[0][0].noteIndex).toBe(0);
    const count = sound.oscillators.length;
    expect(count).toBeGreaterThan(0);
    await advance(500);
    expect(onNote.mock.calls[1][0].note.pitch).toBe('R');
    expect(sound.oscillators).toHaveLength(count);
    await advance(500);
    expect(onFinish).toHaveBeenCalledOnce();
    expect(player.finished).toBe(true);
    expect(sound.oscillators.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
    expect(sound.gains[0].disconnect).toHaveBeenCalledOnce();
    expect(sound.raw.close).not.toHaveBeenCalled();
    expect(sound.raw.suspend).not.toHaveBeenCalled();
  });
  it('暂停保留当前音符剩余时长，重复次数准确，中止后不再回调', async () => {
    const sound = fakeAudio();
    const signal = new AbortController();
    const onNote = vi.fn();
    const onFinish = vi.fn();
    const player = createSongPlayer({
      audio: sound.audio, lines: [{ lang: 'zh', text: '唱', notes: 'C4/1 D4/1' }],
      bpm: 60, instrument: 'piano', repeat: 2, signal: signal.signal, delay: testDelay, onNote, onFinish,
    });
    player.resume();
    await advance(400);
    player.pause();
    await advance(4000);
    expect(onNote).toHaveBeenCalledTimes(1);
    player.resume();
    await advance(599);
    expect(onNote.mock.lastCall?.[0].noteIndex).toBe(0);
    await advance(1);
    expect(onNote.mock.lastCall?.[0].noteIndex).toBe(1);
    await advance(1000);
    expect(onNote.mock.lastCall?.[0].repetition).toBe(1);
    signal.abort();
    const calls = onNote.mock.calls.length;
    await advance(5000);
    expect(onNote).toHaveBeenCalledTimes(calls);
    expect(onFinish).not.toHaveBeenCalled();
    expect(sound.raw.close).not.toHaveBeenCalled();
    expect(sound.raw.suspend).not.toHaveBeenCalled();
  });
  it('宿主音频尚未解锁时不静默跑完旋律', async () => {
    const sound = fakeAudio();
    sound.raw.state = 'suspended';
    const onNote = vi.fn();
    const player = createSongPlayer({
      audio: sound.audio, lines: songProps.lines, bpm: 60, instrument: 'flute', repeat: 1,
      signal: new AbortController().signal, delay: testDelay, onNote, onFinish: vi.fn(),
    });
    player.resume();
    await advance(20_000);
    expect(onNote).not.toHaveBeenCalled();
    sound.change('running');
    expect(onNote).toHaveBeenCalledOnce();
    sound.change('suspended');
    await advance(10_000);
    expect(onNote).toHaveBeenCalledOnce();
    player.stop();
  });
});

describe('六类活动生命周期与资源', () => {
  const samples: Array<[ActivityPlugin<any>, unknown]> = [
    [sequenceActivity, sequenceProps], [storyActivity, storyProps], [songActivity, songProps],
    [movementActivity, movementProps], [videoActivity, videoProps], [webActivity, webProps],
  ];
  it.each(samples)('$0.type 可挂载、卸载，返回键交还宿主', async (plugin, props) => {
    const { root, instance, ctx, controller, sound } = await mount(plugin, props);
    expect(root.querySelector('.spa-stage')).not.toBeNull();
    expect(await key(instance, 'back')).toBe(false);
    await act(async () => { controller.abort(); });
    await advance(30_000);
    expect(ctx.complete).not.toHaveBeenCalled();
    expect(sound.raw.close).not.toHaveBeenCalled();
    expect(sound.raw.suspend).not.toHaveBeenCalled();
  });
  it('收集场景/步骤/封面的图片与契约短语', () => {
    const { ctx } = context(storyProps);
    expect(storyActivity.preload?.(storyProps, ctx)).toContain('/packs/test/flower.svg');
    expect(sequenceActivity.preload?.(sequenceProps, ctx)).toEqual(['/packs/test/water.svg', '/packs/test/towel.svg']);
    expect(videoActivity.preload?.(videoProps, ctx)).toContain('/packs/test/poster.svg');
    expect(storyActivity.speeches?.(storyProps)).toContainEqual(PHRASES.storyEnd);
    expect(sequenceActivity.speeches?.({ ...sequenceProps, mode: 'order' })).toContainEqual(PHRASES.whatToDoNext);
    expect(movementActivity.speeches?.(movementProps)).toContainEqual(PHRASES.moveDone);
    expect(songActivity.speeches?.(songProps)).toContainEqual(songProps.title);
    expect(songActivity.speeches?.(songProps)).not.toContainEqual({ en: 'Sing softly' });
  });
});

describe('顺序和绘本', () => {
  it('展示模式保留手动回顾确认，输入提示随触屏切换', async () => {
    const value = await mount(sequenceActivity, sequenceProps);
    expect(value.root.textContent).toContain('按 OK');
    await act(async () => { value.input('touch'); });
    expect(value.root.textContent).toContain('点一点');
    await key(value.instance, 'right');
    expect(value.root.querySelector('.spa-sequence-main')?.textContent).toContain('擦一擦');
    await key(value.instance, 'right');
    expect(value.root.querySelectorAll('.spa-sequence-thumb')).toHaveLength(2);
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await click(value.root.querySelector('.spa-media-finish'));
    expect(value.ctx.complete).toHaveBeenCalledOnce();
  });
  it('排序温和纠错，完成后报告首次正确比例', async () => {
    const value = await mount(sequenceActivity, { ...sequenceProps, mode: 'order' });
    await click(value.root.querySelectorAll('.spa-sequence-option')[0]);
    await advance(700);
    expect(value.ctx.speak).toHaveBeenCalledWith(PHRASES.thinkAgain);
    expect(value.root.querySelectorAll('.spa-sequence-thumb')).toHaveLength(0);
    await click(value.root.querySelectorAll('.spa-sequence-option')[1]);
    await advance(1000);
    expect(value.root.querySelectorAll('.spa-sequence-thumb')).toHaveLength(1);
    await click(value.root.querySelectorAll('.spa-sequence-option')[0]);
    await advance(1000);
    await click(value.root.querySelector('.spa-media-finish'));
    expect(value.ctx.complete).toHaveBeenCalledWith({ accuracy: 0.5, data: { mode: 'order', steps: 2 } });
  });
  it('绘本封面、重读、静音页、家长提示和结尾确认', async () => {
    const value = await mount(storyActivity, storyProps);
    expect(value.root.querySelector('.spa-story-cover-text')?.textContent).toContain('小花');
    await key(value.instance, 'ok');
    expect(value.ctx.speak).toHaveBeenCalledWith(storyProps.pages[0].text);
    expect(value.ctx.setParentHint).toHaveBeenCalledWith('小花在哪里？ / Where is the flower?');
    const before = vi.mocked(value.ctx.speak).mock.calls.length;
    await key(value.instance, 'ok');
    expect(vi.mocked(value.ctx.speak).mock.calls.length).toBe(before + 1);
    await key(value.instance, 'right');
    expect(value.ctx.setParentHint).toHaveBeenLastCalledWith(null);
    expect(value.ctx.speak).not.toHaveBeenCalledWith(storyProps.pages[1].text);
    expect(value.root.querySelector('.spa-scene--night')).not.toBeNull();
    await key(value.instance, 'right');
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await key(value.instance, 'ok');
    expect(value.ctx.complete).toHaveBeenCalledOnce();
  });
});

describe('歌曲与动作暂停', () => {
  it('歌曲高亮跟随音符和行；暂停无进度，结束先显示署名', async () => {
    const value = await mount(songActivity, songProps);
    expect(value.root.querySelector('.spa-song-note--current')?.getAttribute('data-note')).toBe('0');
    await advance(500);
    expect(value.root.querySelector('.spa-song-note--current')?.getAttribute('data-pitch')).toBe('R');
    await key(value.instance, 'ok');
    await advance(5000);
    expect(value.root.querySelector('.spa-song-line--current')?.textContent).toContain('轻轻唱');
    await key(value.instance, 'ok');
    await advance(500);
    expect(value.root.querySelector('.spa-song-line--current')?.textContent).toContain('Sing softly');
    await act(async () => { value.instance.pause?.(); });
    await advance(10_000);
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await act(async () => { value.instance.resume?.(); });
    await advance(3000);
    expect(value.root.querySelector('.spa-song-credit')?.textContent).toBe(songProps.credit);
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await advance(2300);
    expect(value.ctx.complete).toHaveBeenCalledOnce();
    expect(value.sound.raw.suspend).not.toHaveBeenCalled();
    expect(value.sound.raw.close).not.toHaveBeenCalled();
  });
  it('歌曲需要手势解锁时等待 OK，而不是略过旋律', async () => {
    const value = await mount(songActivity, songProps, { audioState: 'suspended' });
    await advance(20_000);
    expect(value.sound.oscillators).toHaveLength(0);
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await key(value.instance, 'ok');
    expect(value.sound.raw.resume).toHaveBeenCalledOnce();
    expect(value.sound.oscillators.length).toBeGreaterThan(0);
  });
  it('宿主先解锁音频时，首次继续手势不能反过来暂停歌曲', async () => {
    const value = await mount(songActivity, songProps, { audioState: 'suspended' });
    value.sound.raw.state = 'running';
    await key(value.instance, 'ok');
    expect(value.sound.oscillators.length).toBeGreaterThan(0);
    expect(value.root.querySelector('.spa-song-controls button')?.getAttribute('aria-label')).toBe('暂停');
  });
  it('动作暂停冻结倒计时与节拍，OK 跳过且最后朗读固定结束语', async () => {
    const value = await mount(movementActivity, movementProps);
    await advance(1000);
    const remaining = value.root.querySelector('[role="timer"]')?.textContent;
    const beats = vi.mocked(value.ctx.sfx).mock.calls.length;
    await act(async () => { value.instance.pause?.(); });
    await advance(10_000);
    expect(value.root.querySelector('[role="timer"]')?.textContent).toBe(remaining);
    expect(value.ctx.sfx).toHaveBeenCalledTimes(beats);
    await act(async () => { value.instance.resume?.(); });
    await key(value.instance, 'ok');
    expect(value.root.textContent).toContain('轻轻摇');
    await advance(3100);
    expect(value.ctx.speak).toHaveBeenCalledWith(PHRASES.moveDone);
    await advance(1000);
    expect(value.ctx.complete).toHaveBeenCalledWith({ data: { moves: 2, skipped: 1 } });
  });
});

describe('视频边界', () => {
  it('不自动播放，解析资源和字幕，播放到 maxSec 后结束一次', async () => {
    const value = await mount(videoActivity, videoProps);
    const video = value.root.querySelector('video')!;
    expect(video.autoplay).toBe(false);
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.getAttribute('src')).toBe('/packs/test/video.mp4');
    expect(video.getAttribute('poster')).toBe('/packs/test/poster.svg');
    expect(video.querySelector('track')?.getAttribute('src')).toBe('/packs/test/video.vtt');
    await key(value.instance, 'ok');
    expect(video.play).toHaveBeenCalledOnce();
    video.currentTime = 10;
    await act(async () => { video.dispatchEvent(new Event('timeupdate')); });
    expect(value.ctx.complete).toHaveBeenCalledWith({ data: { reason: 'max-duration', watchedSec: 10 } });
    await act(async () => { video.dispatchEvent(new Event('ended')); });
    expect(value.ctx.complete).toHaveBeenCalledOnce();
  });
  it('宿主暂停与中止停止视频，手动暂停不被宿主恢复误播放', async () => {
    const value = await mount(videoActivity, videoProps);
    const video = value.root.querySelector('video')!;
    await key(value.instance, 'ok');
    await act(async () => { value.instance.pause?.(); });
    expect(video.paused).toBe(true);
    await act(async () => { value.instance.resume?.(); });
    expect(video.paused).toBe(false);
    await key(value.instance, 'ok');
    const calls = vi.mocked(video.play).mock.calls.length;
    await act(async () => { value.instance.pause?.(); });
    await act(async () => { value.instance.resume?.(); });
    expect(video.play).toHaveBeenCalledTimes(calls);
    await act(async () => { value.controller.abort(); });
    expect(value.root.querySelector('video')).toBeNull();
    expect(value.ctx.complete).not.toHaveBeenCalled();
  });
  it('play 拒绝时可恢复，不产生未处理的 Promise', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
    const value = await mount(videoActivity, videoProps);
    await click(value.root.querySelector('.spa-video-play'));
    expect(value.root.textContent).toContain('视频暂时无法播放');
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await key(value.instance, 'ok');
    expect(value.root.textContent).not.toContain('视频暂时无法播放');
  });
});

describe('网页消息安全和超时', () => {
  it('opaque sandbox 同时检查准确 source、null origin 和本次 nonce', async () => {
    const value = await mount(webActivity, webProps);
    const frame = value.root.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    const nonce = new URL(frame.src).searchParams.get('sproutNonce');
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    await act(async () => { frame.dispatchEvent(new Event('load')); });
    expect(frame.allowFullscreen).toBe(false);
    await message(value.root, 'https://other.example.test', { type: 'sprout:complete' });
    await message(value.root, 'https://child.example.test', { type: 'sprout:complete' }, window);
    await message(value.root, 'https://child.example.test:444', { type: 'sprout:complete' });
    await message(value.root, 'https://child.example.test', '{"type":"sprout:complete"}');
    await message(value.root, 'https://child.example.test', { type: 'complete' });
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await message(value.root, 'null', { type: 'sprout:complete' });
    await message(value.root, 'null', { type: 'sprout:complete', nonce: 'wrong' });
    await message(value.root, 'null', { type: 'sprout:complete', nonce }, window);
    await message(value.root, 'https://child.example.test', { type: 'sprout:complete', nonce });
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await message(value.root, 'null', { type: 'sprout:complete', nonce, accuracy: 999 });
    expect(value.ctx.complete).toHaveBeenCalledWith({ data: { reason: 'message' } });
    expect(value.root.querySelector('iframe')).toBeNull();
  });
  it('maxSec 在暂停期间冻结；卸载 iframe 阻止嵌入声音继续', async () => {
    const value = await mount(webActivity, webProps);
    await advance(4000);
    const source = value.root.querySelector('iframe')!.contentWindow;
    await act(async () => { value.instance.pause?.(); });
    expect(value.root.querySelector('iframe')).toBeNull();
    await message(value.root, 'https://child.example.test', { type: 'sprout:complete' }, source);
    await advance(20_000);
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await act(async () => { value.instance.resume?.(); });
    expect(value.root.querySelector('iframe')).not.toBeNull();
    await advance(6200);
    expect(value.ctx.complete).toHaveBeenCalledWith({ data: { reason: 'max-duration' } });
  });
  it('加载超时可重试；恶意协议和同源 URL 不创建 iframe', async () => {
    const value = await mount(webActivity, { ...webProps, maxSec: undefined });
    await advance(15_100);
    expect(value.root.textContent).toContain('页面暂时无法打开');
    expect(value.root.querySelector('iframe')).toBeNull();
    await click(value.root.querySelector('[aria-label="重新打开"]'));
    expect(value.root.querySelector('iframe')).not.toBeNull();
    const unsafe = await mount(webActivity, { ...webProps, url: 'javascript:alert(1)' });
    expect(unsafe.root.querySelector('iframe')).toBeNull();
    const sameOrigin = await mount(webActivity, { ...webProps, url: `${window.location.origin}/lesson` });
    expect(sameOrigin.root.querySelector('iframe')).toBeNull();
  });
  it('拒绝最终来源改变和重定向；取消的旧请求不能创建 iframe', async () => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, 'url', { value: `${window.location.origin}/redirected` });
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const changed = await mount(webActivity, webProps);
    expect(changed.root.querySelector('iframe')).toBeNull();
    expect(changed.root.textContent).toContain('页面暂时无法打开');
    expect(fetch).toHaveBeenCalledWith(webProps.url, expect.objectContaining({
      method: 'HEAD', redirect: 'error', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
    }));
    let settle!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { settle = resolve; }));
    const old = await mount(webActivity, webProps);
    await act(async () => { old.controller.abort(); });
    const valid = new Response(null, { status: 200 });
    Object.defineProperty(valid, 'url', { value: webProps.url });
    await act(async () => { settle(valid); });
    expect(old.root.querySelector('iframe')).toBeNull();
  });
  it('暂停再恢复后轮换 nonce，旧窗口和旧 nonce 无法完成新活动', async () => {
    const value = await mount(webActivity, webProps);
    const oldFrame = value.root.querySelector('iframe')!;
    const oldNonce = new URL(oldFrame.src).searchParams.get('sproutNonce');
    const oldWindow = oldFrame.contentWindow;
    await act(async () => { value.instance.pause?.(); });
    await act(async () => { value.instance.resume?.(); });
    const frame = value.root.querySelector('iframe')!;
    const nonce = new URL(frame.src).searchParams.get('sproutNonce');
    expect(nonce).not.toBe(oldNonce);
    await act(async () => { frame.dispatchEvent(new Event('load')); });
    await message(value.root, 'null', { type: 'sprout:complete', nonce: oldNonce });
    await message(value.root, 'null', { type: 'sprout:complete', nonce }, oldWindow);
    expect(value.ctx.complete).not.toHaveBeenCalled();
    await message(value.root, 'null', { type: 'sprout:complete', nonce });
    expect(value.ctx.complete).toHaveBeenCalledOnce();
  });
});

describe('视频资源安全', () => {
  it('外部 src 不创建 video；外部海报和字幕不会进入 DOM 或预加载', async () => {
    const external = await mount(videoActivity, { ...videoProps, src: 'https://tracking.test/video.mp4' });
    expect(external.root.querySelector('video')).toBeNull();
    expect(external.root.textContent).toContain('视频暂时无法播放');
    const props = { ...videoProps, poster: 'https://tracking.test/poster.png', captions: '//tracking.test/a.vtt' };
    const safe = await mount(videoActivity, props);
    expect(safe.root.querySelector('video')?.getAttribute('src')).toBe('/packs/test/video.mp4');
    expect(safe.root.querySelector('video')?.hasAttribute('poster')).toBe(false);
    expect(safe.root.querySelector('track')).toBeNull();
    expect(videoActivity.preload?.(props, safe.ctx)).toEqual(['/packs/test/video.mp4']);
  });
});
