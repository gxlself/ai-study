import { describe, expect, it } from 'vitest';
import { ChildScreenSettings } from '@sprout/schema';
import { childScreenSeconds, computeStats, planToday, resolveChildMode, resolveScreenPolicy, resolveSessionAudience, summarizeLesson } from '../src';
import { localDate, makeChild, makeIndex, makeLesson, makePlan, makeRoute, makeSession, makeStage, makeSummary, makeTheme } from './fixtures';

describe('家长指引与亲子共看模式', () => {
  it.each([
    [6, undefined, 'default', 'parent-only'],
    [17, 'co-view', 'default', 'parent-only'],
    [17.99, 'co-view', 'default', 'parent-only'],
    [18, undefined, 'optional', 'parent-only'],
    [23, 'auto', 'optional', 'parent-only'],
    [24, 'auto', 'none', 'parent-only'],
    [18, 'co-view', 'optional', 'co-view'],
    [24, 'parent-only', 'default', 'parent-only'],
    [24, undefined, 'default', 'co-view'],
    [36, 'auto', undefined, 'co-view'],
  ] as const)('年龄 %s、设置 %s、阶段 %s => %s', (age, mode, childScreen, expected) => {
    const stage = makeStage();
    stage.screen.childScreen = childScreen;
    const child = makeChild();
    child.screen.mode = mode;
    expect(resolveChildMode(stage, child, age)).toBe(expected);
  });

  it('缺少阶段时仍保护 18 月龄以下，其他按显式设置和默认共看', () => {
    expect(resolveChildMode(null, makeChild(), 17)).toBe('parent-only');
    expect(resolveChildMode(null, makeChild(), 24)).toBe('co-view');
    expect(resolveChildMode(null, makeChild(), Number.NaN)).toBe('parent-only');
  });

  it.each([[18, 8], [23, 8], [24, 20], [36, 20]])('共看单次硬上限：%s 月龄为 %s 分钟且必须陪同', (age, cap) => {
    const stage = makeStage({ screen: { sessionMaxMin: 30, dailyMaxMin: 60, lessonsPerDay: 2, coView: 'optional' } });
    expect(resolveScreenPolicy(stage, ChildScreenSettings.parse({ sessionMaxMin: 30 }), age))
      .toMatchObject({ sessionMaxMin: cap, coView: 'required' });
  });

  it('新建默认时段是 08:00–18:30，下调时长仍有效', () => {
    expect(ChildScreenSettings.parse({}).windows).toEqual([{ start: '08:00', end: '18:30' }]);
    expect(resolveScreenPolicy(makeStage(), ChildScreenSettings.parse({ sessionMaxMin: 3 }), 18).sessionMaxMin).toBe(3);
  });
});

describe('不同 audience 的候选与预算', () => {
  const date = localDate('2026-10-02');
  const lessons = makeIndex(
    makeSummary('parent', { audience: 'parent', ageRange: [6, 36], durationMin: 20 }),
    makeSummary('child', { audience: 'child', durationMin: 4 }),
    makeSummary('legacy', { durationMin: 4 }),
    makeSummary('parent2', { audience: 'parent', ageRange: [6, 36], durationMin: 20 }),
  );
  const route = makeRoute([makeStage({
    screen: { sessionMaxMin: 10, dailyMaxMin: 5, lessonsPerDay: 4, coView: 'required', childScreen: 'optional' },
    themes: [makeTheme('current', Object.keys(lessons))],
  })]);

  it('18 月龄以下 parent-only 包括 pinned 在内都不能夹带不适龄 child 或缺省 audience 的课', () => {
    const child = makeChild({ birthday: '2025-05-03', plan: makePlan({ pinned: ['child', 'legacy', 'parent'] }) });
    child.screen.mode = 'co-view';
    const plan = planToday({ route, lessons, child, history: [], date, usedSec: 5000 });
    expect(plan.screen.mode).toBe('parent-only');
    expect(plan.items.map((item) => item.lessonId)).toEqual(['parent', 'parent2']);
    expect(plan.screen).toMatchObject({ allowedNow: false, reason: 'daily-limit' });
  });

  it('18–23 月龄 optional 默认家长课与线下版，显式 co-view 后允许共看', () => {
    const child = makeChild({ birthday: '2025-03-02', plan: makePlan({ pinned: ['parent', 'child'] }) });
    const input = { route, lessons, child, history: [], date, usedSec: 0 };
    const parentOnly = planToday(input);
    expect(parentOnly.items).toHaveLength(4);
    expect(parentOnly.items.every((item) => item.lesson.audience === 'parent' || item.offlineOnly === true)).toBe(true);
    expect(parentOnly.items.filter((item) => item.offlineOnly).map((item) => item.lessonId).sort()).toEqual(['child', 'legacy']);
    child.screen.mode = 'co-view';
    expect(planToday(input).items.map((item) => item.lessonId)).toContain('child');
    expect(planToday(input).items.every((item) => item.offlineOnly === undefined)).toBe(true);
    expect(planToday(input).screen).toMatchObject({ mode: 'co-view', sessionMaxSec: 480, coView: 'required' });
  });

  it('只尾删超预算的共看课，保留前后家长课且不例外保留超额单课', () => {
    const child = makeChild({ birthday: '2024-04-02', plan: makePlan({ pinned: ['parent', 'child', 'legacy', 'parent2'] }) });
    child.screen.mode = 'co-view';
    const input = { route, lessons, child, history: [], date, usedSec: 300 };
    expect(planToday(input).items.map((item) => item.lessonId)).toEqual(['parent', 'child', 'parent2']);
    child.screen.dailyMaxMin = 1;
    expect(planToday(input).items.map((item) => item.lessonId)).toEqual(['parent', 'parent2']);
    child.plan.pinned = ['child'];
    expect(planToday({ ...input, lessons: makeIndex(lessons.child) }).items).toEqual([]);
  });

  it('摘要显式补齐 audience 与 hasPrintables，保留 parent', () => {
    expect(summarizeLesson(makeLesson(), 'test')).toMatchObject({ audience: 'child', hasPrintables: false });
    expect(summarizeLesson(makeLesson({
      audience: 'parent',
      printables: [{ kind: 'contrast', title: '实体卡', patterns: ['circle'], palette: 'bw' }],
    }), 'test')).toMatchObject({ audience: 'parent', hasPrintables: true });
  });
});

describe('孩子屏幕计时与兼容旧记录', () => {
  const lessons = makeIndex(makeSummary('guide', { audience: 'parent' }), 'legacy', makeSummary('child', { audience: 'child' }));
  it('显式 audience 优先，缺省读课程，未知课程保守计入 child', () => {
    expect(resolveSessionAudience({ lessonId: 'guide' }, lessons)).toBe('parent');
    expect(resolveSessionAudience({ lessonId: 'guide', audience: 'child' }, lessons)).toBe('child');
    expect(resolveSessionAudience({ lessonId: 'missing', audience: 'parent' }, lessons)).toBe('parent');
    expect(resolveSessionAudience({ lessonId: 'missing' }, lessons)).toBe('child');
    expect(resolveSessionAudience({ lessonId: 'legacy' }, lessons)).toBe('child');
  });
  it('parent 秒数不进入 usedSec、screenSec、totalSec、domains，但保留学习记录次数', () => {
    const sessions = [
      { ...makeSession('guide'), durationSec: 600 },
      { ...makeSession('missing'), audience: 'parent' as const, durationSec: 900 },
      { ...makeSession('legacy'), durationSec: 50 },
      { ...makeSession('child'), durationSec: 70 },
      { ...makeSession('unknown'), durationSec: 20 },
    ];
    expect(childScreenSeconds(sessions, lessons)).toBe(140);
    const stats = computeStats(sessions, lessons, 1, localDate('2024-07-01'));
    expect(stats.totalSec).toBe(140);
    expect(stats.days[0]).toMatchObject({ screenSec: 140, lessons: 5, completed: 5 });
    expect(stats.domains).toEqual({ language: 120 });
  });
});
