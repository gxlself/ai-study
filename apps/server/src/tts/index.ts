import { createHash, randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { AudioManifest, SCHEMA_VERSION, speechKey, type Lang, type Lesson } from '@sprout/schema';
import { collectLessonSpeech } from './lesson-speech';
import { MacOsSayProvider } from './macos-say';
import { normalizeTtsText, TtsError, type TtsProvider, type TtsSettings, type TtsVoices } from './provider';

export { MacOsSayProvider } from './macos-say';
export type { MacOsSayOptions, TtsCommandRunner } from './macos-say';
export { collectLessonSpeech, MAX_LESSON_SPEECHES } from './lesson-speech';
export { TtsError, MAX_TTS_TEXT_LENGTH } from './provider';
export type { TtsProvider, TtsProviderStatus, TtsSettings, TtsSynthesis, TtsVoices } from './provider';

export interface TtsServiceOptions {
  dataDir: string;
  getSettings: () => TtsSettings;
  /** 可注入其它实现，也供测试隔离本机语音命令。 */
  provider?: TtsProvider;
}

export interface TtsStatus {
  available: boolean;
  provider: string;
  voices: TtsVoices;
}

interface Request {
  lang: Lang;
  text: string;
  settings: TtsSettings;
  onlyMissing: boolean;
}

export const MAX_PENDING_TTS_TASKS = 32;

export class TtsService {
  private readonly dataDir: string;
  private readonly customDir: string;
  private readonly provider: TtsProvider;
  private readonly getSettings: () => TtsSettings;
  private readonly pending = new Map<string, Promise<{ url: string }>>();
  private readonly probes = new Set<Promise<TtsStatus>>();
  private tail: Promise<void> = Promise.resolve();
  private closing?: Promise<void>;
  private closed = false;

  constructor(options: TtsServiceOptions) {
    this.dataDir = resolve(options.dataDir);
    this.customDir = join(this.dataDir, 'custom');
    this.getSettings = options.getSettings;
    this.provider = options.provider ?? new MacOsSayProvider();
  }

  status(): Promise<TtsStatus> {
    if (this.closed) return Promise.resolve({ available: false, provider: 'none', voices: { zh: [], en: [] } });
    let settings: TtsSettings;
    try { settings = this.settings(); } catch (error) { return Promise.reject(error); }
    const task = this.providerStatus(settings);
    this.probes.add(task);
    void task.then(() => this.probes.delete(task), () => this.probes.delete(task));
    return task;
  }

  generate(lang: Lang, text: string): Promise<{ url: string }> {
    return this.schedule(lang, text, false);
  }

  enqueueLesson(lesson: Lesson): void {
    if (this.closed) return;
    for (const speech of collectLessonSpeech(lesson)) {
      // 后台音频是可选增强，失败仍由播放端按契约回退，不阻止课程保存。
      void this.schedule(speech.lang, speech.text, true).catch(() => undefined);
    }
  }

  close(): Promise<void> {
    if (!this.closing) {
      this.closed = true;
      this.closing = (async () => {
        await this.tail;
        await Promise.allSettled([...this.probes]);
        try { await this.provider.close?.(); }
        catch (cause) { throw new TtsError(500, 'TTS_CLOSE_FAILED', '朗读服务关闭失败', { cause }); }
      })();
    }
    return this.closing;
  }

  private settings(): TtsSettings {
    try {
      const settings = this.getSettings();
      if (!['auto', 'macos-say', 'none'].includes(settings.ttsProvider) ||
          typeof settings.ttsVoices.zh !== 'string' || typeof settings.ttsVoices.en !== 'string') {
        throw new Error('invalid settings');
      }
      return { ttsProvider: settings.ttsProvider, ttsVoices: { ...settings.ttsVoices } };
    } catch (cause) {
      throw new TtsError(500, 'TTS_SETTINGS_ERROR', '朗读设置不可用', { cause });
    }
  }

  private async providerStatus(settings: TtsSettings): Promise<TtsStatus> {
    if (settings.ttsProvider === 'none') return { available: false, provider: 'none', voices: { zh: [], en: [] } };
    if (settings.ttsProvider === 'macos-say' && this.provider.id !== 'macos-say') {
      return { available: false, provider: 'macos-say', voices: { zh: [], en: [] } };
    }
    try {
      const status = await this.provider.status();
      const voices = { zh: [...status.voices.zh], en: [...status.voices.en] };
      const available = status.available && (['zh', 'en'] as const).every((lang) =>
        voices[lang].length > 0 && (!settings.ttsVoices[lang] || voices[lang].includes(settings.ttsVoices[lang])));
      return { available, provider: this.provider.id, voices };
    } catch {
      return { available: false, provider: this.provider.id, voices: { zh: [], en: [] } };
    }
  }

  private schedule(lang: Lang, text: string, onlyMissing: boolean): Promise<{ url: string }> {
    try {
      if (this.closed) throw new TtsError(503, 'TTS_CLOSED', '朗读服务已关闭');
      if (lang !== 'zh' && lang !== 'en') throw new TtsError(400, 'TTS_INVALID_INPUT', '朗读语言须为 zh 或 en');
      text = normalizeTtsText(text);
      const settings = this.settings();
      if (settings.ttsProvider === 'none') throw new TtsError(503, 'TTS_UNAVAILABLE', '朗读服务已禁用');
      const key = JSON.stringify([settings, lang, text, onlyMissing]);
      const existing = this.pending.get(key);
      if (existing) return existing;
      if (this.pending.size >= MAX_PENDING_TTS_TASKS) throw new TtsError(429, 'TTS_BUSY', '朗读任务较多，请稍后再试');
      const task = this.tail.then(() => this.perform({ lang, text, settings, onlyMissing })).catch((cause: unknown) => {
        if (cause instanceof TtsError) throw cause;
        throw new TtsError(500, 'TTS_STORAGE_ERROR', '朗读音频或清单写入失败', { cause });
      });
      this.pending.set(key, task);
      // 串行生成也串行合并清单，避免不同文本并发时覆盖彼此的 entries。
      this.tail = task.then(() => undefined, () => undefined);
      void task.then(() => this.pending.delete(key), () => this.pending.delete(key));
      return task;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private async perform({ lang, text, settings, onlyMissing }: Request): Promise<{ url: string }> {
    if (this.settings().ttsProvider === 'none') throw new TtsError(503, 'TTS_UNAVAILABLE', '朗读服务已禁用');
    const key = speechKey(lang, text);
    const manifest = await this.readManifest();
    const previous = manifest.entries[key];
    if (onlyMissing && previous && this.insideCustom(previous)) {
      this.assertSafePath(join(this.customDir, previous));
      if (await hasAudio(join(this.customDir, previous))) return { url: packUrl(previous) };
    }

    const status = await this.providerStatus(settings);
    if (!status.available) throw new TtsError(503, 'TTS_UNAVAILABLE', '本机朗读服务或所选语言声音不可用');
    const preferred = lang === 'zh' ? 'Tingting' : 'Samantha';
    const voice = settings.ttsVoices[lang] ||
      (status.voices[lang].includes(preferred) ? preferred : status.voices[lang][0]);
    const hash = createHash('sha256').update(JSON.stringify([1, this.provider.id, voice, key])).digest('hex');
    const packPath = `audio/tts/${lang}/${hash}.m4a`;
    const cached = join(this.dataDir, 'tts', lang, `${hash}.m4a`);
    const published = join(this.customDir, packPath);
    this.assertSafePath(cached);
    this.assertSafePath(published);
    await mkdir(dirname(cached), { recursive: true, mode: 0o700 });
    await mkdir(dirname(published), { recursive: true, mode: 0o700 });

    if (!await hasAudio(cached)) {
      if (await hasAudio(published)) {
        await atomicCopy(published, cached);
      } else {
        const work = await mkdtemp(join(dirname(cached), '.tts-'));
        try {
          const outputPath = join(work, 'speech.m4a');
          if (this.settings().ttsProvider === 'none') throw new TtsError(503, 'TTS_UNAVAILABLE', '朗读服务已禁用');
          try { await this.provider.synthesize({ lang, text, voice, outputPath }); }
          catch (cause) {
            if (cause instanceof TtsError) throw cause;
            throw new TtsError(502, 'TTS_GENERATION_FAILED', '朗读音频生成失败', { cause });
          }
          if (!await hasAudio(outputPath)) throw new TtsError(502, 'TTS_GENERATION_FAILED', '朗读服务未生成有效音频文件');
          await rename(outputPath, cached);
        } finally {
          await rm(work, { recursive: true, force: true });
        }
      }
    }
    if (!await hasAudio(published)) await atomicCopy(cached, published);

    // 合成可能较慢，提交时重新读取，保留期间导入或恢复的其它音频条目。
    const latest = await this.readManifest();
    if (latest.entries[key] !== packPath || latest.voices[lang] !== voice) {
      latest.entries[key] = packPath;
      latest.voices[lang] = voice;
      await this.writeManifest(latest);
    }
    return { url: packUrl(packPath) };
  }

  private insideCustom(path: string): boolean {
    const child = relative(this.customDir, resolve(this.customDir, path));
    return !!child && child !== '..' && !child.startsWith(`..${sep}`) && !path.includes('\\');
  }

  private async readManifest(): Promise<AudioManifest> {
    this.assertSafePath(join(this.customDir, 'audio', 'manifest.json'));
    let data: string;
    try { data = await readFile(join(this.customDir, 'audio', 'manifest.json'), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { schemaVersion: SCHEMA_VERSION, voices: {}, entries: {} };
      }
      throw error;
    }
    try { return AudioManifest.parse(JSON.parse(data)); }
    catch (cause) {
      throw new TtsError(500, 'TTS_MANIFEST_INVALID', '自定义内容包音频清单损坏，请检查后重试', { cause });
    }
  }

  private async writeManifest(manifest: AudioManifest): Promise<void> {
    const path = join(this.customDir, 'audio', 'manifest.json');
    this.assertSafePath(path);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private assertSafePath(target: string): void {
    const path = relative(this.dataDir, target);
    if (!path || path === '..' || path.startsWith(`..${sep}`) || resolve(this.dataDir, path) !== target) {
      throw new TtsError(400, 'TTS_UNSAFE_PATH', '朗读文件必须位于数据目录内');
    }
    let current = this.dataDir;
    for (const part of ['', ...path.split(sep)]) {
      if (part) current = join(current, part);
      try {
        if (lstatSync(current).isSymbolicLink()) throw new TtsError(400, 'TTS_UNSAFE_PATH', '朗读文件路径不允许符号链接');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
    }
  }
}

async function hasAudio(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function atomicCopy(source: string, target: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await copyFile(source, temporary);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

function packUrl(path: string): string {
  return `/packs/sprout.custom/${path.split('/').map(encodeURIComponent).join('/')}`;
}
