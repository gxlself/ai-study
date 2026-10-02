import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeStats, currentTheme, localDateString, planToday, screenStatus } from '../src';
import { localDate, makeChild, makeIndex, makePlan, makeRoute, makeSession, makeStage, makeTheme } from './fixtures';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  { zone: 'UTC', offset: 0 },
  { zone: 'Asia/Seoul', offset: -540 },
  { zone: 'Asia/Kolkata', offset: -330 },
  { zone: 'America/New_York', offset: 300 },
])('local calendar in $zone', ({ zone, offset }) => {
  beforeEach(() => {
    vi.stubEnv('TZ', zone);
  });

  it('actually applies the tested timezone', () => {
    expect(new Date('2024-01-01T00:00:00Z').getTimezoneOffset()).toBe(offset);
  });

  it('formats local components without converting the date to UTC', () => {
    expect(localDateString(localDate('2024-07-01', 0, 5))).toBe('2024-07-01');
    expect(localDateString(localDate('2024-12-31', 23, 59))).toBe('2024-12-31');
    expect(localDateString(localDate('0001-01-02'))).toBe('0001-01-02');
  });

  it('rotates by the same calendar-day index regardless of local time or timezone', () => {
    const route = makeRoute([makeStage({
      themes: [makeTheme('current', ['a', 'b', 'c'])],
      screen: { sessionMaxMin: 10, dailyMaxMin: 20, lessonsPerDay: 3, coView: 'required' },
    })]);
    const input = {
      route, lessons: makeIndex('a', 'b', 'c'), child: makeChild({ birthday: '1967-01-01' }), history: [], usedSec: 0,
    };
    for (const hour of [0, 12, 23]) {
      expect(planToday({ ...input, date: localDate('1970-01-02', hour) }).items.map((item) => item.lessonId))
        .toEqual(['c', 'a', 'b']);
    }
  });

  it('buckets ISO timestamps at local midnight rather than UTC midnight', () => {
    const result = computeStats([
      makeSession('a', '2024-06-30', { startedAt: localDate('2024-06-30', 23, 59).toISOString(), durationSec: 10 }),
      makeSession('a', '2024-07-01', { startedAt: localDate('2024-07-01', 0, 1).toISOString(), durationSec: 20 }),
    ], makeIndex('a'), 2, localDate('2024-07-01'));
    expect(result.days).toEqual([
      { date: '2024-06-30', screenSec: 10, lessons: 1, completed: 1 },
      { date: '2024-07-01', screenSec: 20, lessons: 1, completed: 1 },
    ]);
    expect(result.streakDays).toBe(2);
  });

  it('retains the correct month-end theme anchor', () => {
    const stage = makeStage({ ageRange: [1, 36], themes: [makeTheme('current', ['a'], 8)] });
    expect(currentTheme(makeRoute([stage]), stage, makeChild({ birthday: '2024-01-31' }), localDate('2024-03-07', 0)))
      .toEqual({ theme: stage.themes[0], weekIndex: 1 });
  });
});

describe('DST boundaries in America/New_York', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/New_York');
  });

  it('counts a spring-forward calendar week even when only 167 hours have elapsed', () => {
    const stage = makeStage({ themes: [makeTheme('current', ['a'], 8)] });
    const date = localDate('2024-03-11', 0);
    expect((date.getTime() - localDate('2024-03-04', 0).getTime()) / 3_600_000).toBe(167);
    expect(currentTheme(makeRoute([stage]), stage, makeChild({ birthday: '2023-09-04' }), date)?.weekIndex).toBe(1);
  });

  it('does not advance early in the 25-hour fall-back week', () => {
    const stage = makeStage({ themes: [makeTheme('current', ['a'], 8)] });
    const route = makeRoute([stage]);
    const child = makeChild({ birthday: '2024-05-03' });
    expect(currentTheme(route, stage, child, localDate('2024-11-09', 23, 59))?.weekIndex).toBe(0);
    expect(currentTheme(route, stage, child, localDate('2024-11-10', 0))?.weekIndex).toBe(1);
  });

  it.each([
    ['2024-03-12', ['2024-03-08', '2024-03-09', '2024-03-10', '2024-03-11', '2024-03-12']],
    ['2024-11-05', ['2024-11-01', '2024-11-02', '2024-11-03', '2024-11-04', '2024-11-05']],
  ])('keeps exactly one bucket per local day and an intact streak ending %s', (date, dates) => {
    const result = computeStats(dates.map((day) => makeSession('a', day)), makeIndex('a'), 5, localDate(date, 0));
    expect(result.days.map((day) => day.date)).toEqual(dates);
    expect(result.days.map((day) => day.screenSec)).toEqual([60, 60, 60, 60, 60]);
    expect(result.totalSec).toBe(300);
    expect(result.streakDays).toBe(5);
  });

  it('keeps both repeated 01:30 sessions on the same local day', () => {
    const result = computeStats([
      makeSession('a', '2024-11-03', { startedAt: '2024-11-03T01:30:00-04:00', durationSec: 10 }),
      makeSession('a', '2024-11-03', { startedAt: '2024-11-03T01:30:00-05:00', durationSec: 20 }),
    ], makeIndex('a'), 2, localDate('2024-11-04'));
    expect(result.days.map((day) => day.screenSec)).toEqual([30, 0]);
    expect(result.days[0].lessons).toBe(2);
    expect(result.domains).toEqual({ language: 30 });
    expect(result.streakDays).toBe(1);
  });

  it('applies local wall-clock windows to both occurrences of a repeated hour', () => {
    const policy = makeStage().screen;
    const windows = [{ start: '01:00', end: '02:00' }];
    for (const now of [new Date('2024-11-03T01:30:00-04:00'), new Date('2024-11-03T01:30:00-05:00')]) {
      expect(screenStatus({ policy, windows, usedSec: 0, now }).allowedNow).toBe(true);
    }
    expect(screenStatus({ policy, windows, usedSec: 0, now: new Date('2024-11-03T02:00:00-05:00') }).allowedNow)
      .toBe(false);
  });

  it('changes lesson rotation at midnight, not after a fixed 24-hour duration', () => {
    const route = makeRoute([makeStage({
      themes: [makeTheme('current', ['a', 'b', 'c'])],
      screen: { sessionMaxMin: 10, dailyMaxMin: 20, lessonsPerDay: 3, coView: 'required' },
    })]);
    const input = {
      route, child: makeChild(), lessons: makeIndex('a', 'b', 'c'), history: [], usedSec: 0,
    };
    for (const [before, after] of [['2024-03-10', '2024-03-11'], ['2024-11-03', '2024-11-04']]) {
      const first = planToday({ ...input, date: localDate(before, 0) }).items.map((item) => item.lessonId);
      const second = planToday({ ...input, date: localDate(after, 0) }).items.map((item) => item.lessonId);
      expect(second).toEqual([first[2], first[0], first[1]]);
    }
  });

  it('uses seven calendar days for review across the shorter DST week', () => {
    const route = makeRoute([makeStage({
      themes: [makeTheme('previous', ['old', 'recent']), makeTheme('current', ['a'])],
    })]);
    const result = planToday({
      route, lessons: makeIndex('a', 'old', 'recent'),
      child: makeChild({ birthday: '2021-09-01', plan: makePlan({ themeId: 'current' }) }),
      date: localDate('2024-03-11', 0), usedSec: 0,
      history: [
        makeSession('old', '2024-03-04', { startedAt: localDate('2024-03-04', 23, 59).toISOString() }),
        makeSession('recent', '2024-03-05', { startedAt: localDate('2024-03-05', 0).toISOString() }),
      ],
    });
    expect(result.items.map(({ lessonId, reason }) => ({ lessonId, reason }))).toEqual([
      { lessonId: 'a', reason: 'theme' }, { lessonId: 'old', reason: 'review' },
    ]);
  });
});
