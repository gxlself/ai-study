import { describe, expect, it } from 'vitest';
import { planToday } from '../src';
import { deepFreeze, localDate, makeChild, makeIndex, makePlan, makeRoute, makeSession, makeStage, makeSummary, makeTheme } from './fixtures';

type PlanArgs = Parameters<typeof planToday>[0];

function args(overrides: Partial<PlanArgs> = {}): PlanArgs {
  return {
    route: makeRoute(),
    lessons: makeIndex('a', 'b', 'c'),
    child: makeChild(),
    history: [],
    date: localDate('2024-07-01'),
    usedSec: 0,
    ...overrides,
  };
}

function configuredRoute(count: number, themes = [makeTheme('current', ['a', 'b', 'c'])], dailyMaxMin = 20) {
  return makeRoute([makeStage({
    themes,
    screen: { sessionMaxMin: 10, dailyMaxMin, lessonsPerDay: count, coView: 'required' },
  })]);
}

function choices(input: PlanArgs) {
  return planToday(input).items.map(({ lessonId, reason }) => ({ lessonId, reason }));
}

describe('planToday metadata and empty states', () => {
  it('returns the exact public plan shape, local age, and screen policy', () => {
    const input = args();
    const result = planToday(input);
    expect(result).toEqual({
      date: '2024-07-01',
      child: { id: 'test.child', name: 'Sprout', ageMonths: 30, ageDays: 912 },
      route: { id: 'test.route', title: { zh: 'Test route' } },
      stage: { id: 'test.stage', title: { zh: 'Test stage' }, ageRange: [6, 36] },
      theme: { id: 'test.theme', title: { zh: 'test.theme' }, weekIndex: 0, weeks: 1 },
      items: [
        { lessonId: 'a', reason: 'theme', lesson: input.lessons.a },
        { lessonId: 'b', reason: 'theme', lesson: input.lessons.b },
      ],
      screen: { usedSec: 0, dailyMaxSec: 1200, sessionMaxSec: 600, allowedNow: true, coView: 'required', mode: 'co-view' },
    });
  });

  it('uses schema ageOf for month-end ages without changing its contract', () => {
    const route = makeRoute([
      makeStage({ id: 'zero', ageRange: [0, 0] }),
      makeStage({ id: 'one', ageRange: [1, 36] }),
    ]);
    const input = args({ route, child: makeChild({ birthday: '2024-01-31' }) });
    const before = planToday({ ...input, date: localDate('2024-02-29') });
    const after = planToday({ ...input, date: localDate('2024-03-01') });
    expect(before.child).toMatchObject({ ageMonths: 0, ageDays: 29 });
    expect(before.stage?.id).toBe('zero');
    expect(after.child).toMatchObject({ ageMonths: 1, ageDays: 30 });
    expect(after.stage?.id).toBe('one');
  });

  it('supports a route without stages and still schedules available pinned lessons', () => {
    const input = args({
      route: makeRoute([]),
      child: makeChild({ plan: makePlan({ pinned: ['c', 'a', 'b'] }) }),
    });
    expect(planToday(input)).toMatchObject({
      stage: null, theme: null,
      items: [{ lessonId: 'c', reason: 'pinned' }, { lessonId: 'a', reason: 'pinned' }],
      screen: { dailyMaxSec: 1200, sessionMaxSec: 600, coView: 'required' },
    });
  });

  it('returns an empty plan when there is no available content', () => {
    expect(planToday(args({ lessons: {} })).items).toEqual([]);
    expect(planToday(args({ route: makeRoute([]) })).items).toEqual([]);
    expect(planToday(args({
      child: makeChild({ plan: makePlan({ skipped: ['a', 'b', 'c'] }) }),
    })).items).toEqual([]);
  });

  it('remains deterministic and does not mutate frozen inputs', () => {
    const input = deepFreeze(args({
      child: makeChild({ plan: makePlan({ pinned: ['c'] }) }),
      history: [makeSession('a', '2024-06-29'), makeSession('b', '2024-06-30')],
    }));
    const original = structuredClone(input);
    expect(planToday(input)).toEqual(planToday(input));
    expect(input).toEqual(original);
    expect(planToday({ ...input, lessons: Object.fromEntries(Object.entries(input.lessons).reverse()) }))
      .toEqual(planToday(input));
    expect(planToday({ ...input, history: [...input.history].reverse() })).toEqual(planToday(input));
  });
});

describe('planToday priority and rotation', () => {
  it('keeps pinned order, lets skipped win, and deduplicates across every source', () => {
    const input = args({
      route: configuredRoute(4, [makeTheme('current', ['a', 'blocked', 'b', 'b', 'c'])]),
      lessons: makeIndex('a', 'b', 'c', 'blocked', makeSummary('future', { ageRange: [48, 60] }),
        makeSummary('external', { ageRange: [24, 36] })),
      child: makeChild({
        plan: makePlan({ pinned: ['missing', 'future', 'a', 'a', 'blocked', 'external'], skipped: ['blocked'] }),
      }),
    });
    const result = choices(input);
    expect(result.slice(0, 2)).toEqual([
      { lessonId: 'a', reason: 'pinned' }, { lessonId: 'external', reason: 'pinned' },
    ]);
    expect(result.slice(2).map((item) => item.lessonId).sort()).toEqual(['b', 'c']);
    expect(result.slice(2).every((item) => item.reason === 'theme')).toBe(true);
  });

  it('fills the entire count with pinned lessons when enough are available', () => {
    expect(choices(args({
      child: makeChild({ plan: makePlan({ pinned: ['c', 'a', 'b'] }) }),
    }))).toEqual([{ lessonId: 'c', reason: 'pinned' }, { lessonId: 'a', reason: 'pinned' }]);
  });

  it('does not reserve a review or focus slot before the current theme is exhausted', () => {
    const route = configuredRoute(2, [
      makeTheme('previous', ['review']),
      makeTheme('current', ['a', 'b', 'c']),
      makeTheme('focus', ['focus']),
    ]);
    const result = planToday(args({
      route,
      lessons: makeIndex('a', 'b', 'c', 'review', makeSummary('focus', { domains: ['math'] })),
      child: makeChild({ plan: makePlan({ themeId: 'current', focusDomains: ['math'] }) }),
    }));
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.reason === 'theme')).toBe(true);
  });

  it('prioritizes completed counts, not attempts, durations, or latest completion', () => {
    const result = planToday(args({
      route: configuredRoute(4, [makeTheme('current', ['a', 'b', 'c', 'd'])]),
      lessons: makeIndex('a', 'b', 'c', 'd'),
      date: localDate('1970-01-01'),
      child: makeChild({ birthday: '1967-01-01' }),
      history: [
        makeSession('a', '1969-12-29'),
        makeSession('a', '1969-12-30', { durationSec: 0 }),
        makeSession('b', '1969-12-31'),
        ...Array.from({ length: 4 }, () => makeSession('c', '1969-12-31', { completed: false, durationSec: 1200 })),
      ],
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(['c', 'd', 'b', 'a']);
  });

  it.each([
    ['1969-12-31', ['b', 'c', 'a']],
    ['1970-01-01', ['a', 'b', 'c']],
    ['1970-01-02', ['c', 'a', 'b']],
    ['1970-01-03', ['b', 'c', 'a']],
    ['1970-01-04', ['a', 'b', 'c']],
  ])('rotates ties using the local epoch day on %s', (date, expected) => {
    const result = planToday(args({
      route: configuredRoute(3),
      child: makeChild({ birthday: '1967-01-01' }),
      date: localDate(date),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(expected);
  });

  it('uses the original theme indices and length before unavailable/skipped filtering', () => {
    const result = planToday(args({
      route: configuredRoute(3, [makeTheme('current', ['a', 'missing', 'b', 'c'])]),
      child: makeChild({ birthday: '1967-01-01' }),
      date: localDate('1970-01-02'),
    }));
    expect(result.items.map((item) => item.lessonId)).toEqual(['c', 'a', 'b']);
  });

  it('does not let malformed or future-dated history alter a historical plan', () => {
    const input = args({
      route: configuredRoute(3),
      date: localDate('1970-01-01'),
      child: makeChild({ birthday: '1967-01-01' }),
    });
    expect(planToday({
      ...input,
      history: [
        makeSession('a', '1970-01-02'),
        makeSession('a', '1970-01-01', { startedAt: 'invalid' }),
      ],
    })).toEqual(planToday(input));
  });

  it('only accepts own entries of the available lesson index', () => {
    const lessons: Record<string, ReturnType<typeof makeSummary>> = Object.setPrototypeOf(
      makeIndex('constructor', 'toString', '__proto__'), { ghost: makeSummary('ghost') },
    );
    const result = planToday(args({
      route: configuredRoute(4, [makeTheme('current', ['ghost', 'constructor', 'toString', '__proto__'])]),
      lessons,
      child: makeChild({ plan: makePlan({ pinned: ['ghost'] }) }),
    }));
    expect(result.items.map((item) => item.lessonId).sort()).toEqual(['__proto__', 'constructor', 'toString']);
  });
});

describe('planToday review and balance fill', () => {
  it('adds at most one previous-theme review before filling primary focus domains', () => {
    const route = configuredRoute(4, [
      makeTheme('previous', ['r1', 'r2']),
      makeTheme('current', ['a']),
      makeTheme('later', ['secondary', 'm1', 'm2']),
    ]);
    const result = choices(args({
      route,
      lessons: makeIndex('a', 'r1', 'r2', makeSummary('secondary', { domains: ['language', 'math'] }),
        makeSummary('m1', { domains: ['math', 'language'] }), makeSummary('m2', { domains: ['math'] })),
      child: makeChild({ plan: makePlan({ themeId: 'current', focusDomains: ['math'] }) }),
    }));
    expect(result).toEqual([
      { lessonId: 'a', reason: 'theme' },
      { lessonId: 'r1', reason: 'review' },
      { lessonId: 'm1', reason: 'balance' },
      { lessonId: 'm2', reason: 'balance' },
    ]);
  });

  it('does not add review when the requested lesson count is one', () => {
    expect(choices(args({
      route: configuredRoute(1, [makeTheme('previous', ['r']), makeTheme('current', ['missing'])]),
      lessons: makeIndex('r'),
      child: makeChild({ plan: makePlan({ themeId: 'current' }) }),
    }))).toEqual([]);
  });

  it('does not fill multiple empty slots from review alone', () => {
    expect(choices(args({
      route: configuredRoute(4, [makeTheme('previous', ['r1', 'r2']), makeTheme('current', ['missing'])]),
      lessons: makeIndex('r1', 'r2'),
      child: makeChild({ plan: makePlan({ themeId: 'current' }) }),
    }))).toEqual([{ lessonId: 'r1', reason: 'review' }]);
  });

  it('reviews the immediately previous stage last theme, not an earlier theme', () => {
    const route = makeRoute([
      makeStage({ id: 'earlier', ageRange: [0, 5], themes: [makeTheme('old', ['wrong']), makeTheme('last', ['r'])] }),
      makeStage({ id: 'current', ageRange: [6, 36], themes: [makeTheme('first', ['a'])] }),
    ]);
    expect(choices(args({ route, lessons: makeIndex('wrong', 'r', 'a') }))).toEqual([
      { lessonId: 'a', reason: 'theme' }, { lessonId: 'r', reason: 'review' },
    ]);
  });

  it('does not wrap review from the route first theme to the last theme', () => {
    const route = configuredRoute(2, [makeTheme('first', ['a']), makeTheme('last', ['r'])]);
    expect(choices(args({
      route, lessons: makeIndex('a', 'r'), child: makeChild({ plan: makePlan({ themeId: 'first' }) }),
    }))).toEqual([{ lessonId: 'a', reason: 'theme' }]);
  });

  it('uses the manual theme owning stage for review while keeping age-stage policy', () => {
    const route = makeRoute([
      makeStage({ id: 'age-stage', ageRange: [24, 35], themes: [makeTheme('age-theme', ['a'])] }),
      makeStage({ id: 'manual-stage', ageRange: [36, 48], themes: [makeTheme('previous', ['r']), makeTheme('manual', ['m'])] }),
    ]);
    const result = planToday(args({
      route, lessons: makeIndex('a', 'r', 'm'),
      child: makeChild({ plan: makePlan({ themeId: 'manual' }) }),
    }));
    expect(result.stage?.id).toBe('age-stage');
    expect(result.items.map(({ lessonId, reason }) => ({ lessonId, reason }))).toEqual([
      { lessonId: 'm', reason: 'theme' }, { lessonId: 'r', reason: 'review' },
    ]);
  });

  it.each([
    ['2024-07-20', false, false],
    ['2024-07-19', true, false],
    ['2024-07-14', false, false],
    ['2024-07-13', true, true],
    ['2024-07-21', true, true],
  ])('checks seven local calendar days for review at %s (completed %s)', (date, completed, eligible) => {
    const result = choices(args({
      route: configuredRoute(2, [makeTheme('previous', ['r']), makeTheme('current', ['a'])]),
      lessons: makeIndex('a', 'r'),
      child: makeChild({ plan: makePlan({ themeId: 'current' }) }),
      date: localDate('2024-07-20'),
      history: [makeSession('r', date, { completed })],
    }));
    expect(result.some((item) => item.reason === 'review')).toBe(eligible);
  });

  it('skips unavailable, skipped, selected and recently attempted review candidates', () => {
    const result = choices(args({
      route: configuredRoute(4, [
        makeTheme('previous', ['missing', 'skipped', 'pin', 'recent', 'old', 'unused']),
        makeTheme('current', ['a']),
      ]),
      lessons: makeIndex('a', 'skipped', 'pin', 'recent', 'old', 'unused'),
      child: makeChild({ plan: makePlan({ themeId: 'current', pinned: ['pin'], skipped: ['skipped'] }) }),
      date: localDate('2024-07-20'),
      history: [makeSession('recent', '2024-07-19', { completed: false }), makeSession('old', '2024-07-13')],
    }));
    expect(result).toEqual([
      { lessonId: 'pin', reason: 'pinned' }, { lessonId: 'a', reason: 'theme' }, { lessonId: 'old', reason: 'review' },
    ]);
  });

  it('limits balance to available, unskipped primary-focus lessons in the age stage', () => {
    const route = makeRoute([
      makeStage({ id: 'other', ageRange: [0, 5], themes: [makeTheme('other-theme', ['outside'])] }),
      makeStage({
        themes: [makeTheme('current', ['a']), makeTheme('focus', ['missing', 'skip', 'secondary', 'm', 'm', 'music'])],
        screen: { sessionMaxMin: 10, dailyMaxMin: 20, lessonsPerDay: 4, coView: 'required' },
      }),
    ]);
    expect(choices(args({
      route,
      lessons: makeIndex('a', makeSummary('outside', { domains: ['math'] }),
        makeSummary('skip', { domains: ['math'] }), makeSummary('secondary', { domains: ['language', 'math'] }),
        makeSummary('m', { domains: ['math'] }), makeSummary('music', { domains: ['music'] }),
        makeSummary('unlisted', { domains: ['math'] })),
      child: makeChild({ plan: makePlan({ themeId: 'current', skipped: ['skip'], focusDomains: ['math', 'music'] }) }),
      history: [makeSession('outside')],
    }))).toEqual([
      { lessonId: 'a', reason: 'theme' }, { lessonId: 'm', reason: 'balance' }, { lessonId: 'music', reason: 'balance' },
    ]);
  });

  it('does not fill from unrelated themes when focusDomains is empty', () => {
    expect(choices(args({
      route: configuredRoute(3, [makeTheme('current', ['a']), makeTheme('other', ['b', 'c'])]),
      child: makeChild({ plan: makePlan({ themeId: 'current' }) }),
    }))).toEqual([{ lessonId: 'a', reason: 'theme' }]);
  });
});

describe('planToday budget and screen status', () => {
  it('trims only from the tail, without replacing an expensive higher-priority lesson', () => {
    const result = choices(args({
      route: configuredRoute(4, undefined, 10),
      lessons: makeIndex(makeSummary('a', { durationMin: 4 }), makeSummary('b', { durationMin: 9 }),
        makeSummary('c', { durationMin: 1 }), makeSummary('d', { durationMin: 1 })),
      child: makeChild({ plan: makePlan({ pinned: ['a', 'b', 'c', 'd'] }) }),
    }));
    expect(result).toEqual([{ lessonId: 'a', reason: 'pinned' }]);
  });

  it('does not retain a child lesson that alone exceeds the daily budget', () => {
    expect(choices(args({
      route: configuredRoute(2, undefined, 1),
      child: makeChild({ plan: makePlan({ pinned: ['a', 'b'] }) }),
    }))).toEqual([]);
  });

  it.each([
    [2, 3, 5, 2],
    [1.1, 2.2, 3.3, 2],
    [1.1, 2.21, 3.3, 1],
  ])('handles exact and fractional budgets %s + %s vs %s', (first, second, dailyMaxMin, expected) => {
    const result = planToday(args({
      route: configuredRoute(2, undefined, dailyMaxMin),
      lessons: makeIndex(makeSummary('a', { durationMin: first }), makeSummary('b', { durationMin: second })),
      child: makeChild({ plan: makePlan({ pinned: ['a', 'b'] }) }),
    }));
    expect(result.items).toHaveLength(expected);
  });

  it('uses the child daily override for tail trimming', () => {
    const child = makeChild();
    child.screen.dailyMaxMin = 5;
    child.plan.pinned = ['a', 'b'];
    expect(planToday(args({ child })).items.map((item) => item.lessonId)).toEqual(['a']);
  });

  it('does not subtract usedSec from the plan budget or erase the plan when screen use is blocked', () => {
    const input = args({ route: configuredRoute(2, undefined, 10) });
    const remaining = planToday({ ...input, usedSec: 599 });
    const blocked = planToday({ ...input, usedSec: 600 });
    expect(remaining.items).toEqual(planToday(input).items);
    expect(blocked.items).toEqual(remaining.items);
    expect(remaining.screen.allowedNow).toBe(true);
    expect(blocked.screen).toMatchObject({ usedSec: 600, allowedNow: false, reason: 'daily-limit' });
  });

  it('reports windows and next opening without changing the lesson selection', () => {
    const child = makeChild();
    child.screen.windows = [{ start: '18:00', end: '19:00' }];
    const result = planToday(args({ child }));
    expect(result.items).toHaveLength(2);
    expect(result.screen).toMatchObject({ allowedNow: false, reason: 'outside-window', nextWindow: '18:00' });
  });
});
