import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { bundlePack } from '../bundle-pack';
import { failure } from '../lib/cli';
import { packPath, writeJson } from '../lib/io';
import { inspectPack, punctuationIssues } from '../lib/validate-pack';
import { packZip } from '../pack-zip';
import { fixturePack, lesson, route } from './fixtures';

let root: string;
beforeEach(async () => {
  root = await fixturePack();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'table').mockImplementation(() => {});
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('内容包检查', () => {
  it('应用活动默认值并将缺音频作为非严格模式警告', async () => {
    const result = await inspectPack(root);
    expect(failure(result.issues)).toBe(false);
    expect(failure(result.issues, true)).toBe(true);
    expect(result.validLessons[0].steps[0].props).toMatchObject({ speak: 'name', autoAdvanceSec: null });
    expect(result.audioCoverage.missing.some((entry) => entry.key === 'zh:圆形')).toBe(true);
  });

  it('缺失和损坏文件生成报告而不抛异常', async () => {
    await rm(path.join(root, 'routes/hello.json'));
    await writeFile(path.join(root, 'lessons/hello.json'), '{invalid');
    const result = await inspectPack(root);
    expect(result.issues.some((issue) => issue.path === 'routes/hello.json' && issue.message.includes('缺失'))).toBe(true);
    expect(result.issues.some((issue) => issue.path === 'lessons/hello.json' && issue.level === 'error')).toBe(true);
    expect(result.validLessons).toEqual([]);
  });

  it('缺失清单和空目录不崩溃', async () => {
    await rm(path.join(root, 'pack.json'));
    expect((await inspectPack(root)).manifest).toBeNull();
    await writeJson(root, 'pack.json', { schemaVersion: 1, id: 'empty', name: { zh: '空包' }, version: '1.0.0', ageRange: [6, 9] });
    await rm(path.join(root, 'lessons'), { recursive: true });
    await rm(path.join(root, 'lexicon.json'));
    const result = await inspectPack(root);
    expect(result.issues.filter((issue) => issue.message.includes('缺失'))).toHaveLength(2);
  });

  it('校验词库重复、每个图片和课程封面/场景资源', async () => {
    await writeJson(root, 'lexicon.json', { schemaVersion: 1, concepts: [
      { id: 'a', category: 'shapes', zh: '圆', en: 'circle', image: 'assets/missing.svg' },
      { id: 'a', category: 'shapes', zh: '圆', en: 'circle', image: 'assets/circle.svg' },
    ] });
    await writeJson(root, 'lessons/hello.json', {
      ...lesson(), cover: { image: 'assets/cover.svg' },
      steps: [{ type: 'story', props: { title: { zh: '圆' }, pages: [{
        scene: { sprites: [{ image: 'assets/sprite.svg', x: 50, y: 50 }] }, text: { zh: '圆形来了。' },
      }] } }],
    });
    const result = await inspectPack(root);
    expect(result.issues.some((issue) => issue.message.includes('重复 id'))).toBe(true);
    for (const file of ['missing.svg', 'cover.svg', 'sprite.svg']) {
      expect(result.issues.some((issue) => issue.message.includes(file))).toBe(true);
    }
    expect(result.validLessons).toHaveLength(0);
  });

  it('本包课程允许引用 core fallback，不把其图片当成本包资源', async () => {
    await writeJson(root, 'lessons/hello.json', lesson('hello.lesson', { items: ['cloud'] }));
    const result = await inspectPack(root, { fallbackConcepts: [{
      id: 'cloud', category: 'nature', zh: '云', en: 'cloud', image: 'assets/cloud.svg',
    }] });
    expect(failure(result.issues)).toBe(false);
    expect(result.speech.some((entry) => entry.key === 'zh:云')).toBe(true);
  });

  it('未知概念、损坏 props 和伪装成原型属性的活动均报告错误', async () => {
    await writeJson(root, 'lessons/hello.json', lesson('hello.lesson', { items: ['missing'] }));
    await writeJson(root, 'lessons/invalid.json', lesson('bad.lesson', { items: [] }));
    await writeJson(root, 'lessons/prototype.json', { ...lesson('prototype.lesson'), steps: [{ type: 'constructor', props: {} }] });
    const result = await inspectPack(root);
    expect(result.validLessons).toHaveLength(0);
    expect(result.issues.filter((issue) => issue.level === 'error').length).toBeGreaterThanOrEqual(3);
  });

  it('重复课程 id 的双方均不进入 bundle', async () => {
    await writeJson(root, 'lessons/another.json', lesson());
    const result = await bundlePack(root);
    expect(result.bundle?.lessons).toEqual([]);
    expect(result.issues.filter((issue) => issue.message.includes('重复课程 id'))).toHaveLength(2);
  });

  it.each(['../escape', '/tmp/escape', 'assets\\..\\escape', 'C:/escape', 'assets/%2e%2e/escape', 'assets//escape'])(
    '拒绝不安全路径 %s', (value) => { expect(() => packPath(root, value)).toThrow('不安全'); },
  );

  it('拒绝文件和目录软链接', async () => {
    await symlink(os.tmpdir(), path.join(root, 'assets/outside'));
    await writeJson(root, 'lessons/hello.json', { ...lesson(), cover: { image: 'assets/outside/private.svg' } });
    const result = await inspectPack(root);
    expect(result.issues.some((issue) => issue.message.includes('软链接'))).toBe(true);
    await expect(packZip(root, path.join(root, 'release'))).rejects.toThrow('存在错误');
  });

  it('音频清单命中但文件缺失仍算缺音频并报告错误', async () => {
    await writeJson(root, 'audio/manifest.json', { schemaVersion: 1, entries: { 'zh:圆形': 'audio/missing.m4a' } });
    const result = await inspectPack(root);
    expect(result.audioCoverage.present).toBe(0);
    expect(result.issues.some((issue) => issue.message.includes('音频文件缺失'))).toBe(true);
  });

  it('中文半角标点提示不误报英文句子', () => {
    expect(punctuationIssues({ zh: '你好,', en: 'Hello, circle!' }, 'text')).toHaveLength(1);
    expect(punctuationIssues({ zh: '你好.' }, 'text')).toHaveLength(1);
    expect(punctuationIssues({ zh: '你好。', en: 'Hello!' }, 'text')).toEqual([]);
  });
});

describe('路线一致性', () => {
  it.each(['empty', 'omitted'])('routes=%s 的扩展包不要求主题归属', async (kind) => {
    const manifest = JSON.parse(await readFile(path.join(root, 'pack.json'), 'utf8'));
    if (kind === 'empty') manifest.routes = [];
    else delete manifest.routes;
    await writeJson(root, 'pack.json', manifest);
    await writeJson(root, 'lessons/hello.json', { ...lesson(), themeId: undefined });
    const result = await inspectPack(root, { checkAudio: false });
    expect(result.manifest?.routes).toEqual([]);
    expect(result.routes).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.validLessons).toHaveLength(1);
    expect(failure(result.issues, true)).toBe(false);
  });

  it('无路线只豁免主题归属，仍检查共看、概念、资源、标点与缺音', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'pack.json'), 'utf8'));
    await writeJson(root, 'pack.json', { ...manifest, routes: [] });
    await writeJson(root, 'lessons/hello.json', {
      ...lesson('hello.lesson', { items: ['missing'] }),
      title: { zh: '你好,' }, coView: 'optional', cover: { image: 'assets/missing.svg' },
    });
    const result = await inspectPack(root);
    for (const text of ['coView', '不存在概念', '资源缺失', '半角标点', '缺少']) {
      expect(result.issues.some((entry) => entry.message.includes(text)), text).toBe(true);
    }
    expect(result.issues.some((entry) => entry.message.includes('在主题中出现'))).toBe(false);
    expect(result.validLessons).toEqual([]);
    expect(failure(result.issues, true)).toBe(true);
  });

  it.each(['missing', 'invalid'])('声明的路线 %s 时仍报错误与未归主题警告', async (kind) => {
    if (kind === 'missing') await rm(path.join(root, 'routes/hello.json'));
    else await writeJson(root, 'routes/hello.json', { ...route(), stages: [] });
    const result = await inspectPack(root, { checkAudio: false });
    expect(result.routes).toEqual([]);
    expect(result.issues.some((entry) => entry.path.startsWith('routes/hello.json') && entry.level === 'error')).toBe(true);
    expect(result.issues.some((entry) => entry.message.includes('在主题中出现 0 次'))).toBe(true);
    expect(failure(result.issues, true)).toBe(true);
  });

  it('有路线包的额外课程仍必须归入主题', async () => {
    await writeJson(root, 'lessons/outside.json', { ...lesson('outside.lesson'), themeId: undefined });
    const result = await inspectPack(root, { checkAudio: false });
    expect(result.issues).toEqual([{
      path: 'lessons/outside.json',
      message: '课程 "outside.lesson" 在主题中出现 0 次，应且仅应出现 1 次',
      level: 'warning',
    }]);
    expect(failure(result.issues, true)).toBe(true);
  });

  it.each([
    { next: [24, 30], message: '重叠' },
    { next: [26, 30], message: '不连续' },
  ])('闭区间阶段检查 $message', async ({ next, message }) => {
    const input = route();
    input.stages.push({ ...input.stages[0], id: 'next', ageRange: next, themes: [{ ...input.stages[0].themes[0], id: 'next.theme' }] });
    await writeJson(root, 'routes/hello.json', input);
    const result = await inspectPack(root);
    expect(result.issues.some((issue) => issue.message.includes(message))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('出现 2 次'))).toBe(true);
  });

  it('连续阶段通过、但重复主题/错误引用/不交集/月龄外课程分别报告', async () => {
    const input = route();
    input.stages.push({ ...input.stages[0], id: 'next', ageRange: [25, 30] });
    input.stages[1].themes = [
      { ...input.stages[0].themes[0], lessons: ['missing.lesson', 'hello.lesson'] },
      { ...input.stages[0].themes[0], id: 'mismatched.theme', lessons: ['hello.lesson'] },
    ];
    await writeJson(root, 'routes/hello.json', input);
    const result = await inspectPack(root);
    for (const text of ['重复主题', '不存在或结构无效', '无交集', '不一致']) {
      expect(result.issues.some((issue) => issue.message.includes(text))).toBe(true);
    }
    expect(result.issues.some((issue) => issue.message.includes('不连续'))).toBe(false);
  });
});

describe('bundle / zip', () => {
  it('bundle 仅包括有效课，包含默认值，坏课不阻塞其他课输出', async () => {
    await writeJson(root, 'lessons/bad.json', lesson('bad.lesson', { items: ['missing'] }));
    const result = await bundlePack(root);
    expect(result.bundle?.lessons.map((item) => item.id)).toEqual(['hello.lesson']);
    expect(result.bundle?.lessons[0].steps[0].props.speak).toBe('name');
    expect(failure(result.issues)).toBe(true);
    expect(JSON.parse(await readFile(path.join(root, 'bundle.json'), 'utf8')).schemaVersion).toBe(1);
  });

  it.each(['lexicon', 'route'])('拒绝将 bundle.json 用作 %s 源文件，保留原文件', async (kind) => {
    const manifest = JSON.parse(await readFile(path.join(root, 'pack.json'), 'utf8'));
    const source = kind === 'lexicon' ? 'lexicon.json' : 'routes/hello.json';
    const original = await readFile(path.join(root, source), 'utf8');
    await rename(path.join(root, source), path.join(root, 'bundle.json'));
    if (kind === 'lexicon') manifest.lexicon = 'bundle.json';
    else manifest.routes = ['bundle.json'];
    await writeJson(root, 'pack.json', manifest);
    const result = await bundlePack(root);
    expect(result.bundle).toBeNull();
    expect(result.issues.some((entry) => entry.message.includes('未覆盖'))).toBe(true);
    expect(await readFile(path.join(root, 'bundle.json'), 'utf8')).toBe(original);
    await expect(packZip(root, path.join(root, 'release'))).rejects.toThrow('存在错误');
  });

  it('输出为包的祖先目录仍包含完整包，不排除所有文件', async () => {
    const output = await packZip(root, path.dirname(root));
    try {
      const files = unzipSync(await readFile(output));
      expect(files['pack.json']).toBeDefined();
      expect(files['bundle.json']).toBeDefined();
      expect(files['assets/circle.svg']).toBeDefined();
    } finally { await rm(output, { force: true }); }
  });

  it('资源若位于发布排除路径则校验失败，防止静默遗漏', async () => {
    await mkdir(path.join(root, 'assets/tmp'));
    await rename(path.join(root, 'assets/circle.svg'), path.join(root, 'assets/tmp/circle.svg'));
    await writeJson(root, 'lexicon.json', { schemaVersion: 1, concepts: [
      { id: 'circle', category: 'shapes', zh: '圆形', en: 'circle', image: 'assets/tmp/circle.svg' },
    ] });
    const result = await inspectPack(root);
    expect(result.issues.some((entry) => entry.message.includes('发布排除'))).toBe(true);
    await expect(packZip(root, path.join(root, 'release'))).rejects.toThrow('存在错误');
  });

  it('zip 根含 pack.json 与 bundle，排除临时文件和旧压缩包', async () => {
    await writeFile(path.join(root, 'old.zip'), 'old');
    await writeFile(path.join(root, 'audio.aiff'), 'temporary');
    await mkdir(path.join(root, '.cache'));
    await writeFile(path.join(root, '.cache/temporary.json'), '{}');
    const output = await packZip(root, path.join(root, 'release'));
    const files = unzipSync(await readFile(output));
    expect(files['pack.json']).toBeDefined();
    expect(files['bundle.json']).toBeDefined();
    expect(files['assets/circle.svg']).toBeDefined();
    expect(Object.keys(files).some((file) => /cache|\.zip$|\.aiff$/.test(file))).toBe(false);
    expect(JSON.parse(strFromU8(files['bundle.json'])).lessons[0].steps[0].props.speak).toBe('name');
  });

  it('仅缓存不构成路径检查漏洞，zip 拒绝未引用的包内软链接', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'sprout-outside-'));
    try {
      await writeFile(path.join(outside, 'private.txt'), 'not for export');
      await symlink(path.join(outside, 'private.txt'), path.join(root, 'assets/private.txt'));
      await expect(packZip(root, path.join(root, 'release'))).rejects.toThrow('软链接');
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});
