import { speechKey, speechParts } from '@sprout/schema';
import type { AudioManifest, Lang, LanguageMode, Speech } from '@sprout/schema';
import type { SfxName, SpeakOptions } from '../../../../packages/plugin-sdk/src/types';

export interface SpeechEngineConfig {
  volume?: number;
  gapMs?: number;
}

export interface SpeechManifest {
  baseUrl: string;
  manifest: AudioManifest;
}

interface Job {
  controller: AbortController;
  run(signal: AbortSignal): Promise<void>;
  resolve(): void;
  timeout?: ReturnType<typeof setTimeout>;
}

interface Playback {
  pause(): void;
  resume(): void;
  volume(value: number): void;
}

interface Tone {
  frequency: number;
  endFrequency?: number;
  start: number;
  duration: number;
}

const TONES: Record<SfxName, readonly Tone[]> = {
  pop: [{ frequency: 440, endFrequency: 660, start: 0, duration: 0.12 }],
  chime: [
    { frequency: 523.25, start: 0, duration: 0.4 },
    { frequency: 659.25, start: 0.12, duration: 0.4 },
  ],
  tap: [{ frequency: 330, start: 0, duration: 0.08 }],
  whoosh: [{ frequency: 220, endFrequency: 440, start: 0, duration: 0.3 }],
  success: [
    { frequency: 523.25, start: 0, duration: 0.3 },
    { frequency: 659.25, start: 0.14, duration: 0.3 },
    { frequency: 783.99, start: 0.28, duration: 0.4 },
  ],
  'soft-no': [{ frequency: 330, endFrequency: 293.66, start: 0, duration: 0.25 }],
  page: [{ frequency: 260, endFrequency: 380, start: 0, duration: 0.2 }],
};

let sharedContext: AudioContext | undefined;
export const SPEECH_TIMEOUT_MS = 60_000;

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

function gapDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 400;
}

function audioUrl(baseUrl: string, path: string): string {
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/${path}` : path;
}

/** 重复 key 按清单入参顺序优先，调用方可把本课包放在最前。 */
export function resolveSpeechAudio(
  manifests: readonly SpeechManifest[],
  lang: Lang,
  text: string,
): string | undefined {
  const key = speechKey(lang, text);
  for (const { baseUrl, manifest } of manifests) {
    if (Object.hasOwn(manifest.entries, key)) return audioUrl(baseUrl, manifest.entries[key]);
  }
  return undefined;
}

export class SpeechEngine {
  private volume: number;
  private readonly gapMs: number;
  private readonly audioEntries = new Map<string, string>();
  private readonly queue: Job[] = [];
  private readonly resumeWaiters = new Set<() => void>();
  private active: Job | null = null;
  private playback: Playback | null = null;
  private synthesisToResume: SpeechSynthesis | null = null;
  private paused = false;
  private master: GainNode | null = null;

  constructor(config: SpeechEngineConfig = {}) {
    this.volume = clampVolume(config.volume ?? 1);
    this.gapMs = gapDuration(config.gapMs ?? 400);
  }

  setManifests(manifests: SpeechManifest[]): void {
    this.audioEntries.clear();
    for (const { baseUrl, manifest } of manifests) {
      for (const [key, path] of Object.entries(manifest.entries)) {
        if (!this.audioEntries.has(key)) this.audioEntries.set(key, audioUrl(baseUrl, path));
      }
    }
  }

  setVolume(value: number): void {
    this.volume = clampVolume(value);
    this.playback?.volume(this.volume);
    if (this.master && this.master.context.state !== 'closed') {
      this.master.gain.setValueAtTime(0.2 * this.volume, this.master.context.currentTime);
    }
  }

  async unlock(): Promise<void> {
    if (this.paused) return;
    try {
      const context = this.audioContext();
      if (context.state === 'suspended') await context.resume();
    } catch {
      // 不支持 WebAudio 或浏览器拒绝解锁时，保留朗读的静默降级。
    }
  }

  speak(speech: Speech | string, mode: LanguageMode, opts: SpeakOptions = {}): Promise<void> {
    const parts = speechParts(speech, opts.mode ?? mode)
      .map(({ lang, text }) => ({ lang, text: text.trim().replace(/\s+/g, ' ') }))
      .filter(({ text }) => text.length > 0);
    return this.enqueue(async (signal) => {
      for (let i = 0; i < parts.length && !signal.aborted; i += 1) {
        if (i > 0) await this.delay(gapDuration(opts.gapMs ?? this.gapMs), signal);
        await this.whenResumed(signal);
        if (signal.aborted) return;
        const { lang, text } = parts[i];
        const url = this.audioEntries.get(speechKey(lang, text));
        const played = url ? await this.playMedia(url, signal) : false;
        if (!played && !signal.aborted) {
          await this.whenResumed(signal);
          if (!signal.aborted) await this.synthesize(lang, text, signal);
        }
      }
    }, opts.interrupt ?? true);
  }

  say(lang: Lang, text: string): Promise<void> {
    return this.speak({ [lang]: text }, lang);
  }

  playAudio(url: string): Promise<void> {
    return this.enqueue(async (signal) => {
      await this.whenResumed(signal);
      if (!signal.aborted && url) await this.playMedia(url, signal);
    }, true);
  }

  stopSpeaking(): void {
    const active = this.active;
    this.active = null;
    const pending = this.queue.splice(0);
    clearTimeout(active?.timeout);
    active?.controller.abort();
    active?.resolve();
    for (const job of pending) {
      clearTimeout(job.timeout);
      job.controller.abort();
      job.resolve();
    }
  }

  audioContext(): AudioContext {
    if (!sharedContext || sharedContext.state === 'closed') {
      const Context = globalThis.AudioContext ??
        (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error('WebAudio is unavailable');
      sharedContext = new Context();
      if (this.paused) void sharedContext.suspend().catch(() => {});
    }
    return sharedContext;
  }

  sfx(name: SfxName): void {
    if (this.paused) return;
    try {
      const context = this.audioContext();
      if (context.state !== 'running') return;
      if (!this.master || this.master.context !== context) {
        this.master = context.createGain();
        this.master.gain.setValueAtTime(0.2 * this.volume, context.currentTime);
        this.master.connect(context.destination);
      }
      for (const tone of TONES[name]) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const start = context.currentTime + tone.start;
        const end = start + tone.duration;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.linearRampToValueAtTime(0.3, start + 0.02);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(envelope);
        envelope.connect(this.master);
        oscillator.onended = () => {
          oscillator.disconnect();
          envelope.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(end);
      }
    } catch {
      // 不可用的音频设备不阻塞活动。
    }
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    try { this.playback?.pause(); } catch { /* 设备异常时仍需暂停共享音频。 */ }
    // song 等插件直接使用同一 context，必须一起暂停。
    if (sharedContext && sharedContext.state !== 'closed') {
      void sharedContext.suspend().catch(() => {});
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (sharedContext && sharedContext.state !== 'closed') {
      void sharedContext.resume().catch(() => {});
    }
    try { this.playback?.resume(); } catch { /* 设备异常不阻塞后续队列。 */ }
    if (this.synthesisToResume) {
      try { this.synthesisToResume.resume(); } catch { /* 语音设备可能已关闭。 */ }
      this.synthesisToResume = null;
    }
    for (const resume of [...this.resumeWaiters]) resume();
    this.pump();
  }

  private enqueue(run: Job['run'], interrupt: boolean): Promise<void> {
    if (interrupt) this.stopSpeaking();
    return new Promise<void>((resolve) => {
      this.queue.push({ controller: new AbortController(), run, resolve });
      this.pump();
    });
  }

  private pump(): void {
    if (this.active || this.paused) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    const finish = () => {
      clearTimeout(job.timeout);
      job.resolve();
      if (this.active !== job) return;
      this.active = null;
      this.pump();
    };
    // 同时约束整次双语任务，浏览器漏发 ended/error 也不会堵住队列。
    job.timeout = setTimeout(() => {
      job.controller.abort();
      finish();
    }, SPEECH_TIMEOUT_MS);
    void job.run(job.controller.signal).catch(() => {}).finally(finish);
  }

  private whenResumed(signal: AbortSignal): Promise<void> {
    if (!this.paused || signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const finish = () => {
        this.resumeWaiters.delete(finish);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      this.resumeWaiters.add(finish);
      signal.addEventListener('abort', finish, { once: true });
    });
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0 || signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let remaining = ms;
      let started = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        if (this.playback === playback) this.playback = null;
        resolve();
      };
      const playback: Playback = {
        pause: () => {
          if (timer === undefined) return;
          remaining = Math.max(0, remaining - (Date.now() - started));
          clearTimeout(timer);
          timer = undefined;
        },
        resume: () => {
          if (finished || timer !== undefined) return;
          started = Date.now();
          timer = setTimeout(finish, remaining);
        },
        volume: () => {},
      };
      this.playback = playback;
      signal.addEventListener('abort', finish, { once: true });
      if (!this.paused) playback.resume();
    });
  }

  private playMedia(url: string, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted || typeof globalThis.Audio !== 'function') return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let audio: HTMLAudioElement;
      try {
        audio = new Audio(url);
      } catch {
        resolve(false);
        return;
      }
      let finished = false;
      let playAttempt = 0;
      const timeout = setTimeout(() => finish(false), SPEECH_TIMEOUT_MS);
      const finish = (played: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        playAttempt += 1;
        audio.removeEventListener('ended', onEnd);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('abort', onError);
        signal.removeEventListener('abort', onAbort);
        if (this.playback === playback) this.playback = null;
        audio.pause();
        audio.removeAttribute('src');
        resolve(played);
      };
      const onEnd = () => finish(true);
      const onError = () => finish(false);
      const onAbort = () => finish(false);
      const play = () => {
        if (finished || signal.aborted || this.paused) return;
        const attempt = ++playAttempt;
        try {
          void Promise.resolve(audio.play()).catch(() => {
            if (attempt === playAttempt) finish(false);
          });
        } catch {
          finish(false);
        }
      };
      const playback: Playback = {
        pause: () => {
          // pause() 会拒绝尚未完成的 play()，这不是播放失败。
          playAttempt += 1;
          audio.pause();
        },
        resume: play,
        volume: (value) => { audio.volume = value; },
      };
      this.playback = playback;
      audio.volume = this.volume;
      audio.preload = 'auto';
      audio.addEventListener('ended', onEnd);
      audio.addEventListener('error', onError);
      audio.addEventListener('abort', onError);
      signal.addEventListener('abort', onAbort, { once: true });
      play();
    });
  }

  private synthesize(lang: Lang, text: string, signal: AbortSignal): Promise<void> {
    const synthesis = globalThis.speechSynthesis;
    if (signal.aborted || !synthesis || typeof globalThis.SpeechSynthesisUtterance !== 'function') {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      let finished = false;
      const timeout = setTimeout(() => finish(true), SPEECH_TIMEOUT_MS);
      const finish = (cancel = false) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        utterance.onend = null;
        utterance.onerror = null;
        signal.removeEventListener('abort', onAbort);
        if (this.playback === playback) this.playback = null;
        if (cancel) {
          try { synthesis.cancel(); } catch { /* 浏览器已关闭语音设备。 */ }
        }
        resolve();
      };
      const onAbort = () => finish(true);
      const playback: Playback = {
        pause: () => {
          this.synthesisToResume = synthesis;
          synthesis.pause();
        },
        resume: () => {
          synthesis.resume();
          this.synthesisToResume = null;
        },
        volume: (value) => { utterance.volume = value; },
      };
      this.playback = playback;
      signal.addEventListener('abort', onAbort, { once: true });
      utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
      utterance.rate = 0.85;
      utterance.pitch = 1.05;
      utterance.volume = this.volume;
      utterance.onend = () => finish();
      utterance.onerror = () => finish();
      try {
        const voices = synthesis.getVoices();
        const voice = voices.find((item) => item.lang.toLowerCase() === utterance.lang.toLowerCase()) ??
          voices.find((item) => item.lang.toLowerCase().startsWith(`${lang}-`));
        if (voice) utterance.voice = voice;
        synthesis.speak(utterance);
        if (this.paused) playback.pause();
      } catch {
        finish();
      }
    });
  }
}
