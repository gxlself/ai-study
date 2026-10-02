import { describe, expect, it } from 'vitest';
import { computeStats } from '../src';
import { deepFreeze, localDate, makeIndex, makeSession, makeSummary } from './fixtures';

describe('computeStats daily totals and domains', () => {
  const today = localDate('2024-07-01');

  it('returns ascending local days including today and zero-fills empty dates', () => {
    expect(computeStats([], {}, 3, today)).toEqual({
      days: [
        { date: '2024-06-29', screenSec: 0, lessons: 0, completed: 0 },
        { date: '2024-06-30', screenSec: 0, lessons: 0, completed: 0 },
        { date: '2024-07-01', screenSec: 0, lessons: 0, completed: 0 },
      ],
      domains: {},
      totalSec: 0,
      streakDays: 0,
    });
  });

  it('counts sessions, repeated attempts and completions separately without duplicating domain time', () => {
    const lessons = makeIndex(
      makeSummary('a', { domains: ['language', 'math', 'music'] }),
      makeSummary('b', { domains: ['math', 'language'] }),
    );
    const sessions = [
      makeSession('a', '2024-06-30', { durationSec: 90 }),
      makeSession('a', '2024-06-30', { completed: false, durationSec: 30 }),
      makeSession('a', '2024-07-01', { durationSec: 120 }),
      makeSession('b', '2024-07-01', { completed: false, durationSec: 15 }),
      makeSession('removed', '2024-07-01', { durationSec: 45 }),
    ];
    expect(computeStats(sessions, lessons, 3, today)).toEqual({
      days: [
        { date: '2024-06-29', screenSec: 0, lessons: 0, completed: 0 },
        { date: '2024-06-30', screenSec: 120, lessons: 2, completed: 1 },
        { date: '2024-07-01', screenSec: 180, lessons: 3, completed: 2 },
      ],
      domains: { language: 240, math: 15 },
      totalSec: 300,
      streakDays: 2,
    });
  });

  it('does not split domain seconds or use recommended lesson durations', () => {
    const lessons = makeIndex(makeSummary('a', { domains: ['math', 'language', 'math'], durationMin: 20 }));
    const result = computeStats([makeSession('a', '2024-07-01', { durationSec: 101 })], lessons, 1, today);
    expect(result.domains).toEqual({ math: 101 });
    expect(result.totalSec).toBe(101);
    expect(Object.values(result.domains).reduce((total, seconds) => total + seconds, 0)).toBe(result.totalSec);
  });

  it('counts removed lessons in totals without guessing their domain', () => {
    const result = computeStats([makeSession('removed')], {}, 1, today);
    expect(result.totalSec).toBe(60);
    expect(result.days[0]).toMatchObject({ lessons: 1, completed: 1, screenSec: 60 });
    expect(result.domains).toEqual({});
  });

  it('ignores inherited entries in the lesson index', () => {
    const lessons = Object.create({ ghost: makeSummary('ghost') }) as Record<string, ReturnType<typeof makeSummary>>;
    expect(computeStats([makeSession('ghost')], lessons, 1, today).domains).toEqual({});
  });

  it('includes complete boundary dates, excluding old, future and invalid timestamps from totals', () => {
    const sessions = [
      makeSession('a', '2024-06-29', { startedAt: localDate('2024-06-29', 0).toISOString(), durationSec: 1 }),
      makeSession('a', '2024-07-01', { startedAt: localDate('2024-07-01', 23, 59, 59).toISOString(), durationSec: 2 }),
      makeSession('a', '2024-06-28'),
      makeSession('a', '2024-07-02'),
      makeSession('a', '2024-07-01', { startedAt: 'invalid' }),
    ];
    const result = computeStats(sessions, makeIndex('a'), 3, today);
    expect(result.totalSec).toBe(3);
    expect(result.domains).toEqual({ language: 3 });
    expect(result.days.map((day) => day.screenSec)).toEqual([1, 0, 2]);
  });

  it('assigns the entire session to its local start day, even if its duration crosses midnight', () => {
    const result = computeStats([
      makeSession('a', '2024-06-30', { startedAt: localDate('2024-06-30', 23, 59).toISOString(), durationSec: 300 }),
    ], makeIndex('a'), 2, today);
    expect(result.days.map((day) => day.screenSec)).toEqual([300, 0]);
    expect(result.domains).toEqual({ language: 300 });
  });

  it('crosses leap-day, month and year boundaries without gaps', () => {
    expect(computeStats([], {}, 3, localDate('2024-03-01')).days.map((day) => day.date))
      .toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(computeStats([], {}, 3, localDate('2025-01-01')).days.map((day) => day.date))
      .toEqual(['2024-12-30', '2024-12-31', '2025-01-01']);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'returns empty stats for an unusable day count: %s',
    (days) => {
      expect(computeStats([makeSession('a')], makeIndex('a'), days, today)).toEqual({
        days: [], domains: {}, totalSec: 0, streakDays: 0,
      });
    },
  );

  it('rounds a fractional day count down', () => {
    expect(computeStats([], {}, 2.9, today).days.map((day) => day.date)).toEqual(['2024-06-30', '2024-07-01']);
  });

  it('is deterministic, input-order independent, and leaves inputs untouched', () => {
    const sessions = deepFreeze([makeSession('a', '2024-06-30'), makeSession('b'), makeSession('a')]);
    const lessons = deepFreeze(makeIndex('a', 'b'));
    const snapshot = structuredClone({ sessions, lessons, today });
    const result = computeStats(sessions, lessons, 3, today);
    expect(computeStats(sessions, lessons, 3, today)).toEqual(result);
    expect(computeStats([...sessions].reverse(), lessons, 3, today)).toEqual(result);
    expect({ sessions, lessons, today }).toEqual(snapshot);
  });
});

describe('computeStats streak', () => {
  const today = localDate('2024-07-10');
  const index = makeIndex('a');

  it('counts continuous local learning dates, not sessions or a historical maximum', () => {
    const sessions = [
      ...['2024-07-01', '2024-07-02', '2024-07-03', '2024-07-04', '2024-07-08', '2024-07-09', '2024-07-10']
        .map((date) => makeSession('a', date)),
      makeSession('a', '2024-07-10'),
    ];
    expect(computeStats(sessions, index, 10, today).streakDays).toBe(3);
  });

  it('does not break a streak merely because today has no session yet', () => {
    const sessions = ['2024-07-07', '2024-07-08', '2024-07-09'].map((date) => makeSession('a', date));
    expect(computeStats(sessions, index, 7, today).streakDays).toBe(3);
  });

  it('returns zero when neither today nor yesterday has a session', () => {
    const sessions = ['2024-07-07', '2024-07-08', '2024-07-11'].map((date) => makeSession('a', date));
    expect(computeStats(sessions, index, 7, today).streakDays).toBe(0);
  });

  it('bounds streak to the requested report range', () => {
    const sessions = Array.from({ length: 10 }, (_, index) => makeSession('a', `2024-07-${String(index + 1).padStart(2, '0')}`));
    expect(computeStats(sessions, index, 3, today)).toMatchObject({ totalSec: 180, streakDays: 3 });
    expect(computeStats(sessions, index, 10, today).streakDays).toBe(10);
  });

  it('uses recorded learning days, including unfinished or zero-duration sessions', () => {
    const sessions = [
      makeSession('a', '2024-07-09', { completed: false, durationSec: 0 }),
      makeSession('a', '2024-07-10', { completed: false, durationSec: 5 }),
    ];
    const result = computeStats(sessions, index, 3, today);
    expect(result.streakDays).toBe(2);
    expect(result.days.map((day) => day.completed)).toEqual([0, 0, 0]);
    expect(result.totalSec).toBe(5);
  });
});
