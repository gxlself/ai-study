import type { SongProps } from '@sprout/schema';

export interface ParsedNote {
  pitch: string;
  midi: number | null;
  frequency: number | null;
  beats: number;
  durationMs: number;
  offsetMs: number;
}

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 按契约解析音符；拒绝零拍、非有限值，避免播放器忙循环。 */
export function parseNotes(source: string, bpm = 90): ParsedNote[] {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('bpm 必须为正数');
  const text = source.trim();
  if (!text) throw new SyntaxError('旋律不能为空');
  const token = /([A-G](?:#|b)?[2-6]|R)\/(\d+(?:\.\d+)?)\s*/y;
  const notes: ParsedNote[] = [];
  let offsetMs = 0;
  while (token.lastIndex < text.length) {
    const position = token.lastIndex;
    const match = token.exec(text);
    if (!match) throw new SyntaxError(`无效音符，位置 ${position + 1}`);
    const pitch = match[1];
    const beats = Number(match[2]);
    const durationMs = beats * 60_000 / bpm;
    if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(offsetMs + durationMs)) {
      throw new RangeError('音符拍数必须为有限正数');
    }
    const midi = pitch === 'R' ? null
      : (Number(pitch.at(-1)) + 1) * 12 + SEMITONES[pitch[0]]
        + (pitch.includes('#') ? 1 : pitch.includes('b') ? -1 : 0);
    notes.push({
      pitch,
      midi,
      frequency: midi === null ? null : 440 * 2 ** ((midi - 69) / 12),
      beats,
      durationMs,
      offsetMs,
    });
    offsetMs += durationMs;
  }
  return notes;
}

export interface SongPosition {
  line: number;
  noteIndex: number;
  repetition: number;
  note: ParsedNote;
}

export interface SongPlayer {
  resume(): void;
  pause(): void;
  stop(): void;
  readonly playing: boolean;
  readonly finished: boolean;
}

interface SongPlayerOptions {
  audio: AudioContext;
  lines: SongProps['lines'];
  bpm: number;
  instrument: SongProps['instrument'];
  repeat: number;
  signal: AbortSignal;
  delay(ms: number, signal: AbortSignal): Promise<void>;
  onNote(position: SongPosition): void;
  onFinish(): void;
  onError?(error: unknown): void;
}

function voice(
  audio: AudioContext,
  output: GainNode,
  frequency: number,
  durationMs: number,
  instrument: SongProps['instrument'],
): () => void {
  const partials: Array<[OscillatorType, number, number]> = instrument === 'musicbox'
    ? [['sine', 1, 0.72], ['sine', 2, 0.2], ['sine', 3, 0.08]]
    : instrument === 'piano'
      ? [['triangle', 1, 0.72], ['sine', 2, 0.28]]
      : [[instrument === 'marimba' ? 'triangle' : 'sine', 1, 1]];
  const nodes: Array<{ oscillator: OscillatorNode; gain: GainNode }> = [];
  const now = audio.currentTime;
  const duration = Math.max(0.001, durationMs / 1000);
  const attack = Math.min(instrument === 'flute' ? 0.08 : 0.012, duration / 4);
  const dispose = () => {
    for (const { oscillator, gain } of nodes.splice(0)) {
      try { oscillator.stop(); } catch { /* 节点可能已自然结束。 */ }
      oscillator.disconnect();
      gain.disconnect();
    }
  };
  try {
    for (const [type, ratio, amplitude] of partials) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      nodes.push({ oscillator, gain });
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * ratio, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(amplitude, now + attack);
      if (instrument === 'flute') {
        gain.gain.setValueAtTime(amplitude * 0.8, now + duration * 0.75);
        gain.gain.linearRampToValueAtTime(0.0001, now + duration);
      } else {
        const decay = instrument === 'marimba' ? 0.24 : instrument === 'musicbox' ? 0.5 : 0.85;
        gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(duration, decay));
      }
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}

/** 暂停只停止本曲节点并保存当前音符剩余时长，不操作宿主音频上下文。 */
export function createSongPlayer(options: SongPlayerOptions): SongPlayer {
  const { audio, signal, instrument, onNote, onFinish } = options;
  const score = options.lines.map((line) => parseNotes(line.notes, options.bpm));
  if (!score.length || !Number.isInteger(options.repeat) || options.repeat < 1) {
    throw new RangeError('歌曲需要至少一行和一次演唱');
  }
  const timeline: SongPosition[] = [];
  for (let repetition = 0; repetition < options.repeat; repetition += 1) {
    score.forEach((notes, line) => {
      notes.forEach((note, noteIndex) => timeline.push({ line, noteIndex, repetition, note }));
    });
  }
  let index = 0;
  let remaining = timeline[0].note.durationMs;
  let startedAt = 0;
  let timer: AbortController | undefined;
  let disposeVoice: (() => void) | undefined;
  let playing = false;
  let wanted = false;
  let disposed = false;
  let finished = false;
  const output = audio.createGain();
  output.gain.setValueAtTime(0.18, audio.currentTime);
  output.connect(audio.destination);

  const halt = () => {
    if (playing) remaining = Math.max(0, remaining - (performance.now() - startedAt));
    playing = false;
    timer?.abort();
    timer = undefined;
    disposeVoice?.();
    disposeVoice = undefined;
  };
  const stop = () => {
    if (disposed) return;
    disposed = true;
    wanted = false;
    halt();
    output.disconnect();
    signal.removeEventListener('abort', stop);
    audio.removeEventListener('statechange', stateChanged);
  };
  const start = () => {
    if (disposed || signal.aborted || playing || !wanted || audio.state !== 'running') return;
    playing = true;
    startedAt = performance.now();
    const position = timeline[index];
    try {
      if (position.note.frequency !== null && remaining > 0) {
        disposeVoice = voice(audio, output, position.note.frequency, remaining, instrument);
      }
      onNote(position);
    } catch (error) {
      stop();
      throw error;
    }
    const waiting = new AbortController();
    timer = waiting;
    void options.delay(remaining, waiting.signal).then(() => {
      if (waiting.signal.aborted || disposed || signal.aborted) return;
      playing = false;
      timer = undefined;
      disposeVoice?.();
      disposeVoice = undefined;
      if (disposed || signal.aborted) return;
      index += 1;
      if (index === timeline.length) {
        finished = true;
        stop();
        onFinish();
      } else {
        remaining = timeline[index].note.durationMs;
        try { start(); } catch (error) { options.onError?.(error); }
      }
    }, (error: unknown) => {
      if (waiting.signal.aborted || disposed || signal.aborted) return;
      stop();
      options.onError?.(error);
    });
  };
  function stateChanged() {
    if (audio.state === 'running') {
      try { start(); } catch (error) { options.onError?.(error); }
    }
    else halt();
  }
  signal.addEventListener('abort', stop, { once: true });
  audio.addEventListener('statechange', stateChanged);
  if (signal.aborted) stop();
  return {
    resume() { wanted = true; start(); },
    pause() { wanted = false; halt(); },
    stop,
    get playing() { return playing; },
    get finished() { return finished; },
  };
}
