import { describe, expect, it } from 'vitest';
import type { LessonSummary, TodayPlanItem } from '@sprout/schema';
import { localDateString, planToday } from '../src';
import { deepFreeze, localDate, makeChild, makeIndex, makePlan, makeRoute, makeStage, makeSummary, makeTheme } from './fixtures';

type PlanArgs = Parameters<typeof planToday>[0];
type Reason = TodayPlanItem['reason'];

const date = localDate('2026-10-03');
const festival = makeSummary('culture.child.spring-festival', {
  packId: 'sprout.culture',
  themeId: 'culture.spring-festival',
  ageRange: [24, 36],
  audience: 'child',
  durationMin: 4,
});

function childAt(months: number, plan = makePlan(), mode: 'co-view' | 'parent-only' = 'co-view') {
  const child = makeChild({
    birthday: localDateString(new Date(date.getFullYear(), date.getMonth() - months, 1)),
    plan,
  });
  child.screen.mode = mode;
  return child;
}

function input(months: number, overrides: Partial<PlanArgs> = {}): PlanArgs {
  return {
    route: makeRoute([makeStage({ ageRange: [6, 72], themes: [makeTheme('current', ['missing'])] })]),
    lessons: makeIndex(festival),
    child: childAt(months, makePlan({ pinned: [festival.id] })),
    history: [],
    date,
    usedSec: 0,
    ...overrides,
  };
}

function sourceInput(months: number, reason: Reason, audience: LessonSummary['audience']): PlanArgs {
  return input(months, {
    route: makeRoute([makeStage({
      ageRange: [6, 72],
      themes: [
        makeTheme('previous', [reason === 'review' ? festival.id : 'missing']),
        makeTheme('current', [reason === 'theme' ? festival.id : 'missing']),
        makeTheme('focus', [reason === 'balance' ? festival.id : 'missing']),
      ],
    })]),
    lessons: makeIndex({ ...festival, audience, domains: ['math'] }),
    child: childAt(months, makePlan({
      themeId: 'current',
      pinned: reason === 'pinned' ? [festival.id] : [],
      focusDomains: ['math'],
    }), audience === 'parent' ? 'parent-only' : 'co-view'),
  });
}

describe('扩展包 age-guard 场景', () => {
  const ranges = [[6, 17], [18, 23], [24, 36]] as const;
  const route = makeRoute(ranges.map(([min, max]) => makeStage({
    id: `stage.${min}`,
    ageRange: [min, max],
    themes: [makeTheme(`theme.${min}`, [`parent.${min}`])],
    screen: {
      sessionMaxMin: 8,
      dailyMaxMin: 10,
      lessonsPerDay: 2,
      coView: 'required',
      childScreen: min < 18 ? 'none' : min < 24 ? 'optional' : 'default',
      childLessonsPerDay: 1,
    },
  })));
  const lessons = makeIndex(festival, ...ranges.map(([min, max]) => makeSummary(`parent.${min}`, {
    ageRange: [min, max],
    audience: 'parent',
  })));

  // 对应内容包 .qa/age-guard.ts 的六个月龄，不读取并行任务正在更新的 bundle。
  it.each([6, 17, 18, 23, 24, 36])('%s 月龄置顶春节课只在适龄时进入共看计划', (months) => {
    const result = planToday(input(months, { route, lessons }));
    const scheduled = result.items.find((item) => item.lessonId === festival.id);
    expect(result.child.ageMonths).toBe(months);
    expect(result.screen.mode).toBe(months < 18 ? 'parent-only' : 'co-view');
    if (months >= 24) {
      expect(scheduled).toMatchObject({ reason: 'pinned', lesson: festival });
      expect(scheduled).not.toHaveProperty('offlineOnly');
    } else {
      expect(scheduled).toBeUndefined();
    }
    expect(result.items.length).toBeLessThanOrEqual(2);
    const childItems = result.items.filter((item) => item.lesson.audience !== 'parent' && !item.offlineOnly);
    expect(childItems.length).toBeLessThanOrEqual(1);
    expect(childItems.reduce((total, item) => total + item.lesson.durationMin, 0)).toBeLessThanOrEqual(10);
  });
});

describe.each(['pinned', 'theme', 'review', 'balance'] as const)('%s 候选月龄边界', (reason) => {
  it.each([
    [23, false],
    [24, true],
    [36, true],
    [39, true],
    [40, false],
  ] as const)('%s 月龄适龄结果为 %s，家长课与显式/缺省 child 共用校验', (months, eligible) => {
    for (const audience of ['parent', 'child', undefined] as const) {
      const result = planToday(sourceInput(months, reason, audience));
      expect(result.child.ageMonths).toBe(months);
      expect(result.items.map((item) => ({ lessonId: item.lessonId, reason: item.reason }))).toEqual(
        eligible ? [{ lessonId: festival.id, reason }] : [],
      );
    }
  });
});

describe('parent-only 置顶扩展课', () => {
  it.each([
    [23, false],
    [24, true],
    [36, true],
    [39, true],
    [40, false],
  ] as const)('%s 月龄的路线外置顶 child 只在适龄时提供线下版', (months, eligible) => {
    for (const audience of ['child', undefined] as const) {
      const request = deepFreeze(input(months, {
        lessons: makeIndex({ ...festival, audience }),
        child: childAt(months, makePlan({ pinned: [festival.id] }), 'parent-only'),
      }));
      const before = structuredClone(request);
      const result = planToday(request);
      expect(result.screen.mode).toBe('parent-only');
      expect(result.items.map(({ lessonId, reason, offlineOnly }) => ({ lessonId, reason, offlineOnly }))).toEqual(
        eligible ? [{ lessonId: festival.id, reason: 'pinned', offlineOnly: true }] : [],
      );
      if (eligible) expect(result.items[0].lesson).toBe(request.lessons[festival.id]);
      expect(request).toEqual(before);
    }
  });

  it('家长课充足时也保留路线外置顶线下版，仍遵守每日总课数', () => {
    const result = planToday(input(30, {
      route: makeRoute([makeStage({
        themes: [makeTheme('current', ['parent1', 'parent2'])],
        screen: { sessionMaxMin: 8, dailyMaxMin: 1, lessonsPerDay: 2, childLessonsPerDay: 0, coView: 'required' },
      })]),
      lessons: makeIndex(festival, makeSummary('parent1', { audience: 'parent', durationMin: 20 }),
        makeSummary('parent2', { audience: 'parent', durationMin: 20 })),
      child: childAt(30, makePlan({ pinned: [festival.id] }), 'parent-only'),
      usedSec: 60,
    }));
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ lessonId: festival.id, reason: 'pinned', offlineOnly: true });
    expect(result.items[1].lesson.audience).toBe('parent');
    expect(result.items[1]).not.toHaveProperty('offlineOnly');
    expect(result.screen).toMatchObject({ mode: 'parent-only', allowedNow: false, reason: 'daily-limit' });
  });

  it('没有可用阶段时仍保留适龄置顶线下版，并过滤 skipped、重复和不适龄课程', () => {
    const plan = makePlan({
      pinned: ['too-young', 'too-old', 'skipped', festival.id, festival.id, 'legacy', 'extra'],
      skipped: ['skipped'],
    });
    const child = childAt(30, plan, 'parent-only');
    child.screen.dailyMaxMin = 1;
    const result = planToday(input(30, {
      route: makeRoute([]),
      child,
      lessons: makeIndex({ ...festival, durationMin: 20 },
        makeSummary('too-young', { ageRange: [31, 36] }), makeSummary('too-old', { ageRange: [18, 26] }),
        makeSummary('skipped'), makeSummary('legacy', { durationMin: 20 }), 'extra'),
      usedSec: 60,
    }));
    expect(result.stage).toBeNull();
    expect(result.theme).toBeNull();
    expect(result.items.map(({ lessonId, reason, offlineOnly }) => ({ lessonId, reason, offlineOnly }))).toEqual([
      { lessonId: festival.id, reason: 'pinned', offlineOnly: true },
      { lessonId: 'legacy', reason: 'pinned', offlineOnly: true },
    ]);
    expect(result.screen).toMatchObject({ dailyMaxSec: 60, allowedNow: false, mode: 'parent-only' });
  });
});

describe('月龄与屏幕预算共同生效', () => {
  it('不适龄置顶不消耗 child 名额，超额共看课仍尾删且保留家长课', () => {
    const result = planToday(input(30, {
      route: makeRoute([makeStage({
        themes: [makeTheme('current', ['missing'])],
        screen: { sessionMaxMin: 8, dailyMaxMin: 5, lessonsPerDay: 4, childLessonsPerDay: 2, coView: 'required' },
      })]),
      lessons: makeIndex(
        makeSummary('too-young', { ageRange: [31, 36] }),
        makeSummary('too-old', { ageRange: [18, 26] }),
        makeSummary('first', { durationMin: 3, audience: 'child' }),
        makeSummary('second', { durationMin: 4 }),
        makeSummary('third', { durationMin: 1, audience: 'child' }),
        makeSummary('parent', { audience: 'parent', durationMin: 20 }),
      ),
      child: childAt(30, makePlan({ pinned: ['too-young', 'too-old', 'first', 'second', 'third', 'parent'] })),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(['first', 'parent']);
    expect(result.items.every((item) => item.offlineOnly === undefined)).toBe(true);
    expect(result.screen).toMatchObject({ dailyMaxSec: 300, mode: 'co-view' });
  });
});
