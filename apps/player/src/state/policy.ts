import type { ScreenStatus, SessionInput } from '@sprout/schema';
import { localDateString } from '@sprout/core';

export interface TimeGrant { date: string; childId: string; usedAtGrant: number; grantedAt: string; outsideWindow?: boolean }
const KEY = 'sprout.timeGrants';

export function readGrants(storage: Pick<Storage, 'getItem'> = localStorage): TimeGrant[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is TimeGrant =>
      typeof v?.date === 'string' && typeof v?.childId === 'string'
      && typeof v?.usedAtGrant === 'number' && Number.isFinite(v.usedAtGrant)
      && typeof v?.grantedAt === 'string') : [];
  } catch { return []; }
}

export function todayGrant(childId: string, now = new Date(), storage: Pick<Storage, 'getItem'> = localStorage) {
  return readGrants(storage).find((g) => g.childId === childId && g.date === localDateString(now));
}

export function grantTenMinutes(childId: string, screen: ScreenStatus, now = new Date(), storage: Storage = localStorage): boolean {
  if (screen.mode === 'parent-only' || screen.usedSec >= 3600 || todayGrant(childId, now, storage)) return false;
  const grant: TimeGrant = { date: localDateString(now), childId, usedAtGrant: screen.usedSec, grantedAt: now.toISOString(), outsideWindow: screen.reason === 'outside-window' };
  storage.setItem(KEY, JSON.stringify([...readGrants(storage).slice(-100), grant]));
  return true;
}

export function effectiveScreen(screen: ScreenStatus, childId: string, now = new Date(), storage: Pick<Storage, 'getItem'> = localStorage): ScreenStatus {
  const grant = todayGrant(childId, now, storage);
  if (!grant) return screen;
  const extraLimit = Math.min(3600, Math.max(screen.dailyMaxSec, grant.usedAtGrant) + 600);
  const outsideWindowAllowed = screen.usedSec < grant.usedAtGrant + 600;
  const allowedNow = screen.usedSec < extraLimit && (!(screen.reason === 'outside-window' || grant.outsideWindow) || outsideWindowAllowed);
  return {
    ...screen,
    dailyMaxSec: extraLimit,
    allowedNow,
    reason: allowedNow ? undefined : screen.usedSec >= extraLimit || (grant.outsideWindow && !outsideWindowAllowed) ? 'daily-limit' : 'outside-window',
  };
}

export function grantEvents(childId: string): NonNullable<SessionInput['events']> {
  const grant = todayGrant(childId);
  return grant ? [{ t: 0, type: 'parent.time-extension', data: { minutes: 10, grantedAt: grant.grantedAt, scope: 'this-device' } }] : [];
}

export class VisibleClock {
  private accumulated = 0;
  private since: number | null = null;
  constructor(private readonly now: () => number = () => performance.now()) {}
  setRunning(running: boolean): void {
    if (running && this.since === null) this.since = this.now();
    if (!running && this.since !== null) {
      this.accumulated += Math.max(0, this.now() - this.since);
      this.since = null;
    }
  }
  seconds(): number {
    return Math.floor((this.accumulated + (this.since === null ? 0 : Math.max(0, this.now() - this.since))) / 1000);
  }
}
