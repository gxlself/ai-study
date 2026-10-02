import { createMockContext } from '@sprout/plugin-sdk';
import type {
  ActivityContext, ActivityResult, InputMode,
} from '@sprout/plugin-sdk';
import { speechParts, type LanguageMode } from '@sprout/schema';
import { concepts } from './samples';

export interface PreviewOptions {
  inputMode: InputMode;
  languageMode: LanguageMode;
  reducedMotion: boolean;
  signal: AbortSignal;
  focus: ActivityContext['focus'];
  log(type: string, data?: Record<string, unknown>): void;
  complete(result?: ActivityResult): void;
  setParentHint(text: string | null): void;
}

// SDK 接入只集中在此处；locale/input 使用局部 overrides，不复制 SDK 的词库与语言实现。
export function createPreviewContext<P>(props: P, options: PreviewOptions) {
  let audio: AudioContext | undefined;
  let closed = false;
  let paused = false;
  const ctx = createMockContext(props, {
    concepts,
    locale: { mode: options.languageMode },
    input: { mode: options.inputMode },
    reducedMotion: options.reducedMotion,
    signal: options.signal,
    focus: options.focus,
    complete: options.complete,
    log: options.log,
    setParentHint: options.setParentHint,
    resolveAsset: (path: string) => new URL(path, window.location.href).href,
    async speak(speech, settings) {
      if (!options.signal.aborted) options.log('speech', {
        parts: speechParts(speech, settings?.mode ?? options.languageMode),
      });
    },
    async say(lang, text) {
      if (!options.signal.aborted) options.log('say', { lang, text });
    },
    sfx(name) { if (!options.signal.aborted) options.log('sfx', { name }); },
    async playAudio(url) { if (!options.signal.aborted) options.log('audio', { url }); },
    audioContext() {
      if (closed || options.signal.aborted) throw new DOMException('活动已停止', 'AbortError');
      audio ??= new AudioContext();
      return audio;
    },
  });
  function audioError(error: unknown) {
    if (!closed) options.log('audio:error', { message: error instanceof Error ? error.message : String(error) });
  }
  return {
    ctx,
    unlockAudio() {
      if (!closed && !paused && audio?.state === 'suspended') void audio.resume().catch(audioError);
    },
    pauseAudio() {
      paused = true;
      ctx.stopSpeaking();
      if (audio && audio.state !== 'closed') void audio.suspend().catch(audioError);
    },
    resumeAudio() {
      paused = false;
      if (!closed && audio?.state === 'suspended') void audio.resume().catch(audioError);
    },
    closeAudio() {
      if (closed) return;
      closed = true;
      ctx.stopSpeaking();
      if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
    },
  };
}
