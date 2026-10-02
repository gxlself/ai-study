import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioManifest } from '@sprout/schema';
import type { SfxName } from '../../../../packages/plugin-sdk/src/types';
import { resolveSpeechAudio, SpeechEngine, SPEECH_TIMEOUT_MS } from './speech';

class TestAudio extends EventTarget {
  static instances: TestAudio[] = [];
  volume = 1;
  preload = '';
  play = vi.fn((): Promise<void> => Promise.resolve());
  pause = vi.fn();
  removeAttribute = vi.fn();
  constructor(public src: string) {
    super();
    TestAudio.instances.push(this);
  }
  end() { this.dispatchEvent(new Event('ended')); }
  fail() { this.dispatchEvent(new Event('error')); }
}

class TestUtterance {
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function audioParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

interface TestGain {
  context: TestAudioContext;
  gain: ReturnType<typeof audioParam>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface TestOscillator {
  type: string;
  frequency: ReturnType<typeof audioParam>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

class TestAudioContext {
  static instances: TestAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  gains: TestGain[] = [];
  oscillators: TestOscillator[] = [];
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  resume = vi.fn(async () => { this.state = 'running'; });
  constructor() { TestAudioContext.instances.push(this); }
  createGain(): TestGain {
    const gain = { context: this, gain: audioParam(), connect: vi.fn(), disconnect: vi.fn() };
    this.gains.push(gain);
    return gain;
  }
  createOscillator(): TestOscillator {
    const oscillator = {
      type: '', frequency: audioParam(), connect: vi.fn(), disconnect: vi.fn(),
      start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null,
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

const manifest = (entries: Record<string, string>): AudioManifest => ({ schemaVersion: 1, voices: {}, entries });
async function flush() {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
}

describe('SpeechEngine', () => {
  let engine: SpeechEngine;
  let utterances: TestUtterance[];
  let synthesis: {
    getVoices: ReturnType<typeof vi.fn>;
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    TestAudio.instances = [];
    TestAudioContext.instances = [];
    utterances = [];
    synthesis = {
      getVoices: vi.fn(() => [{ lang: 'en-US', name: 'English' }, { lang: 'zh-CN', name: 'Chinese' }]),
      speak: vi.fn((utterance: TestUtterance) => { utterances.push(utterance); }),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    vi.stubGlobal('Audio', TestAudio);
    vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
    vi.stubGlobal('speechSynthesis', synthesis);
    vi.stubGlobal('AudioContext', TestAudioContext);
    engine = new SpeechEngine();
  });

  afterEach(async () => {
    engine.stopSpeaking();
    await flush();
    for (const context of TestAudioContext.instances) context.state = 'closed';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('uses speechKey normalization and first-manifest precedence with pack-relative audio paths', async () => {
    const manifests = [
      { baseUrl: '/packs/local/', manifest: manifest({ 'en:Hello world': 'audio/hello.m4a' }) },
      { baseUrl: '/packs/sprout.core', manifest: manifest({ 'en:Hello world': 'audio/core.m4a' }) },
    ];
    expect(resolveSpeechAudio(manifests, 'en', '  Hello \n world  ')).toBe('/packs/local/audio/hello.m4a');
    expect(resolveSpeechAudio(manifests, 'zh', 'Hello world')).toBeUndefined();
    engine.setManifests(manifests);
    const pending = engine.say('en', '  Hello \n world  ');
    await flush();
    expect(TestAudio.instances[0].src).toBe('/packs/local/audio/hello.m4a');
    expect(synthesis.speak).not.toHaveBeenCalled();
    TestAudio.instances[0].end();
    await pending;
  });

  it('replaces old manifests rather than retaining stale recordings', async () => {
    engine.setManifests([{ baseUrl: '/packs/old', manifest: manifest({ 'zh:你好': 'audio/hello.m4a' }) }]);
    engine.setManifests([]);
    const pending = engine.say('zh', '你好');
    await flush();
    expect(TestAudio.instances).toHaveLength(0);
    expect(utterances[0].text).toBe('你好');
    utterances[0].onend?.();
    await pending;
  });

  it('uses the contract language order, 400ms gap and configured Web Speech parameters', async () => {
    vi.useFakeTimers();
    const pending = engine.speak({ zh: '你好', en: 'Hello' }, 'zh-en');
    await flush();
    expect(utterances[0]).toMatchObject({ text: '你好', lang: 'zh-CN', rate: 0.85, pitch: 1.05 });
    utterances[0].onend?.();
    await vi.advanceTimersByTimeAsync(399);
    expect(utterances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(utterances[1]).toMatchObject({ text: 'Hello', lang: 'en-US', rate: 0.85, pitch: 1.05 });
    utterances[1].onend?.();
    await pending;
  });

  it('supports a per-call mode override and falls back to the available language', async () => {
    const pending = engine.speak({ zh: '你好', en: 'Hello' }, 'zh', { mode: 'en-zh', gapMs: 0 });
    await flush();
    expect(utterances[0].lang).toBe('en-US');
    utterances[0].onend?.();
    await flush();
    expect(utterances[1].lang).toBe('zh-CN');
    utterances[1].onend?.();
    await pending;
    const fallback = engine.speak('只有中文', 'en');
    await flush();
    expect(utterances[2].lang).toBe('zh-CN');
    utterances[2].onend?.();
    await fallback;
  });

  it('falls back to Web Speech for broken recordings, including autoplay rejection', async () => {
    engine.setManifests([{ baseUrl: './bundled/core', manifest: manifest({ 'en:Hello': 'audio/hello.m4a' }) }]);
    const pending = engine.say('en', 'Hello');
    await flush();
    TestAudio.instances[0].fail();
    await flush();
    expect(utterances[0].text).toBe('Hello');
    utterances[0].onend?.();
    await pending;
    const play = vi.spyOn(TestAudio.prototype, 'dispatchEvent');
    const failed = engine.playAudio('denied.m4a');
    await flush();
    const audio = TestAudio.instances[1];
    audio.play.mockRejectedValue(new Error('autoplay blocked'));
    engine.pause();
    engine.resume();
    await failed;
    expect(play).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ended' }));
  });

  it('queues interrupt:false requests in FIFO order', async () => {
    const first = engine.say('en', 'First');
    const second = engine.speak({ en: 'Second' }, 'en', { interrupt: false });
    const third = engine.speak({ en: 'Third' }, 'en', { interrupt: false });
    await flush();
    expect(utterances.map((item) => item.text)).toEqual(['First']);
    utterances[0].onend?.();
    await flush();
    expect(utterances.map((item) => item.text)).toEqual(['First', 'Second']);
    utterances[1].onend?.();
    await flush();
    utterances[2].onend?.();
    await Promise.all([first, second, third]);
  });

  it('settles both active and queued promises when interrupted without browser end callbacks', async () => {
    const finished = vi.fn();
    const first = engine.speak({ en: 'First', zh: '旧内容' }, 'en-zh').then(finished);
    const queued = engine.speak({ en: 'Queued' }, 'en', { interrupt: false }).then(finished);
    await flush();
    const lateEnd = utterances[0].onend;
    const current = engine.say('en', 'Current');
    await Promise.all([first, queued]);
    await flush();
    expect(finished).toHaveBeenCalledTimes(2);
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(utterances.map((item) => item.text)).toEqual(['First', 'Current']);
    lateEnd?.();
    expect(utterances).toHaveLength(2);
    utterances[1].onend?.();
    await current;
  });

  it('cancels HTML audio immediately and ignores late events from old playback', async () => {
    engine.setManifests([{ baseUrl: '/packs/core', manifest: manifest({ 'en:First': 'audio/first.m4a', 'en:Second': 'audio/second.m4a' }) }]);
    const first = engine.say('en', 'First');
    await flush();
    const old = TestAudio.instances[0];
    const secondDone = vi.fn();
    const second = engine.say('en', 'Second').then(secondDone);
    await first;
    await flush();
    expect(old.pause).toHaveBeenCalledOnce();
    old.end();
    old.fail();
    await flush();
    expect(secondDone).not.toHaveBeenCalled();
    expect(synthesis.speak).not.toHaveBeenCalled();
    TestAudio.instances[1].end();
    await second;
  });

  it('cancels between languages and clears gap timers', async () => {
    vi.useFakeTimers();
    const first = engine.speak({ en: 'Hello', zh: '你好' }, 'en-zh');
    await flush();
    utterances[0].onend?.();
    await flush();
    expect(vi.getTimerCount()).toBe(2);
    engine.stopSpeaking();
    await first;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(utterances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses and resumes media while keeping the playback promise pending', async () => {
    const done = vi.fn();
    const pending = engine.playAudio('recording.m4a').then(done);
    await flush();
    const audio = TestAudio.instances[0];
    engine.pause();
    await flush();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    engine.resume();
    expect(audio.play).toHaveBeenCalledTimes(2);
    audio.end();
    await pending;
  });

  it('preserves the remaining inter-language delay across pause/resume', async () => {
    vi.useFakeTimers();
    const pending = engine.speak({ en: 'Hello', zh: '你好' }, 'en-zh');
    await flush();
    utterances[0].onend?.();
    await vi.advanceTimersByTimeAsync(100);
    engine.pause();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(utterances).toHaveLength(1);
    engine.resume();
    await vi.advanceTimersByTimeAsync(299);
    expect(utterances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(utterances).toHaveLength(2);
    utterances[1].onend?.();
    await pending;
  });

  it('does not start queued speech while paused and settles cancelled queued requests', async () => {
    engine.pause();
    const first = engine.say('en', 'First');
    const second = engine.speak({ en: 'Second' }, 'en', { interrupt: false });
    await flush();
    expect(utterances).toHaveLength(0);
    engine.stopSpeaking();
    await Promise.all([first, second]);
    engine.resume();
    await flush();
    expect(utterances).toHaveLength(0);
  });

  it('resumes Web Speech even when the paused utterance was cancelled', async () => {
    const first = engine.say('en', 'First');
    await flush();
    engine.pause();
    expect(synthesis.pause).toHaveBeenCalledOnce();
    engine.stopSpeaking();
    await first;
    const second = engine.say('en', 'Second');
    engine.resume();
    await flush();
    expect(synthesis.resume).toHaveBeenCalled();
    utterances[1].onend?.();
    await second;
  });

  it('settles errors and degrades silently when all playback APIs are unavailable', async () => {
    const failed = engine.say('en', 'Hello');
    await flush();
    utterances[0].onerror?.();
    await failed;
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('Audio', undefined);
    vi.stubGlobal('AudioContext', undefined);
    await expect(engine.speak({ en: 'Hello', zh: '你好' }, 'en-zh', { gapMs: 0 })).resolves.toBeUndefined();
    await expect(engine.playAudio('any.m4a')).resolves.toBeUndefined();
    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(() => engine.sfx('tap')).not.toThrow();
  });

  it('settles stalled HTMLAudio after 60 seconds and allows the next queued task to run', async () => {
    vi.useFakeTimers();
    const timedOut = vi.fn();
    const first = engine.playAudio('never-ends.m4a').then(timedOut);
    const next = engine.speak({ en: 'Next' }, 'en', { interrupt: false });
    await flush();
    await vi.advanceTimersByTimeAsync(SPEECH_TIMEOUT_MS - 1);
    expect(timedOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await first;
    expect(TestAudio.instances[0].pause).toHaveBeenCalledOnce();
    expect(utterances.map((item) => item.text)).toEqual(['Next']);
    utterances[0].onend?.();
    await next;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels stalled Web Speech and bounds the entire bilingual request to 60 seconds', async () => {
    vi.useFakeTimers();
    const pending = engine.speak({ en: 'Hello', zh: '你好' }, 'en-zh');
    await flush();
    await vi.advanceTimersByTimeAsync(45_000);
    utterances[0].onend?.();
    await vi.advanceTimersByTimeAsync(400);
    expect(utterances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(14_600);
    await pending;
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clamps volume and applies updates to active speech and recordings', async () => {
    engine.setVolume(0.4);
    const spoken = engine.say('en', 'Hello');
    await flush();
    expect(utterances[0].volume).toBe(0.4);
    engine.setVolume(-2);
    expect(utterances[0].volume).toBe(0);
    utterances[0].onend?.();
    await spoken;
    engine.setVolume(2);
    const played = engine.playAudio('recording.m4a');
    await flush();
    expect(TestAudio.instances[0].volume).toBe(1);
    engine.setVolume(0.5);
    expect(TestAudio.instances[0].volume).toBe(0.5);
    TestAudio.instances[0].end();
    await played;
  });

  it('shares the AudioContext with song and suspends/resumes it without active narration', async () => {
    const songContext = engine.audioContext() as unknown as TestAudioContext;
    const anotherEngine = new SpeechEngine();
    expect(anotherEngine.audioContext()).toBe(songContext);
    engine.pause();
    expect(songContext.suspend).toHaveBeenCalledOnce();
    expect(songContext.state).toBe('suspended');
    await engine.unlock();
    expect(songContext.resume).not.toHaveBeenCalled();
    engine.resume();
    expect(songContext.resume).toHaveBeenCalledOnce();
    expect(songContext.state).toBe('running');
    songContext.state = 'suspended';
    await engine.unlock();
    expect(songContext.resume).toHaveBeenCalledTimes(2);
  });

  it('suspends a context first created while hidden and suppresses hidden sound effects', () => {
    engine.pause();
    const context = engine.audioContext() as unknown as TestAudioContext;
    expect(context.suspend).toHaveBeenCalledOnce();
    engine.sfx('success');
    expect(context.oscillators).toHaveLength(0);
    engine.resume();
    expect(context.resume).toHaveBeenCalledOnce();
  });

  it('synthesizes all seven gentle effects through a 0.2 master gain and releases nodes', () => {
    const context = engine.audioContext() as unknown as TestAudioContext;
    const names: SfxName[] = ['pop', 'chime', 'tap', 'whoosh', 'success', 'soft-no', 'page'];
    for (const name of names) engine.sfx(name);
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.2, 0);
    expect(context.oscillators).toHaveLength(10);
    engine.setVolume(0.5);
    expect(context.gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0.1, 0);
    for (const oscillator of context.oscillators) {
      expect(oscillator.type).toBe('sine');
      expect(oscillator.start).toHaveBeenCalledOnce();
      expect(oscillator.stop).toHaveBeenCalledOnce();
      oscillator.onended?.();
      expect(oscillator.disconnect).toHaveBeenCalledOnce();
    }
  });
});
