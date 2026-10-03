import { describe, expect, it } from 'vitest';
import type { ScreenPolicy, Theme } from '@sprout/schema';
import { planToday } from '../src';
import { deepFreeze, localDate, makeChild, makeIndex, makePlan, makeRoute, makeSession, makeStage, makeSummary, makeTheme } from './fixtures';

type PlanArgs = Parameters<typeof planToday>[0];

function policyRoute(screen: Partial<ScreenPolicy> = {}, themes: Theme[] = [makeTheme('current', ['a', 'b', 'c'])]) {
  return makeRoute([makeStage({
    ageRange: [24, 35],
    themes,
    screen: { sessionMaxMin: 10, dailyMaxMin: 20, lessonsPerDay: 4, coView: 'required', ...screen },
  })]);
}

function input(overrides: Partial<PlanArgs> = {}): PlanArgs {
  return {
    route: policyRoute(),
    lessons: makeIndex('a', 'b', 'c'),
    child: makeChild({ birthday: '1967-07-01' }),
    history: [],
    date: localDate('1970-01-01'),
    usedSec: 0,
    ...overrides,
  };
}

function parentOnlyChild(plan = makePlan()) {
  const child = makeChild({ birthday: '1967-07-01', plan });
  child.screen.mode = 'parent-only';
  return child;
}

describe('planToday child lesson count policy', () => {
  it('主动开启限量共看后，同等完成次数优先提供一节当前主题共看课', () => {
    const result = planToday(input({
      route: policyRoute({ lessonsPerDay: 2, childLessonsPerDay: 1 }, [makeTheme('current', ['parent1', 'child', 'parent2'])]),
      lessons: makeIndex(makeSummary('parent1', { audience: 'parent' }), 'child', makeSummary('parent2', { audience: 'parent' })),
      child: makeChild({ birthday: '1967-07-01' }),
    }));
    expect(result.items).toHaveLength(2);
    expect(result.items[0].lessonId).toBe('child');
    expect(result.items.filter((item) => item.lesson.audience !== 'parent')).toHaveLength(1);
  });
  it.each([
    [undefined, ['a', 'b', 'c']],
    [0, []],
    [1, ['a']],
    [2, ['a', 'b']],
  ] as const)('applies cap %s to explicit and default child audiences, including pinned', (cap, expected) => {
    const result = planToday(input({
      route: policyRoute({ childLessonsPerDay: cap }),
      lessons: makeIndex(makeSummary('a', { audience: 'child' }), 'b', makeSummary('c', { audience: 'child' })),
      child: makeChild({ birthday: '1967-07-01', plan: makePlan({ pinned: ['a', 'b', 'c'] }) }),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(expected);
    expect(result.items.every((item) => item.offlineOnly === undefined)).toBe(true);
  });

  it('continues selecting parents after the pinned child count reaches its cap', () => {
    const result = planToday(input({
      route: policyRoute({ childLessonsPerDay: 1 }, [makeTheme('current', ['a', 'b', 'parent1', 'parent2'])]),
      lessons: makeIndex('a', 'b', makeSummary('parent1', { audience: 'parent', durationMin: 20 }),
        makeSummary('parent2', { audience: 'parent', durationMin: 20 })),
      child: makeChild({ birthday: '1967-07-01', plan: makePlan({ pinned: ['a', 'b', 'parent1', 'parent2'] }) }),
    }));
    expect(result.items.map(({ lessonId, reason }) => ({ lessonId, reason }))).toEqual([
      { lessonId: 'a', reason: 'pinned' },
      { lessonId: 'parent1', reason: 'pinned' },
      { lessonId: 'parent2', reason: 'pinned' },
    ]);
  });

  it.each([
    { source: 'pinned', pinned: ['pin'], themeLessons: ['theme'], reviewLessons: ['review'], expected: 'pin' },
    { source: 'theme', pinned: [], themeLessons: ['theme'], reviewLessons: ['review'], expected: 'theme' },
    { source: 'review', pinned: [], themeLessons: ['missing'], reviewLessons: ['review'], expected: 'review' },
    { source: 'balance', pinned: [], themeLessons: ['missing'], reviewLessons: ['missing'], expected: 'balance' },
  ])('shares the same cap after selecting a $source child lesson', ({ pinned, themeLessons, reviewLessons, expected }) => {
    const result = planToday(input({
      route: policyRoute({ childLessonsPerDay: 1 }, [
        makeTheme('previous', reviewLessons),
        makeTheme('current', themeLessons),
        makeTheme('later', ['balance', 'parent']),
      ]),
      lessons: makeIndex('pin', 'theme', 'review', makeSummary('balance', { domains: ['math'] }),
        makeSummary('parent', { audience: 'parent', domains: ['math'] })),
      child: makeChild({
        birthday: '1967-07-01',
        plan: makePlan({ themeId: 'current', pinned, focusDomains: ['math'] }),
      }),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual([expected, 'parent']);
    expect(result.items.filter((item) => item.lesson.audience !== 'parent')).toHaveLength(1);
  });

  it('keeps the overall lesson limit even when the child cap permits more', () => {
    const result = planToday(input({
      route: policyRoute({ lessonsPerDay: 2, childLessonsPerDay: 4 }),
      lessons: makeIndex('a', 'b', makeSummary('parent', { audience: 'parent' })),
      child: makeChild({ birthday: '1967-07-01', plan: makePlan({ pinned: ['a', 'parent', 'b'] }) }),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(['a', 'parent']);
  });

  it('still trims an over-budget pinned child and does not turn co-view items into offline fallbacks', () => {
    const result = planToday(input({
      route: policyRoute({ dailyMaxMin: 1, childLessonsPerDay: 1 }, [makeTheme('current', ['a', 'b', 'parent'])]),
      lessons: makeIndex('a', 'b', makeSummary('parent', { audience: 'parent', durationMin: 20 })),
      child: makeChild({ birthday: '1967-07-01', plan: makePlan({ pinned: ['a', 'b', 'parent'] }) }),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(['parent']);
    expect(result.items[0]).not.toHaveProperty('offlineOnly');
    expect(result.screen.mode).toBe('co-view');
  });
});

describe('planToday parent-only offline fill', () => {
  it('retains pinned child offline priority and prefers stage parents for unpinned slots', () => {
    const request = input({
      route: policyRoute({ lessonsPerDay: 2 }, [
        makeTheme('current', ['a']),
        makeTheme('later', ['parent1', 'parent2']),
      ]),
      lessons: makeIndex('a', makeSummary('parent1', { audience: 'parent' }), makeSummary('parent2', { audience: 'parent' })),
      child: parentOnlyChild(makePlan({ themeId: 'current', pinned: ['a'] })),
    });
    const result = planToday(request);
    expect(result.items.map((item) => item.lessonId)).toEqual(['a', 'parent1']);
    expect(result.items[0]).toMatchObject({ reason: 'pinned', offlineOnly: true });
    expect(result.items[1]).not.toHaveProperty('offlineOnly');
    const unpinned = planToday({ ...request, child: parentOnlyChild(makePlan({ themeId: 'current' })) });
    expect(unpinned.items.map((item) => item.lessonId)).toEqual(['parent1', 'parent2']);
    expect(unpinned.items.every((item) => item.offlineOnly === undefined)).toBe(true);
  });

  it('fills only the missing slots, without consuming child count or duration budgets', () => {
    const request = deepFreeze(input({
      route: policyRoute({ childLessonsPerDay: 0, dailyMaxMin: 1 }, [
        makeTheme('current', ['parent', 'a', 'legacy']),
        makeTheme('later', ['b', 'c']),
      ]),
      lessons: makeIndex(makeSummary('parent', { audience: 'parent', durationMin: 20 }),
        makeSummary('a', { audience: 'child', durationMin: 20 }), makeSummary('legacy', { durationMin: 20 }),
        makeSummary('b', { audience: 'child', durationMin: 20 }), 'c'),
      child: parentOnlyChild(makePlan({ themeId: 'current', pinned: ['legacy'] })),
      usedSec: 600,
    }));
    const before = structuredClone(request);
    const result = planToday(request);
    expect(result.items.map(({ lessonId, reason, offlineOnly }) => ({ lessonId, reason, offlineOnly }))).toEqual([
      { lessonId: 'legacy', reason: 'pinned', offlineOnly: true },
      { lessonId: 'parent', reason: 'theme', offlineOnly: undefined },
      { lessonId: 'a', reason: 'theme', offlineOnly: true },
      { lessonId: 'b', reason: 'balance', offlineOnly: true },
    ]);
    expect(result.screen).toMatchObject({ mode: 'parent-only', allowedNow: false, reason: 'daily-limit', dailyMaxSec: 60 });
    for (const item of result.items) {
      expect(item.lesson).toBe(request.lessons[item.lessonId]);
    }
    expect(result.items[0].lesson.audience).toBeUndefined();
    expect(result.items[2].lesson.audience).toBe('child');
    expect(planToday(request)).toEqual(result);
    expect(request).toEqual(before);
    expect(planToday({ ...request, lessons: Object.fromEntries(Object.entries(request.lessons).reverse()) })).toEqual(result);
  });

  it('fills current-theme child lessons by completion counts before other themes or focus domains', () => {
    const request = input({
      route: policyRoute({ childLessonsPerDay: 0 }, [
        makeTheme('other', ['focus']),
        makeTheme('current', ['a', 'b', 'c']),
      ]),
      lessons: makeIndex('a', 'b', 'c', makeSummary('focus', { domains: ['math'] })),
      child: parentOnlyChild(makePlan({ themeId: 'current', focusDomains: ['math'] })),
      history: [
        makeSession('a', '1969-12-29'), makeSession('a', '1969-12-30'), makeSession('b', '1969-12-31'),
        makeSession('c', '1969-12-31', { completed: false }),
      ],
    });
    const result = planToday(request);
    expect(result.items.map((item) => item.lessonId)).toEqual(['c', 'b', 'a', 'focus']);
    expect(result.items.every((item) => item.offlineOnly === true)).toBe(true);
    expect(planToday({ ...request, history: [...request.history].reverse() })).toEqual(result);
  });

  it.each([
    ['1970-01-01', ['a', 'b', 'c']],
    ['1970-01-02', ['c', 'a', 'b']],
  ] as const)('keeps current-theme daily rotation for offline lessons on %s', (date, expected) => {
    const result = planToday(input({
      route: policyRoute({ lessonsPerDay: 3, childLessonsPerDay: 0 }),
      child: parentOnlyChild(),
      date: localDate(date),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(expected);
    expect(result.items.every((item) => item.offlineOnly === true)).toBe(true);
  });

  it('keeps age, availability, skipped and deduplication restrictions for pinned fallbacks', () => {
    const lessons = Object.setPrototypeOf(makeIndex(
      makeSummary('parent', { audience: 'parent', ageRange: [30, 30] }),
      makeSummary('young-parent', { audience: 'parent', ageRange: [31, 36] }),
      makeSummary('old-parent', { audience: 'parent', ageRange: [18, 26] }),
      makeSummary('too-young', { audience: 'child', ageRange: [31, 36] }),
      makeSummary('too-old', { ageRange: [18, 26] }),
      makeSummary('at-min', { audience: 'child', ageRange: [30, 36] }),
      makeSummary('at-max', { ageRange: [18, 30] }),
      'skipped', makeSummary('outside', { ageRange: [36, 48] }), makeSummary('unlisted', { ageRange: [36, 48] }),
    ), { inherited: makeSummary('inherited') });
    const result = planToday(input({
      route: makeRoute([
        policyRoute({ childLessonsPerDay: 0 }, [makeTheme('current', [
          'parent', 'young-parent', 'old-parent', 'too-young', 'too-old', 'missing', 'inherited', 'skipped',
          'at-min', 'at-max', 'at-min',
        ])]).stages[0],
        makeStage({ id: 'other-stage', ageRange: [36, 48], themes: [makeTheme('outside-theme', ['outside'])] }),
      ]),
      lessons,
      child: parentOnlyChild(makePlan({
        pinned: ['outside', 'unlisted', 'missing', 'inherited', 'skipped', 'too-young', 'too-old',
          'young-parent', 'old-parent', 'at-min', 'at-min', 'at-max'],
        skipped: ['skipped'],
      })),
    }));
    expect(result.items.map(({ lessonId, reason, offlineOnly }) => ({ lessonId, reason, offlineOnly }))).toEqual([
      { lessonId: 'at-min', reason: 'pinned', offlineOnly: true },
      { lessonId: 'at-max', reason: 'pinned', offlineOnly: true },
      { lessonId: 'parent', reason: 'theme', offlineOnly: undefined },
    ]);
  });

  it('only admits an eligible child from another manual-theme stage when explicitly pinned', () => {
    const request = input({
      route: makeRoute([
        policyRoute({ lessonsPerDay: 3 }, [makeTheme('age-theme', ['parent', 'a'])]).stages[0],
        makeStage({
          id: 'other-stage',
          ageRange: [36, 48],
          themes: [makeTheme('previous', ['missing']), makeTheme('manual', ['outside'])],
        }),
      ]),
      lessons: makeIndex('a', 'outside', makeSummary('parent', { audience: 'parent' })),
      child: parentOnlyChild(makePlan({ themeId: 'manual' })),
    });
    const result = planToday(request);
    expect(result.stage?.ageRange).toEqual([24, 35]);
    expect(result.theme?.id).toBe('manual');
    expect(result.items.map((item) => item.lessonId)).toEqual(['parent', 'a']);
    expect(result.items[0]).not.toHaveProperty('offlineOnly');
    expect(result.items[1].offlineOnly).toBe(true);
    const pinned = planToday({
      ...request,
      child: parentOnlyChild(makePlan({ themeId: 'manual', pinned: ['outside'] })),
    });
    expect(pinned.items.map((item) => item.lessonId)).toEqual(['outside', 'parent', 'a']);
    expect(pinned.items[0]).toMatchObject({ reason: 'pinned', offlineOnly: true });
    expect(pinned.items[1]).not.toHaveProperty('offlineOnly');
    expect(pinned.items[2].offlineOnly).toBe(true);
  });

  it('keeps available pinned parents and offline children without inventing a fallback stage', () => {
    const result = planToday(input({
      route: makeRoute([]),
      lessons: makeIndex('a', 'b', makeSummary('parent', { audience: 'parent' })),
      child: parentOnlyChild(makePlan({ pinned: ['a', 'parent'] })),
    }));
    expect(result.stage).toBeNull();
    expect(result.items.map((item) => item.lessonId)).toEqual(['a', 'parent']);
    expect(result.items[0]).toMatchObject({ reason: 'pinned', offlineOnly: true });
    expect(result.items[1]).not.toHaveProperty('offlineOnly');
  });

  it.each([
    [undefined, 'optional'],
    ['auto', 'none'],
    ['parent-only', 'default'],
  ] as const)('uses the resolved parent-only mode for setting %s and stage %s', (mode, childScreen) => {
    const child = makeChild({ birthday: '1967-07-01' });
    child.screen.mode = mode;
    const result = planToday(input({
      route: policyRoute({ childScreen, lessonsPerDay: 1, childLessonsPerDay: 0 }, [makeTheme('current', ['a'])]),
      lessons: makeIndex('a'),
      child,
    }));
    expect(result.screen.mode).toBe('parent-only');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ lessonId: 'a', offlineOnly: true });
  });

  it('does not bypass skipped lessons or change the offline selection outside screen windows', () => {
    const child = parentOnlyChild(makePlan({ pinned: ['a', 'a'], skipped: ['a'] }));
    const request = input({
      route: policyRoute({ lessonsPerDay: 2, childLessonsPerDay: 0 }),
      child,
    });
    const result = planToday(request);
    expect(result.items.map((item) => item.lessonId)).toEqual(['b', 'c']);
    child.screen.windows = [{ start: '18:00', end: '19:00' }];
    const blocked = planToday(request);
    expect(blocked.items).toEqual(result.items);
    expect(blocked.screen).toMatchObject({ allowedNow: false, reason: 'outside-window', nextWindow: '18:00' });
  });
});
