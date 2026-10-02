import { describe, expect, it } from 'vitest';
import { effectiveScreen, grantTenMinutes, VisibleClock } from './policy';
import type { ScreenStatus } from '@sprout/schema';

const screen: ScreenStatus = { usedSec: 600, dailyMaxSec: 600, sessionMaxSec: 180, allowedNow: false, reason: 'daily-limit', coView: 'required' };

describe('screen safeguards', () => {
  it('allows a single logged extension per local day and child', () => {
    localStorage.clear();
    const now = new Date(2026, 9, 2, 10);
    expect(grantTenMinutes('a', screen, now)).toBe(true);
    expect(grantTenMinutes('a', screen, now)).toBe(false);
    expect(effectiveScreen(screen, 'a', now)).toMatchObject({ allowedNow: true, dailyMaxSec: 1200 });
    expect(effectiveScreen({ ...screen, usedSec: 1200 }, 'a', now).allowedNow).toBe(false);
    expect(effectiveScreen(screen, 'b', now).allowedNow).toBe(false);
    expect(effectiveScreen(screen, 'a', new Date(2026, 9, 3)).allowedNow).toBe(false);
  });
  it('does not turn an out-of-window grant into an unlimited window', () => {
    localStorage.clear();
    const now = new Date(2026, 9, 2, 21);
    const outside = { ...screen, usedSec: 0, dailyMaxSec: 1800, reason: 'outside-window' as const };
    grantTenMinutes('a', outside, now);
    expect(effectiveScreen(outside, 'a', now).allowedNow).toBe(true);
    expect(effectiveScreen({ ...outside, usedSec: 600 }, 'a', now).allowedNow).toBe(false);
    expect(effectiveScreen({ ...outside, usedSec: 1800, reason: 'daily-limit' }, 'a', now).allowedNow).toBe(false);
  });
  it('never enables child viewing in parent-only mode or exceeds the daily hard cap', () => {
    localStorage.clear();
    const now = new Date(2026, 9, 2, 10);
    expect(grantTenMinutes('parent', { ...screen, mode: 'parent-only' }, now)).toBe(false);
    expect(grantTenMinutes('limited', { ...screen, usedSec: 3300, dailyMaxSec: 3300 }, now)).toBe(true);
    expect(effectiveScreen({ ...screen, usedSec: 3300, dailyMaxSec: 3300 }, 'limited', now).dailyMaxSec).toBe(3600);
    expect(grantTenMinutes('full', { ...screen, usedSec: 3600, dailyMaxSec: 3600 }, now)).toBe(false);
  });
  it('accumulates only visible unpaused time', () => {
    let now = 0;
    const clock = new VisibleClock(() => now);
    clock.setRunning(true);
    now = 2100;
    clock.setRunning(false);
    now = 12000;
    expect(clock.seconds()).toBe(2);
    clock.setRunning(true);
    now = 13100;
    expect(clock.seconds()).toBe(3);
  });
});
