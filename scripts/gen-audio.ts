import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { type AudioManifest, type Lang } from '@sprout/schema';
import { failure, isMain, printIssues, runCli } from './lib/cli';
import type { SpeechEntry } from './lib/collect-speech';
import { errorMessage, fileExists, isMissing, packDirectories, readJson, safePath, walkFiles, writeJson } from './lib/io';
import { inspectPack } from './lib/validate-pack';

const execute = promisify(execFile);

export interface AudioOptions {
  voiceZh?: string;
  voiceEn?: string;
  rate?: number;
  dryRun?: boolean;
  prune?: boolean;
}

export interface AudioResult {
  generated: number;
  skipped: number;
  failed: number;
  pruned: number;
  planned: number;
  issues: string[];
}

export type SpeechRenderer = (entry: SpeechEntry, voice: string, rate: number, target: string) => Promise<void>;

export function audioRelativePath(entry: Pick<SpeechEntry, 'key' | 'lang'>): string {
  return `audio/tts/${entry.lang}/${createHash('sha1').update(entry.key).digest('hex').slice(0, 16)}.m4a`;
}

export const renderSpeech: SpeechRenderer = async (entry, voice, rate, target) => {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = await mkdtemp(path.join(path.dirname(target), '.tts-'));
  try {
    const input = path.join(temporary, 'text.txt');
    const aiff = path.join(temporary, 'speech.aiff');
    const output = path.join(temporary, 'speech.m4a');
    // 使用文件传文本，不经过 shell，也不会把以连字符开头的文本当作 say 参数。
    await writeFile(input, entry.text, 'utf8');
    await execute('say', ['-v', voice, '-r', String(rate), '-o', aiff, '-f', input], { timeout: 120_000 });
    await execute('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', '-c', '1', aiff, output], { timeout: 120_000 });
    if (!await fileExists(temporary, 'speech.m4a')) throw new Error('afconvert 未生成非空音频');
    await rename(output, target);
  } finally { await rm(temporary, { recursive: true, force: true }); }
};

export async function generateAudio(
  directory: string, options: AudioOptions = {},
  runtime: { platform?: string; render?: SpeechRenderer } = {},
): Promise<AudioResult> {
  const result: AudioResult = { generated: 0, skipped: 0, failed: 0, pruned: 0, planned: 0, issues: [] };
  if ((runtime.platform ?? process.platform) !== 'darwin') {
    console.log('音频生成仅支持 macOS 的 say / afconvert；当前平台跳过并成功退出。可在 Mac 上生成后随内容包分发。');
    return result;
  }
  const voices: Record<Lang, string> = { zh: options.voiceZh ?? 'Tingting', en: options.voiceEn ?? 'Samantha' };
  const rate = options.rate ?? 165;
  if (!Number.isInteger(rate) || rate < 40 || rate > 400) throw new Error('--rate 需为 40–400 的整数');
  if (!voices.zh.trim() || !voices.en.trim()) throw new Error('声音名称不能为空');
  const inspected = await inspectPack(directory, { checkAudio: false });
  printIssues(inspected.issues);
  if (!inspected.manifest || failure(inspected.issues)) throw new Error('内容包存在错误，请先修复上述报告后生成音频');
  const oldManifest = inspected.audio ?? { schemaVersion: 1 as const, voices: {}, entries: {} };
  const manifest: AudioManifest = {
    schemaVersion: 1, voices: { ...oldManifest.voices }, entries: { ...oldManifest.entries },
  };
  let previousRate: number | undefined;
  try {
    const settings = await readJson(directory, 'audio/.tts-settings.json') as { rate?: unknown };
    if (typeof settings?.rate === 'number') previousRate = settings.rate;
  } catch (error) {
    if (!isMissing(error)) throw new Error(`音频生成缓存无效：${errorMessage(error)}`);
  }
  const requested = new Set(inspected.speech.map((entry) => entry.key));
  result.planned = requested.size;
  let cursor = 0;
  const rendered = new Set<Lang>();
  let staging: string | undefined;
  const completed: { relative: string; staged: string }[] = [];
  if (!options.dryRun) {
    const audioDirectory = await safePath(directory, 'audio');
    await mkdir(audioDirectory, { recursive: true });
    staging = await mkdtemp(path.join(audioDirectory, '.tts-run-'));
  }
  async function consume(): Promise<void> {
    while (cursor < inspected.speech.length) {
      const entry = inspected.speech[cursor++];
      const relative = audioRelativePath(entry);
      try {
        await safePath(directory, relative);
        const changed = oldManifest.voices[entry.lang] !== voices[entry.lang] || previousRate !== rate;
        if (!changed && await fileExists(directory, relative)) {
          manifest.entries[entry.key] = relative;
          result.skipped++;
          continue;
        }
        if (options.dryRun) {
          console.log(`[dry-run] ${entry.key} → ${relative}${changed ? '（声音或语速已改变）' : ''}`);
          continue;
        }
        const stagedRelative = `${entry.lang}/${path.basename(relative)}`;
        const staged = await safePath(staging!, stagedRelative);
        await (runtime.render ?? renderSpeech)(entry, voices[entry.lang], rate, staged);
        if (!await fileExists(staging!, stagedRelative)) throw new Error('未生成非空音频文件');
        completed.push({ relative, staged });
        manifest.entries[entry.key] = relative;
        rendered.add(entry.lang);
        result.generated++;
      } catch (error) {
        result.failed++;
        result.issues.push(`${entry.key}：${errorMessage(error)}`);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(4, inspected.speech.length) }, () => consume()));
    if (options.dryRun) {
      for (const error of result.issues) console.error(`[错误] ${error}`);
      console.log(`dry-run：总计 ${result.planned}，已存在 ${result.skipped}；未修改音频、清单或孤儿文件。`);
      return result;
    }
    // 本批全部合成成功后才替换正式文件；部分失败不改变旧音频、清单和清理状态。
    if (result.failed) {
      result.generated = 0;
      for (const error of result.issues) console.error(`[错误] ${error}`);
      return result;
    }
    for (const lang of ['zh', 'en'] as const) {
      if (rendered.has(lang) || !manifest.voices[lang]) manifest.voices[lang] = voices[lang];
    }
    const obsoleteFiles = new Set<string>();
    if (options.prune) {
      for (const [key, file] of Object.entries(manifest.entries)) {
        if (!requested.has(key)) {
          // 只删除脚本命名规则内的文件，绝不删用户录音或其他素材。
          if (/^audio\/tts\/(?:zh|en)\/[a-f0-9]{16}\.m4a$/.test(file)) obsoleteFiles.add(file);
          delete manifest.entries[key];
        }
      }
      try {
        for (const file of await walkFiles(directory, 'audio/tts')) {
          if (/^audio\/tts\/(?:zh|en)\/[a-f0-9]{16}\.m4a$/.test(file)) obsoleteFiles.add(file);
        }
      } catch (error) { if (!isMissing(error)) throw error; }
      for (const file of Object.values(manifest.entries)) obsoleteFiles.delete(file);
    }
    for (const { relative, staged } of completed) {
      const target = await safePath(directory, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(staged, target);
    }
    await writeJson(directory, 'audio/manifest.json', manifest);
    await writeJson(directory, 'audio/.tts-settings.json', { rate });
    for (const file of obsoleteFiles) {
      await rm(await safePath(directory, file), { force: true });
      result.pruned++;
    }
    console.log(`${directory}：总计 ${result.planned}，生成 ${result.generated}，跳过 ${result.skipped}，清理 ${result.pruned}`);
    return result;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    pack: { type: 'string' }, 'voice-zh': { type: 'string', default: 'Tingting' },
    'voice-en': { type: 'string', default: 'Samantha' }, rate: { type: 'string', default: '165' },
    'dry-run': { type: 'boolean' }, prune: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('用法：pnpm content:audio [--pack <dir>] [--voice-zh Tingting] [--voice-en Samantha] [--rate 165] [--dry-run] [--prune]');
    return;
  }
  if (process.platform !== 'darwin') {
    await generateAudio('', {}, { platform: process.platform });
    return;
  }
  for (const directory of await packDirectories(values.pack)) {
    const result = await generateAudio(directory, {
      voiceZh: values['voice-zh'], voiceEn: values['voice-en'], rate: Number(values.rate),
      dryRun: values['dry-run'], prune: values.prune,
    });
    if (result.failed) process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) runCli(() => main());
