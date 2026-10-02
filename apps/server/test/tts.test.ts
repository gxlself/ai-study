import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManifest, Lesson, speechKey } from '@sprout/schema';
import {
  collectLessonSpeech, MacOsSayProvider, MAX_LESSON_SPEECHES, MAX_TTS_TEXT_LENGTH, TtsService,
  type TtsCommandRunner, type TtsProvider, type TtsSettings, type TtsSynthesis,
} from '../src/tts';

const voices = { zh: ['Tingting', 'Meijia'], en: ['Samantha', 'Alex (English)'] };
const voiceOutput = [
  'Tingting            zh_CN    # 你好',
  'Meijia              zh_TW    # 你好',
  'Samantha            en_US    # Hello',
  'Alex (English)      en_GB    # Hello',
  'Tingting            zh_CN    # 重复',
  'Thomas              fr_FR    # Bonjour',
  'malformed line',
].join('\n');

let dataDir: string;
let settings: TtsSettings;
let services: TtsService[];

function fakeProvider() {
  return {
    id: 'macos-say',
    status: vi.fn(async () => ({ available: true, voices })),
    synthesize: vi.fn(async (input: TtsSynthesis) => {
      await writeFile(input.outputPath, `fake-m4a:${input.voice}:${input.text}`);
    }),
    close: vi.fn(async () => undefined),
  } satisfies TtsProvider;
}

function service(provider: TtsProvider = fakeProvider()): TtsService {
  const instance = new TtsService({ dataDir, getSettings: () => settings, provider });
  services.push(instance);
  return instance;
}

function lesson(props: Record<string, unknown>): Lesson {
  return Lesson.parse({
    schemaVersion: 1, id: 'custom.tts', title: { zh: '不读课程标题', en: 'Lesson metadata' },
    summary: { zh: '不读摘要' }, objectives: [{ zh: '不读目标' }], ageRange: [12, 24],
    domains: ['language'], durationMin: 3, coView: 'required',
    parentGuide: { intro: '不读家长导语', phrases: [{ zh: '不读家长例句' }] },
    offline: [{ title: '线下', steps: ['不读线下提示'] }],
    steps: [{ type: 'example.speech', title: { zh: '不读步骤标题' }, parentTip: '不读家长提示', props }],
  });
}

async function manifest() {
  return AudioManifest.parse(JSON.parse(await readFile(join(dataDir, 'custom/audio/manifest.json'), 'utf8')));
}

function pathForUrl(url: string) {
  return join(dataDir, 'custom', decodeURIComponent(url.slice('/packs/sprout.custom/'.length)));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function macProvider(run: TtsCommandRunner, platform: NodeJS.Platform = 'darwin') {
  return new MacOsSayProvider({ platform, runCommand: run, checkExecutable: async () => undefined });
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'sprout-tts-'));
  settings = { ttsProvider: 'auto', ttsVoices: { zh: '', en: '' } };
  services = [];
});

afterEach(async () => {
  await Promise.allSettled(services.map((instance) => instance.close()));
  await rm(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('TtsService', () => {
  it('rejects linked cache or manifest directories before writing outside data', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sprout-tts-outside-'));
    try {
      await mkdir(join(dataDir, 'custom'), { recursive: true });
      await symlink(outside, join(dataDir, 'custom/audio'));
      await expect(service().generate('en', 'Hello')).rejects.toMatchObject({ statusCode: 400, code: 'TTS_UNSAFE_PATH' });
      expect(await readdir(outside)).toEqual([]);
      await rm(join(dataDir, 'custom/audio'));
      await symlink(outside, join(dataDir, 'tts'));
      await expect(service().generate('en', 'Hello')).rejects.toMatchObject({ code: 'TTS_UNSAFE_PATH' });
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
  it('reports installed voices and honors none, explicit provider and live voice settings', async () => {
    const provider = fakeProvider();
    const tts = service(provider);
    expect(await tts.status()).toEqual({ available: true, provider: 'macos-say', voices });
    settings.ttsProvider = 'none';
    expect(await tts.status()).toEqual({ available: false, provider: 'none', voices: { zh: [], en: [] } });
    await expect(tts.generate('zh', '你好')).rejects.toMatchObject({ statusCode: 503, code: 'TTS_UNAVAILABLE' });
    expect(provider.status).toHaveBeenCalledTimes(1);
    settings.ttsProvider = 'macos-say';
    settings.ttsVoices.en = 'Not installed';
    expect((await tts.status()).available).toBe(false);
    await expect(tts.generate('en', 'Hello')).rejects.toMatchObject({ statusCode: 503, code: 'TTS_UNAVAILABLE' });
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('supports a pluggable provider in auto but does not mislabel explicit macos-say', async () => {
    const provider = { ...fakeProvider(), id: 'test-provider' };
    const tts = service(provider);
    expect((await tts.status()).provider).toBe('test-provider');
    await tts.generate('en', 'Hello');
    settings.ttsProvider = 'macos-say';
    expect(await tts.status()).toEqual({ available: false, provider: 'macos-say', voices: { zh: [], en: [] } });
  });

  it('treats failed probes and missing language voices as unavailable', async () => {
    const provider = fakeProvider();
    provider.status.mockRejectedValueOnce(new Error('probe failed'));
    const tts = service(provider);
    expect((await tts.status()).available).toBe(false);
    provider.status.mockResolvedValue({ available: true, voices: { zh: [], en: ['Samantha'] } });
    await expect(tts.generate('zh', '你好')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('writes both cache and custom-pack M4A and merges the canonical manifest key', async () => {
    await mkdir(join(dataDir, 'custom/audio'), { recursive: true });
    await writeFile(join(dataDir, 'custom/audio/manifest.json'), JSON.stringify({
      schemaVersion: 1, voices: { fr: 'Thomas' }, entries: { 'en:Keep me': 'audio/keep.m4a' },
    }));
    const provider = fakeProvider();
    const result = await service(provider).generate('zh', '  一起\n  慢慢呼吸  ');
    expect(result.url).toMatch(/^\/packs\/sprout\.custom\/audio\/tts\/zh\/[a-f0-9]{64}\.m4a$/u);
    const published = pathForUrl(result.url);
    const cache = join(dataDir, 'tts/zh', published.split('/').at(-1)!);
    expect(await readFile(published, 'utf8')).toBe(await readFile(cache, 'utf8'));
    const audio = await manifest();
    expect(audio.entries[speechKey('zh', '一起 慢慢呼吸')]).toBe(result.url.replace('/packs/sprout.custom/', ''));
    expect(audio.entries['en:Keep me']).toBe('audio/keep.m4a');
    expect(audio.voices).toEqual({ fr: 'Thomas', zh: 'Tingting' });
    expect(provider.synthesize.mock.calls[0][0].text).toBe('一起 慢慢呼吸');
  });

  it('deduplicates normalized concurrent requests and reuses cache across service restarts', async () => {
    const provider = fakeProvider();
    const first = service(provider);
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      first.generate('en', index % 2 ? ' Hello\n world ' : 'Hello world')));
    expect(new Set(results.map((result) => result.url)).size).toBe(1);
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
    await first.close();
    const restartedProvider = fakeProvider();
    expect(await service(restartedProvider).generate('en', 'Hello world')).toEqual(results[0]);
    expect(restartedProvider.synthesize).not.toHaveBeenCalled();
  });

  it('serializes different texts and preserves every manifest entry', async () => {
    const provider = fakeProvider();
    let active = 0;
    let peak = 0;
    provider.synthesize.mockImplementation(async (input) => {
      peak = Math.max(peak, ++active);
      await writeFile(input.outputPath, 'fake-m4a');
      active--;
    });
    const tts = service(provider);
    await Promise.all(Array.from({ length: 16 }, (_, index) => tts.generate(index % 2 ? 'zh' : 'en', `text ${index}`)));
    expect(Object.keys((await manifest()).entries)).toHaveLength(16);
    expect(peak).toBe(1);
  });

  it('preserves manifest entries written while synthesis is running', async () => {
    const provider = fakeProvider();
    provider.synthesize.mockImplementationOnce(async (input) => {
      await writeFile(join(dataDir, 'custom/audio/manifest.json'), JSON.stringify({
        schemaVersion: 1, voices: { zh: 'Recorded' }, entries: { 'zh:保留录音': 'audio/recorded.m4a' },
      }));
      await writeFile(input.outputPath, 'fake-m4a');
    });
    await service(provider).generate('en', 'Hello');
    expect((await manifest()).entries['zh:保留录音']).toBe('audio/recorded.m4a');
    expect(Object.keys((await manifest()).entries)).toHaveLength(2);
    expect((await manifest()).voices.zh).toBe('Recorded');
  });

  it('separates languages, providers and voices in the cache identity', async () => {
    const provider = fakeProvider();
    const tts = service(provider);
    const first = await tts.generate('en', 'Hello');
    settings.ttsVoices.en = 'Alex (English)';
    const second = await tts.generate('en', 'Hello');
    const third = await tts.generate('zh', 'Hello');
    const other = await service({ ...fakeProvider(), id: 'other' }).generate('en', 'Hello');
    expect(new Set([first.url, second.url, third.url, other.url]).size).toBe(4);
    expect((await manifest()).voices.en).toBe('Alex (English)');
  });

  it('repairs missing published/cache files and manifest without resynthesizing', async () => {
    const provider = fakeProvider();
    const tts = service(provider);
    const first = await tts.generate('zh', '你好');
    await rm(pathForUrl(first.url));
    await rm(join(dataDir, 'custom/audio/manifest.json'));
    expect(await tts.generate('zh', '你好')).toEqual(first);
    expect((await stat(pathForUrl(first.url))).size).toBeGreaterThan(0);
    await rm(join(dataDir, 'tts'), { recursive: true });
    expect(await tts.generate('zh', '你好')).toEqual(first);
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
    expect((await manifest()).entries['zh:你好']).toBeDefined();
  });

  it('invalidates empty files and never publishes incomplete synthesis', async () => {
    const provider = fakeProvider();
    const tts = service(provider);
    provider.synthesize.mockImplementationOnce(async (input) => { await writeFile(input.outputPath, ''); });
    await expect(tts.generate('zh', '你好')).rejects.toMatchObject({ code: 'TTS_GENERATION_FAILED', statusCode: 502 });
    expect(await readdir(join(dataDir, 'tts/zh'))).toEqual([]);
    expect(await readdir(join(dataDir, 'custom/audio/tts/zh'))).toEqual([]);
    await expect(readFile(join(dataDir, 'custom/audio/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await tts.generate('zh', '你好');
    expect(provider.synthesize).toHaveBeenCalledTimes(2);
  });

  it('leaves a corrupt manifest untouched and can retry after it is repaired', async () => {
    await mkdir(join(dataDir, 'custom/audio'), { recursive: true });
    await writeFile(join(dataDir, 'custom/audio/manifest.json'), '{invalid');
    const provider = fakeProvider();
    const tts = service(provider);
    await expect(tts.generate('en', 'Hello')).rejects.toMatchObject({ statusCode: 500, code: 'TTS_MANIFEST_INVALID' });
    expect(await readFile(join(dataDir, 'custom/audio/manifest.json'), 'utf8')).toBe('{invalid');
    expect(provider.synthesize).not.toHaveBeenCalled();
    await rm(join(dataDir, 'custom/audio/manifest.json'));
    await tts.generate('en', 'Hello');
  });

  it.each([
    ['fr', 'Bonjour'], ['zh', ' \n\t'], ['en', '\0bad'], ['en', 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1)],
    ['en', null], ['en', 42],
  ])('rejects invalid input (%s) without touching the provider', async (lang, text) => {
    const provider = fakeProvider();
    await expect(service(provider).generate(lang as 'en', text as string))
      .rejects.toMatchObject({ statusCode: 400, code: 'TTS_INVALID_INPUT' });
    expect(provider.status).not.toHaveBeenCalled();
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('contains command-looking text in hashed paths and rejects uninstalled voices', async () => {
    const provider = fakeProvider();
    const tts = service(provider);
    const result = await tts.generate('en', '-o /tmp/escape; $(echo test) ../../escape');
    expect(result.url).toMatch(/\/en\/[a-f0-9]{64}\.m4a$/u);
    settings.ttsVoices.en = 'Samantha; echo test';
    await expect(tts.generate('en', 'Hello')).rejects.toMatchObject({ statusCode: 503 });
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
  });

  it('waits for every accepted background task on close and rejects new work', async () => {
    const provider = fakeProvider();
    const started = deferred();
    const release = deferred();
    provider.synthesize.mockImplementationOnce(async (input) => {
      started.resolve();
      await release.promise;
      await writeFile(input.outputPath, 'fake-m4a');
    });
    const tts = service(provider);
    tts.enqueueLesson(lesson({ say: { zh: '慢慢呼吸', en: 'Breathe slowly' } }));
    await started.promise;
    let closed = false;
    const closing = tts.close().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(provider.close).not.toHaveBeenCalled();
    await expect(tts.generate('en', 'New')).rejects.toMatchObject({ statusCode: 503, code: 'TTS_CLOSED' });
    tts.enqueueLesson(lesson({ say: { zh: '不接受新任务' } }));
    release.resolve();
    await closing;
    expect(provider.synthesize).toHaveBeenCalledTimes(2);
    expect(Object.keys((await manifest()).entries)).toHaveLength(2);
    await tts.close();
    expect(provider.close).toHaveBeenCalledTimes(1);
    expect((await tts.status()).available).toBe(false);
  });

  it('waits for an active status probe before closing the provider', async () => {
    const provider = fakeProvider();
    const release = deferred();
    provider.status.mockImplementation(async () => {
      await release.promise;
      return { available: true, voices };
    });
    const tts = service(provider);
    const status = tts.status();
    const closing = tts.close();
    await Promise.resolve();
    expect(provider.close).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([status, closing]);
    expect(provider.close).toHaveBeenCalledTimes(1);
  });

  it('does not start queued synthesis after settings change to none', async () => {
    const provider = fakeProvider();
    provider.synthesize.mockImplementationOnce(async (input) => {
      settings.ttsProvider = 'none';
      await writeFile(input.outputPath, 'fake-m4a');
    });
    const tts = service(provider);
    tts.enqueueLesson(lesson({ say: { zh: '第一句', en: 'Hello' } }));
    await tts.close();
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
    expect(Object.keys((await manifest()).entries)).toEqual(['zh:第一句']);
  });

  it('does not synthesize when settings are disabled during the provider probe', async () => {
    const provider = fakeProvider();
    provider.status.mockImplementationOnce(async () => {
      settings.ttsProvider = 'none';
      return { available: true, voices };
    });
    await expect(service(provider).generate('en', 'Hello')).rejects.toMatchObject({ statusCode: 503 });
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('handles background failures, clears failed deduplication and continues queued work', async () => {
    const provider = fakeProvider();
    provider.synthesize.mockRejectedValueOnce(new Error('failed'));
    const tts = service(provider);
    tts.enqueueLesson(lesson({ say: { zh: '第一句', en: 'Hello' } }));
    await tts.generate('zh', '第一句');
    await tts.close();
    expect(provider.synthesize).toHaveBeenCalledTimes(3);
    expect(Object.keys((await manifest()).entries)).toHaveLength(2);
  });

  it('bounds the request queue while still allowing duplicate requests', async () => {
    const provider = fakeProvider();
    const tts = service(provider);
    const tasks = Array.from({ length: 256 }, (_, index) => tts.generate('en', `text ${index}`));
    const overflow = tts.generate('en', 'overflow');
    expect(tts.generate('en', 'text 0')).toBe(tasks[0]);
    settings.ttsProvider = 'none';
    const completed = Promise.allSettled(tasks);
    await expect(overflow).rejects.toMatchObject({ statusCode: 429, code: 'TTS_BUSY' });
    expect((await completed).every((result) => result.status === 'rejected')).toBe(true);
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('preserves existing recorded audio during background fill and regenerates a missing file', async () => {
    await mkdir(join(dataDir, 'custom/audio'), { recursive: true });
    await writeFile(join(dataDir, 'custom/audio/recorded.m4a'), 'recorded');
    await writeFile(join(dataDir, 'custom/audio/manifest.json'), JSON.stringify({
      schemaVersion: 1, entries: { 'zh:你好': 'audio/recorded.m4a', 'en:Hello': 'audio/missing.m4a' },
    }));
    const provider = fakeProvider();
    const tts = service(provider);
    tts.enqueueLesson(lesson({ say: { zh: '你好', en: 'Hello' }, title: { zh: '不读标题' } }));
    await tts.close();
    expect(provider.synthesize).toHaveBeenCalledTimes(1);
    expect((await manifest()).entries['zh:你好']).toBe('audio/recorded.m4a');
    expect((await manifest()).entries['en:Hello']).toMatch(/^audio\/tts\/en\//u);
  });

  it('wraps unavailable settings and storage failures in HTTP-compatible errors', async () => {
    const tts = service();
    settings = undefined as unknown as TtsSettings;
    await expect(tts.generate('en', 'Hello')).rejects.toMatchObject({ statusCode: 500, code: 'TTS_SETTINGS_ERROR' });
    await expect(tts.status()).rejects.toMatchObject({ statusCode: 500, code: 'TTS_SETTINGS_ERROR' });
    settings = { ttsProvider: 'auto', ttsVoices: { zh: '', en: '' } };
    await writeFile(join(dataDir, 'tts'), 'not a directory');
    await expect(tts.generate('en', 'Hello')).rejects.toMatchObject({ statusCode: 500, code: 'TTS_STORAGE_ERROR' });
  });
});

describe('lesson speech collection', () => {
  it('does not synthesize guide instructions intended only for the parent to read', () => {
    const parent = lesson({});
    parent.audience = 'parent';
    parent.steps = [{ type: 'guide', props: { goal: '共同观察', steps: [{ text: '一起看', say: { zh: '这是什么？', en: 'What is it?' } }] } }];
    expect(collectLessonSpeech(parent)).toEqual([]);
  });
  it('collects speech, inline concepts and song lines but excludes metadata and parent-only text', () => {
    const result = collectLessonSpeech(lesson({
      title: { zh: '不读标题' }, summary: { zh: '不读摘要' },
      intro: { zh: '一起看看', en: 'Let us look' },
      pages: [
        { text: { zh: '叶子轻轻动', en: 'The leaf moves' }, prompts: [{ zh: '家长提问' }] },
        { text: { zh: '关闭朗读' }, narrate: false },
      ],
      steps: [{ caption: { zh: '不读替代字幕' }, say: { zh: '先洗手' } }, { caption: { zh: '再擦手' } }],
      items: [{ zh: '叶子', en: 'leaf', pinyin: 'ye zi', image: 'leaf.png', sound: { zh: '沙沙' } }],
      lines: [{ lang: 'en', text: 'Sing softly', notes: 'C4/1' }],
      repeated: { zh: ' 一起看看 ' },
    }));
    const texts = result.map((item) => item.text);
    expect(texts).toEqual([
      '一起看看', 'Let us look', '叶子轻轻动', 'The leaf moves', '先洗手', '再擦手', '叶子', 'leaf', '沙沙', 'Sing softly',
    ]);
  });

  it('does not resolve concept ids or read disabled names', () => {
    expect(collectLessonSpeech(lesson({ items: ['leaf', 'flower'] }))).toEqual([]);
    expect(collectLessonSpeech(lesson({ items: [{ zh: '叶子' }], speak: 'none' }))).toEqual([]);
    expect(collectLessonSpeech(lesson({ items: [{ zh: '叶子' }], sayName: false }))).toEqual([]);
  });

  it('bounds count, depth and traversal and tolerates cycles and malformed text', () => {
    const input = lesson({});
    const cycle: Record<string, unknown> = { say: { zh: '循环中只读一次' } };
    cycle.self = cycle;
    input.steps[0].props = { cycle, invalid: { en: 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1) } };
    expect(collectLessonSpeech(input)).toEqual([{ lang: 'zh', text: '循环中只读一次' }]);
    let deep: Record<string, unknown> = { say: { zh: '太深不遍历' } };
    for (let index = 0; index < 30; index++) deep = { next: deep };
    input.steps[0].props = deep;
    expect(collectLessonSpeech(input)).toEqual([]);
    input.steps[0].props = { items: Array.from({ length: 1000 }, (_, index) => ({ zh: `第${index}句`, en: `line ${index}` })) };
    expect(collectLessonSpeech(input)).toHaveLength(MAX_LESSON_SPEECHES);
    input.steps[0].props = { items: [...Array(5000).fill(null), { zh: '超出节点预算' }] };
    expect(collectLessonSpeech(input)).toEqual([]);
  });
});

describe('MacOsSayProvider (mock commands only)', () => {
  it.each(['linux', 'win32'] as const)('does not invoke commands on %s', async (platform) => {
    const run = vi.fn<TtsCommandRunner>();
    expect(await macProvider(run, platform).status()).toEqual({ available: false, voices: { zh: [], en: [] } });
    expect(run).not.toHaveBeenCalled();
  });

  it('parses multiword voices, deduplicates probes and returns independent arrays', async () => {
    const run = vi.fn<TtsCommandRunner>(async (command) => ({ stdout: command.endsWith('/say') ? voiceOutput : 'formats' }));
    const provider = macProvider(run);
    const [one, two] = await Promise.all([provider.status(), provider.status()]);
    expect(one).toEqual({ available: true, voices });
    one.voices.zh.length = 0;
    expect(two.voices.zh).toEqual(voices.zh);
    expect((await provider.status()).voices).toEqual(voices);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('returns unavailable if an executable cannot be accessed', async () => {
    const run = vi.fn<TtsCommandRunner>();
    const provider = new MacOsSayProvider({
      platform: 'darwin', runCommand: run,
      checkExecutable: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    });
    expect((await provider.status()).available).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['say', 'afconvert', 'voices'])('returns unavailable for missing or broken %s', async (failure) => {
    const run = vi.fn<TtsCommandRunner>(async (command) => {
      if (command.endsWith(`/${failure}`)) throw new Error('unavailable');
      return { stdout: failure === 'voices' ? 'Samantha en_US # Hello' : voiceOutput };
    });
    expect((await macProvider(run).status()).available).toBe(false);
  });

  it('accepts afconvert format help with exit code 2 and stderr output', async () => {
    const run = vi.fn<TtsCommandRunner>(async (command) => {
      if (command.endsWith('/afconvert')) {
        throw Object.assign(new Error('help'), { code: 2, stderr: "'m4af' = Apple MPEG-4 Audio\n data_formats: 'aac '" });
      }
      return { stdout: voiceOutput };
    });
    expect((await macProvider(run).status()).available).toBe(true);
  });

  it('does not mistake arbitrary afconvert errors for format help', async () => {
    const run = vi.fn<TtsCommandRunner>(async (command) => {
      if (command.endsWith('/afconvert')) throw Object.assign(new Error('broken'), { code: 2, stderr: 'not available' });
      return { stdout: voiceOutput };
    });
    expect((await macProvider(run).status()).available).toBe(false);
  });

  it('writes text to a file and converts AIFF to AAC without embedding text in arguments', async () => {
    const text = '-v Other; $(echo test) [[[[slnc 999999]] Hello';
    const outputPath = join(dataDir, 'speech.m4a');
    let inputPath = '';
    let aiffPath = '';
    const run = vi.fn<TtsCommandRunner>(async (command, args) => {
      if (args[1] === '?') return { stdout: voiceOutput };
      if (args[0] === '-hf') return { stdout: 'formats' };
      if (command.endsWith('/say')) {
        expect(args.slice(0, 2)).toEqual(['-v', 'Alex (English)']);
        inputPath = args[args.indexOf('-f') + 1];
        aiffPath = args[args.indexOf('-o') + 1];
        expect(await readFile(inputPath, 'utf8')).toBe(text.replace(/\[(?=\[)/gu, '[ '));
        expect(await readFile(inputPath, 'utf8')).not.toContain('[[');
        expect(args).not.toContain(text);
        await writeFile(aiffPath, 'fake-aiff');
      } else {
        expect(args).toEqual(['-f', 'm4af', '-d', 'aac', aiffPath, outputPath]);
        await writeFile(outputPath, 'fake-m4a');
      }
      return { stdout: '' };
    });
    await macProvider(run).synthesize({ lang: 'en', voice: 'Alex (English)', text, outputPath });
    expect(await readFile(outputPath, 'utf8')).toBe('fake-m4a');
    expect(await readdir(dataDir)).toEqual(['speech.m4a']);
    expect(run.mock.calls.slice(2).map((call) => call[2].timeout)).toEqual([120_000, 30_000]);
  });

  it('rejects unlisted voice names before writing text or invoking synthesis', async () => {
    const run = vi.fn<TtsCommandRunner>(async () => ({ stdout: voiceOutput }));
    await expect(macProvider(run).synthesize({
      lang: 'en', voice: 'Samantha; echo test', text: 'Hello', outputPath: join(dataDir, 'speech.m4a'),
    })).rejects.toMatchObject({ statusCode: 503, code: 'TTS_UNAVAILABLE' });
    expect(run).toHaveBeenCalledTimes(2);
    expect(await readdir(dataDir)).toEqual([]);
  });

  it.each([
    ['ENOENT', false, 503, 'TTS_UNAVAILABLE'],
    ['EACCES', false, 503, 'TTS_UNAVAILABLE'],
    ['ETIMEDOUT', true, 504, 'TTS_TIMEOUT'],
    ['OTHER', false, 502, 'TTS_GENERATION_FAILED'],
  ])('cleans up temporary files and translates %s errors', async (code, killed, statusCode, expectedCode) => {
    const run = vi.fn<TtsCommandRunner>(async (command, args) => {
      if (args[1] === '?') return { stdout: voiceOutput };
      if (args[0] === '-hf') return { stdout: 'formats' };
      if (command.endsWith('/say')) {
        await writeFile(args[args.indexOf('-o') + 1], 'partial');
        throw Object.assign(new Error('failed'), { code, killed });
      }
      return { stdout: '' };
    });
    await expect(macProvider(run).synthesize({
      lang: 'zh', voice: 'Tingting', text: '你好', outputPath: join(dataDir, 'speech.m4a'),
    })).rejects.toMatchObject({ statusCode, code: expectedCode });
    expect(await readdir(dataDir)).toEqual([]);
  });

  it('retries an unavailable probe after its bounded cache expires', async () => {
    vi.useFakeTimers();
    const run = vi.fn<TtsCommandRunner>().mockRejectedValueOnce(new Error('not installed'))
      .mockResolvedValue({ stdout: voiceOutput });
    const provider = macProvider(run);
    expect((await provider.status()).available).toBe(false);
    await vi.advanceTimersByTimeAsync(3001);
    expect((await provider.status()).available).toBe(true);
  });
});
