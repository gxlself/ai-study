import type { ChildProfile, ChildScreenSettings, ScreenPolicy, ScreenStatus, Stage, TimeWindow } from '@sprout/schema';

export function resolveChildMode(
  stage: Stage | null,
  child: Pick<ChildProfile, 'screen'>,
  ageMonths: number,
): 'parent-only' | 'co-view' {
  if (!Number.isFinite(ageMonths) || ageMonths < 18) return 'parent-only';
  if (child.screen.mode === 'parent-only' || child.screen.mode === 'co-view') return child.screen.mode;
  return stage?.screen.childScreen === 'none' || stage?.screen.childScreen === 'optional' ? 'parent-only' : 'co-view';
}

export function resolveScreenPolicy(stage: Stage | null, screen: ChildScreenSettings, ageMonths?: number): ScreenPolicy {
  const age = ageMonths ?? stage?.ageRange[0];
  const sessionCap = age !== undefined && age >= 18 && age < 24 ? 8 : 20;
  return {
    sessionMaxMin: Math.min(screen.sessionMaxMin ?? stage?.screen.sessionMaxMin ?? 10, sessionCap),
    dailyMaxMin: Math.min(screen.dailyMaxMin ?? stage?.screen.dailyMaxMin ?? 20, 60),
    lessonsPerDay: stage?.screen.lessonsPerDay ?? 2,
    coView: age !== undefined && age >= 18 ? 'required' : stage?.screen.coView ?? 'recommended',
    ...(stage?.screen.childScreen === undefined ? {} : { childScreen: stage.screen.childScreen }),
    ...(stage?.screen.childLessonsPerDay === undefined ? {} : { childLessonsPerDay: stage.screen.childLessonsPerDay }),
  };
}

function timeMinutes(time: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function screenStatus(args: {
  policy: ReturnType<typeof resolveScreenPolicy>;
  windows: TimeWindow[];
  usedSec: number;
  now: Date;
}): ScreenStatus {
  const { policy, windows, usedSec, now } = args;
  const status: ScreenStatus = {
    usedSec,
    dailyMaxSec: policy.dailyMaxMin * 60,
    sessionMaxSec: policy.sessionMaxMin * 60,
    allowedNow: true,
    coView: policy.coView,
  };

  if (usedSec >= status.dailyMaxSec) {
    return { ...status, allowedNow: false, reason: 'daily-limit' };
  }
  if (windows.length === 0) return status;

  const minute = now.getHours() * 60 + now.getMinutes();
  const validWindows = windows.flatMap((window) => {
    const start = timeMinutes(window.start);
    const end = timeMinutes(window.end);
    return start !== null && end !== null && start !== end ? [{ ...window, startMinute: start, endMinute: end }] : [];
  });
  const inside = validWindows.some(({ startMinute: start, endMinute: end }) =>
    start < end ? minute >= start && minute < end : minute >= start || minute < end,
  );
  if (inside) return status;

  const next = [...validWindows].sort(
    (a, b) => (a.startMinute - minute + 1440) % 1440 - (b.startMinute - minute + 1440) % 1440,
  )[0];
  return {
    ...status,
    allowedNow: false,
    reason: 'outside-window',
    ...(next ? { nextWindow: next.start } : {}),
  };
}
