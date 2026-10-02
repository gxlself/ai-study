import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Route, type Concept } from '@sprout/schema';
import { bundlePack } from '../bundle-pack';
import { failure } from '../lib/cli';
import { writeJson } from '../lib/io';
import { inspectPack } from '../lib/validate-pack';
import { fixturePack, lesson, route } from './fixtures';

let root: string;
const temporary: string[] = [];
beforeEach(async () => { root = await fixturePack(); temporary.push(root); });
afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

function parentLesson() {
  return {
    ...lesson(), audience: 'parent', ageRange: [6, 12], coView: 'optional', durationMin: 5,
    steps: [{ type: 'guide', props: { goal: '家长先阅读再陪玩', steps: [{ text: '看看实体卡片', concept: 'circle' }] } }],
  };
}

describe('新屏幕策略与 audience', () => {
  it.each([undefined, 'child'])('childScreen=none 拒绝 audience=%s，并从 bundle 排除', async (audience) => {
    const input = Route.parse(route());
    input.stages[0].screen.childScreen = 'none';
    await writeJson(root, 'routes/hello.json', input);
    await writeJson(root, 'lessons/hello.json', { ...lesson(), audience });
    const inspected = await inspectPack(root);
    expect(inspected.issues.some((entry) => entry.level === 'error' && entry.message.includes('childScreen=none'))).toBe(true);
    expect((await bundlePack(root)).bundle?.lessons).toHaveLength(0);
  });

  it('低月龄 parent guide 允许 none，不套用儿童共看和时长警告', async () => {
    const input = Route.parse(route());
    input.stages[0].ageRange = [6, 12];
    input.stages[0].screen.childScreen = 'none';
    await writeJson(root, 'routes/hello.json', input);
    await writeJson(root, 'lessons/hello.json', parentLesson());
    const inspected = await inspectPack(root, { checkAudio: false });
    expect(inspected.issues).toEqual([]);
    expect(inspected.validLessons[0].steps[0].props).toMatchObject({ materials: [], playMin: 5 });
  });

  it.each(['optional', 'default'])('childScreen=%s 接受 child，缺省 audience 同样检查共看和时长', async (childScreen) => {
    const input = Route.parse(route());
    input.stages[0].screen.childScreen = childScreen as 'optional' | 'default';
    await writeJson(root, 'routes/hello.json', input);
    await writeJson(root, 'lessons/hello.json', { ...lesson(), coView: 'recommended', durationMin: 4 });
    const inspected = await inspectPack(root, { checkAudio: false });
    expect(failure(inspected.issues)).toBe(false);
    expect(failure(inspected.issues, true)).toBe(true);
    expect(inspected.issues.some((entry) => entry.path.endsWith('.coView') && entry.level === 'warning')).toBe(true);
    expect(inspected.issues.some((entry) => entry.message.includes('sessionMaxMin') && entry.level === 'warning')).toBe(true);
  });

  it('未归主题的 child 仍检查 coView；没有所属阶段不编造时长上限', async () => {
    await writeJson(root, 'pack.json', {
      schemaVersion: 1, id: 'hello', name: { zh: '你好' }, ageRange: [18, 24], version: '1.0.0',
    });
    await writeJson(root, 'lessons/hello.json', { ...lesson(), coView: 'optional', durationMin: 15 });
    const inspected = await inspectPack(root, { checkAudio: false });
    expect(inspected.issues.some((entry) => entry.path.endsWith('.coView'))).toBe(true);
    expect(inspected.issues.some((entry) => entry.message.includes('sessionMaxMin'))).toBe(false);
  });

  it('继承 schema 的低月龄 child 与 parent 非 guide/song 错误', async () => {
    await writeJson(root, 'lessons/hello.json', { ...lesson(), ageRange: [6, 12] });
    let inspected = await inspectPack(root);
    expect(inspected.issues.some((entry) => entry.message.includes('18'))).toBe(true);
    await writeJson(root, 'lessons/hello.json', { ...lesson(), audience: 'parent' });
    inspected = await inspectPack(root);
    expect(inspected.issues.some((entry) => entry.message.includes('guide/song'))).toBe(true);
  });
});

describe('打印实体卡图片', () => {
  it('检查本包字符串引用的图片并报告课程的具体打印项', async () => {
    await writeJson(root, 'lessons/hello.json', {
      ...parentLesson(), printables: [{ kind: 'cards', title: '实体卡片', items: ['circle'] }],
    });
    await rm(path.join(root, 'assets/circle.svg'));
    const inspected = await inspectPack(root);
    expect(inspected.issues.some((entry) => entry.path === 'lessons/hello.json.printables.0.items.0'
      && entry.message.includes('图片缺失'))).toBe(true);
    expect(inspected.validLessons).toHaveLength(0);
  });

  it('检查内联打印卡图片，同时继承未知词条引用检查', async () => {
    await writeJson(root, 'lessons/hello.json', {
      ...parentLesson(), printables: [{ kind: 'cards', title: '实体卡片', items: [
        'missing', { zh: '我的卡片', image: 'assets/no-card.svg' },
      ] }],
    });
    const inspected = await inspectPack(root);
    expect(inspected.issues.some((entry) => entry.message.includes('"missing"'))).toBe(true);
    expect(inspected.issues.some((entry) => entry.path.endsWith('printables.0.items.1.image') && entry.level === 'error')).toBe(true);
  });

  it('core fallback 图片在其所属目录检查，本包同 id 优先', async () => {
    const fallbackRoot = await fixturePack();
    temporary.push(fallbackRoot);
    const cloud: Concept = { id: 'cloud', category: 'nature', zh: '云', en: 'cloud', image: 'assets/circle.svg' };
    await writeJson(root, 'lessons/hello.json', {
      ...lesson(), printables: [{ kind: 'cards', title: '云卡片', items: ['cloud'] }],
    });
    let inspected = await inspectPack(root, { fallbackConcepts: [cloud], fallbackRoot, checkAudio: false });
    expect(inspected.issues).toEqual([]);
    await rm(path.join(fallbackRoot, cloud.image));
    inspected = await inspectPack(root, { fallbackConcepts: [cloud], fallbackRoot, checkAudio: false });
    expect(inspected.issues.some((entry) => entry.message.includes('sprout.core/assets/circle.svg'))).toBe(true);
    await writeJson(root, 'lexicon.json', { schemaVersion: 1, concepts: [
      { ...cloud, id: 'circle' }, cloud,
    ] });
    inspected = await inspectPack(root, { fallbackConcepts: [cloud], fallbackRoot, checkAudio: false });
    expect(inspected.issues).toEqual([]);
  });

  it('cards/contrast 默认值及 offline question/levels 在 bundle 中保留', async () => {
    await writeJson(root, 'lessons/hello.json', {
      ...lesson(), printables: [
        { kind: 'cards', title: '实体卡片', items: ['circle'] },
        { kind: 'contrast', title: '黑白卡片', patterns: ['circle'] },
      ], offline: [{
        title: '一起找', steps: ['找一找圆形'], question: '你发现了什么？',
        levels: { easier: '只找一个', harder: '试着找两个' },
      }],
    });
    const bundled = (await bundlePack(root)).bundle!;
    expect(bundled.lessons[0].printables).toEqual([
      { kind: 'cards', title: '实体卡片', items: ['circle'], size: 'large', showText: true, showEnglish: true },
      { kind: 'contrast', title: '黑白卡片', patterns: ['circle'], palette: 'bw' },
    ]);
    expect(bundled.lessons[0].offline[0]).toMatchObject({
      question: '你发现了什么？', levels: { easier: '只找一个', harder: '试着找两个' },
    });
  });
});
