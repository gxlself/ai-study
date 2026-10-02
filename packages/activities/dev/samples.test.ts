import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_ACTIVITY_PROPS, BUILTIN_ACTIVITY_TYPES, validateLesson,
  type ActivityStep, type BuiltinActivityType,
} from '@sprout/schema';
import { concepts, samples } from './samples';
import { webFixtureUrl } from './fixtures';

function lessonFor(step: ActivityStep) {
  return {
    schemaVersion: 1, id: 'preview.lesson', title: { zh: '样例校验' },
    ageRange: [24, 36], domains: ['cognition'], durationMin: 1, coView: 'required',
    objectives: [{ zh: '亲子共玩' }],
    parentGuide: { intro: '一起观察。' },
    offline: [{ title: '一起玩真实玩具', steps: ['选一个安全大玩具一起看。'] }],
    steps: [step],
  };
}

describe('16 个活动样例', () => {
  it('完整映射 schema 的活动顺序，所有字段已补默认', () => {
    expect(Object.keys(samples)).toEqual(BUILTIN_ACTIVITY_TYPES);
    for (const type of BUILTIN_ACTIVITY_TYPES) {
      expect(BUILTIN_ACTIVITY_PROPS[type].parse(samples[type])).toEqual(samples[type]);
    }
    expect(samples['word-cards'].autoAdvanceSec).toBeNull();
    expect(samples.count.rounds[0].layout).toBe('row');
    expect(samples.story.pages[0].narrate).toBe(true);
    expect(samples.story.pages[1].scene.ground).toBe('grass');
  });

  it('词库 id 唯一，全部样例通过语义与词库引用校验', () => {
    const ids = new Set(concepts.map((concept) => concept.id));
    expect(ids.size).toBe(concepts.length);
    for (const type of BUILTIN_ACTIVITY_TYPES) {
      const validated = validateLesson(lessonFor({ type, props: samples[type] }), { knownConcepts: ids });
      expect(validated.issues.filter((issue) => issue.level === 'error'), type).toEqual([]);
    }
  });

  it('16 份文档 JSON 均可作为课程步骤复制，并通过相同契约校验', async () => {
    const markdown = await readFile(resolve(import.meta.dirname, '../../../docs/dev/activities.md'), 'utf8');
    const steps = [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)]
      .map((match) => JSON.parse(match[1]) as ActivityStep);
    expect(steps.map((step) => step.type)).toEqual(BUILTIN_ACTIVITY_TYPES);
    for (const step of steps) {
      expect(BUILTIN_ACTIVITY_PROPS[step.type as BuiltinActivityType].safeParse(step.props).success).toBe(true);
      const validated = validateLesson(lessonFor(step), {
        knownConcepts: new Set(concepts.map((concept) => concept.id)),
      });
      expect(validated.issues.filter((issue) => issue.level === 'error'), step.type).toEqual([]);
    }
  });

  it('SVG、小视频、poster、字幕均为实际存在的本地文件', async () => {
    for (const concept of concepts) {
      const file = resolve(import.meta.dirname, `./assets/${concept.id}.svg`);
      const svg = await readFile(file, 'utf8');
      expect(svg).toContain('<svg');
      expect(svg).not.toMatch(/<script|<image|<foreignObject/i);
    }
    const video = await readFile(resolve(import.meta.dirname, './assets/quiet-shape.mp4'));
    expect(video.subarray(4, 8).toString()).toBe('ftyp');
    expect(video.byteLength).toBeGreaterThan(1000);
    expect(await stat(resolve(import.meta.dirname, './assets/video-poster.svg'))).toBeDefined();
    expect(await readFile(resolve(import.meta.dirname, './assets/quiet-shape.vtt'), 'utf8')).toMatch(/^WEBVTT/);
    expect(['', 'localhost', '127.0.0.1']).toContain(new URL(samples.video.src).hostname);
  });
});

describe('隔离来源的本地 web fixture', () => {
  it.each([
    ['http://localhost:5312', 'http://127.0.0.1:5312'],
    ['http://127.0.0.1:5312', 'http://localhost:5312'],
    ['http://localhost:5412', 'http://127.0.0.1:5412'],
  ])('父页面 %s 使用另一个回环 origin', (parent, expected) => {
    const fixture = new URL(webFixtureUrl(parent));
    expect(fixture.origin).toBe(expected);
    expect(fixture.origin).not.toBe(parent);
    expect(fixture.pathname).toBe('/assets/web-fixture.html');
    expect(fixture.searchParams.get('parentOrigin')).toBe(parent);
  });

  it('拒绝未知域名，样例默认不引入外网内容', () => {
    expect(() => webFixtureUrl('https://example.com')).toThrow(/localhost/);
    expect(['localhost', '127.0.0.1']).toContain(new URL(samples.web.url).hostname);
    expect(new URL(samples.web.url).origin).not.toBe(window.location.origin);
  });
});
