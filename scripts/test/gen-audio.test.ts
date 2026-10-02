import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioRelativePath, generateAudio, type SpeechRenderer } from '../gen-audio';
import { fileExists, readJson, writeJson } from '../lib/io';
import { inspectPack } from '../lib/validate-pack';
import { fixturePack } from './fixtures';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const AUDIO_TEST_KEYS = ['zh:圆形', 'en:circle', 'zh:二', 'en:two'];

// 全量语料由 collect-speech 与真实示例覆盖；此处只测试文件生成与提交的状态转换。
vi.mock('../lib/validate-pack', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/validate-pack')>();
  return {
    ...original,
    inspectPack: async (...args: Parameters<typeof original.inspectPack>) => {
      const inspected = await original.inspectPack(...args);
      return args[1]?.checkAudio === false
        ? { ...inspected, speech: inspected.speech.filter((entry) => AUDIO_TEST_KEYS.includes(entry.key)) }
        : inspected;
    },
  };
});

let root: string;
let active: number;
let maximum: number;
const render: SpeechRenderer = async (_entry, voice, rate, target) => {
  active++;
  maximum = Math.max(maximum, active);
  try {
    await new Promise((resolve) => setTimeout(resolve, 1));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${voice}:${rate}`);
  } finally { active--; }
};

beforeEach(async () => {
  root = await fixturePack();
  active = 0;
  maximum = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('TTS 流水线', () => {
  it('路径严格使用 speechKey 的 sha1 前16位', () => {
    const key = 'zh:你好';
    expect(audioRelativePath({ key, lang: 'zh' })).toBe(`audio/tts/zh/${createHash('sha1').update(key).digest('hex').slice(0, 16)}.m4a`);
  });

  it('并发4生成、记录声音、二次增量跳过且全部目标条目命中', async () => {
    const first = await generateAudio(root, {}, { platform: 'darwin', render });
    expect(first.generated).toBe(first.planned);
    expect(first.failed).toBe(0);
    expect(maximum).toBe(4);
    const second = await generateAudio(root, {}, { platform: 'darwin', render });
    expect(second.generated).toBe(0);
    expect(second.skipped).toBe(first.generated);
    const manifest = await readJson(root, 'audio/manifest.json') as { voices: Record<string, string> };
    expect(manifest.voices).toEqual({ zh: 'Tingting', en: 'Samantha' });
    const coverage = (await inspectPack(root)).audioCoverage;
    expect(coverage.present).toBe(AUDIO_TEST_KEYS.length);
    expect(coverage.missing.some((entry) => AUDIO_TEST_KEYS.includes(entry.key))).toBe(false);
  });

  it('dry-run 与非macOS均不创建文件，dry-run --prune 不删除', async () => {
    const dry = await generateAudio(root, { dryRun: true, prune: true }, { platform: 'darwin', render });
    expect(dry.planned).toBeGreaterThan(0);
    expect(await fileExists(root, 'audio/manifest.json')).toBe(false);
    expect(await generateAudio('/does-not-exist', {}, { platform: 'linux', render })).toMatchObject({ planned: 0 });
  });

  it('声音和语速变化会重新生成对应音频，声音信息不冒充旧文件来源', async () => {
    await generateAudio(root, {}, { platform: 'darwin', render });
    const changed = await generateAudio(root, { voiceZh: 'Meijia' }, { platform: 'darwin', render });
    expect(changed.generated).toBeGreaterThan(0);
    expect(changed.skipped).toBeGreaterThan(0);
    const all = await generateAudio(root, { voiceZh: 'Meijia', rate: 150 }, { platform: 'darwin', render });
    expect(all.generated).toBe(all.planned);
  });

  it('旧文件缺少生成参数记录时重配音，不猜测其声音来源', async () => {
    await generateAudio(root, {}, { platform: 'darwin', render });
    await rm(path.join(root, 'audio/.tts-settings.json'));
    const result = await generateAudio(root, {}, { platform: 'darwin', render });
    expect(result.generated).toBe(result.planned);
    expect(result.skipped).toBe(0);
  });

  it('--prune 删除已不引用的生成文件，保留手工录音', async () => {
    await generateAudio(root, {}, { platform: 'darwin', render });
    const orphan = 'audio/tts/zh/0123456789abcdef.m4a';
    await writeFile(path.join(root, orphan), 'orphan');
    await writeFile(path.join(root, 'audio/tts/zh/family-recording.m4a'), 'recording');
    const manifest = await readJson(root, 'audio/manifest.json') as { entries: Record<string, string> };
    manifest.entries['zh:旧句子'] = orphan;
    manifest.entries['zh:旧录音'] = 'audio/tts/zh/family-recording.m4a';
    await writeJson(root, 'audio/manifest.json', manifest);
    await generateAudio(root, { dryRun: true, prune: true }, { platform: 'darwin', render });
    expect(await fileExists(root, orphan)).toBe(true);
    const result = await generateAudio(root, { prune: true }, { platform: 'darwin', render });
    expect(result.pruned).toBe(1);
    expect(await fileExists(root, orphan)).toBe(false);
    expect(await fileExists(root, 'audio/tts/zh/family-recording.m4a')).toBe(true);
    expect((await readJson(root, 'audio/manifest.json') as typeof manifest).entries['zh:旧句子']).toBeUndefined();
  });

  it('生成失败不覆盖原有清单也不执行清理', async () => {
    await generateAudio(root, {}, { platform: 'darwin', render });
    const before = await readFile(path.join(root, 'audio/manifest.json'), 'utf8');
    const result = await generateAudio(root, { rate: 140, prune: true }, {
      platform: 'darwin', render: async () => { throw new Error('voice unavailable'); },
    });
    expect(result.failed).toBe(result.planned);
    expect(await readFile(path.join(root, 'audio/manifest.json'), 'utf8')).toBe(before);
  });

  it('部分合成失败不会覆盖成功条目对应的旧文件，暂存音频不进入发布内容', async () => {
    await generateAudio(root, {}, { platform: 'darwin', render });
    const relative = audioRelativePath({ lang: 'zh', key: 'zh:圆形' });
    const original = await readFile(path.join(root, relative), 'utf8');
    const result = await generateAudio(root, { rate: 150, prune: true }, {
      platform: 'darwin',
      render: async (entry, voice, rate, target) => {
        if (entry.key === 'en:circle') throw new Error('temporary voice error');
        await render(entry, voice, rate, target);
      },
    });
    expect(result.failed).toBe(1);
    expect(result.generated).toBe(0);
    expect(await readFile(path.join(root, relative), 'utf8')).toBe(original);
  });

  it('拒绝无效语速', async () => {
    await expect(generateAudio(root, { rate: NaN }, { platform: 'darwin', render })).rejects.toThrow('--rate');
  });
});
