import { describe, expect, it } from 'vitest';
import { ChildScreenSettings } from '@sprout/schema';
import type { ScreenPolicy, TimeWindow } from '@sprout/schema';
import { resolveScreenPolicy, screenStatus } from '../src';
import { deepFreeze, localDate, makeStage } from './fixtures';

describe('resolveScreenPolicy', () => {
  it('uses the no-stage defaults for null overrides', () => {
    expect(resolveScreenPolicy(null, ChildScreenSettings.parse({}))).toEqual({
      sessionMaxMin: 10, dailyMaxMin: 20, lessonsPerDay: 2, coView: 'recommended',
    });
  });

  it('inherits all stage settings without changing its input', () => {
    const stage = deepFreeze(makeStage());
    expect(resolveScreenPolicy(stage, deepFreeze(ChildScreenSettings.parse({})))).toEqual(stage.screen);
  });

  it.each([
    [{ sessionMaxMin: 3 }, { sessionMaxMin: 3, dailyMaxMin: 20 }],
    [{ dailyMaxMin: 7 }, { sessionMaxMin: 10, dailyMaxMin: 7 }],
    [{ sessionMaxMin: 12, dailyMaxMin: 25 }, { sessionMaxMin: 12, dailyMaxMin: 25 }],
  ])('applies each non-null child override: %j', (overrides, expected) => {
    expect(resolveScreenPolicy(makeStage(), ChildScreenSettings.parse(overrides))).toEqual({
      ...expected, lessonsPerDay: 2, coView: 'required',
    });
  });

  it('also applies child overrides when no stage exists', () => {
    expect(resolveScreenPolicy(null, ChildScreenSettings.parse({ sessionMaxMin: 4, dailyMaxMin: 8 }))).toEqual({
      sessionMaxMin: 4, dailyMaxMin: 8, lessonsPerDay: 2, coView: 'recommended',
    });
  });

  it('enforces the hard limits even for unvalidated stage and child values', () => {
    const stage = makeStage({
      screen: { sessionMaxMin: 90, dailyMaxMin: 120, lessonsPerDay: 4, coView: 'optional' },
    });
    const screen = ChildScreenSettings.parse({});
    expect(resolveScreenPolicy(stage, screen)).toEqual({
      sessionMaxMin: 20, dailyMaxMin: 60, lessonsPerDay: 4, coView: 'optional',
    });
    expect(resolveScreenPolicy(null, { ...screen, sessionMaxMin: 100, dailyMaxMin: 1000 })).toEqual({
      sessionMaxMin: 20, dailyMaxMin: 60, lessonsPerDay: 2, coView: 'recommended',
    });
  });
});

describe('screenStatus', () => {
  const policy: ScreenPolicy = { sessionMaxMin: 5, dailyMaxMin: 12, lessonsPerDay: 2, coView: 'required' };
  const at = (hour: number, minute = 0, second = 0) => localDate('2024-07-01', hour, minute, second);
  const status = (windows: TimeWindow[], now: Date, usedSec = 0) =>
    screenStatus({ policy, windows, now, usedSec });

  it('allows the whole day when there are no windows and exposes exact policy seconds', () => {
    expect(status([], at(0), 45)).toEqual({
      usedSec: 45, sessionMaxSec: 300, dailyMaxSec: 720, allowedNow: true, coView: 'required',
    });
    expect(status([], at(23, 59, 59)).allowedNow).toBe(true);
  });

  it.each([720, 721, 7200])('blocks daily usage at or above the limit: %s', (usedSec) => {
    expect(status([{ start: '08:00', end: '09:00' }], at(10), usedSec)).toEqual({
      usedSec, sessionMaxSec: 300, dailyMaxSec: 720, coView: 'required',
      allowedNow: false, reason: 'daily-limit',
    });
  });

  it('does not treat cumulative session usage as a session-limit blocker', () => {
    expect(status([], at(12), 719).allowedNow).toBe(true);
  });

  it.each([
    [7, 59, 59, false],
    [8, 0, 0, true],
    [8, 59, 59, true],
    [9, 0, 0, false],
  ])('uses inclusive starts and exclusive ends at %s:%s:%s', (hour, minute, second, allowedNow) => {
    const result = status([{ start: '08:00', end: '09:00' }], at(hour, minute, second));
    expect(result.allowedNow).toBe(allowedNow);
    if (!allowedNow) expect(result).toMatchObject({ reason: 'outside-window', nextWindow: '08:00' });
    else expect(result).not.toHaveProperty('reason');
  });

  it.each([
    [21, 59, false],
    [22, 0, true],
    [23, 59, true],
    [0, 0, true],
    [1, 59, true],
    [2, 0, false],
    [12, 0, false],
  ])('supports overnight windows at %s:%s', (hour, minute, allowedNow) => {
    const result = status([{ start: '22:00', end: '02:00' }], at(hour, minute));
    expect(result.allowedNow).toBe(allowedNow);
    if (!allowedNow) expect(result.nextWindow).toBe('22:00');
  });

  it('handles a window that ends at midnight', () => {
    const windows = [{ start: '23:00', end: '00:00' }];
    expect(status(windows, at(23, 59)).allowedNow).toBe(true);
    expect(status(windows, at(0)).allowedNow).toBe(false);
  });

  it('finds the closest opening independently of declaration order, including tomorrow', () => {
    const windows = deepFreeze([
      { start: '22:00', end: '23:00' },
      { start: '14:00', end: '15:00' },
      { start: '08:00', end: '09:00' },
    ]);
    expect(status(windows, at(12)).nextWindow).toBe('14:00');
    expect(status(windows, at(23, 59)).nextWindow).toBe('08:00');
    expect(status(windows, at(9)).nextWindow).toBe('14:00');
  });

  it('allows any matching, overlapping or adjoining window', () => {
    const windows = [
      { start: '08:00', end: '10:00' },
      { start: '09:00', end: '11:00' },
      { start: '11:00', end: '12:00' },
    ];
    expect(status(windows, at(9, 30)).allowedNow).toBe(true);
    expect(status(windows, at(11)).allowedNow).toBe(true);
    expect(status(windows, at(12)).allowedNow).toBe(false);
  });

  it('fails closed for zero-length or invalid clock windows', () => {
    const windows = [
      { start: '08:00', end: '08:00' },
      { start: '25:00', end: '26:00' },
      { start: '08:60', end: '10:00' },
      { start: '8:00', end: '09:00' },
    ];
    expect(status(windows, at(8))).toMatchObject({ allowedNow: false, reason: 'outside-window' });
    expect(status(windows, at(8))).not.toHaveProperty('nextWindow');
    expect(status([...windows, { start: '12:00', end: '13:00' }], at(10)).nextWindow).toBe('12:00');
  });
});
