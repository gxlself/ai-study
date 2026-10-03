import type { LessonSummary, SessionRecord } from '@sprout/schema';
import { dateStringFromDay, localDayNumber } from './dates';
import { resolveSessionAudience } from './audience';

export interface Stats {
  days: { date: string; screenSec: number; lessons: number; completed: number }[];
  domains: Record<string, number>;
  totalSec: number;
  streakDays: number;
}

export function computeStats(
  sessions: Pick<SessionRecord, 'lessonId' | 'startedAt' | 'completed' | 'durationSec' | 'audience'>[],
  lessons: Record<string, LessonSummary>,
  days: number,
  today: Date,
): Stats {
  const count = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  const lastDay = localDayNumber(today);
  const firstDay = lastDay - count + 1;
  const result: Stats = {
    days: Array.from({ length: count }, (_, index) => ({
      date: dateStringFromDay(firstDay + index),
      screenSec: 0,
      lessons: 0,
      completed: 0,
    })),
    domains: {},
    totalSec: 0,
    streakDays: 0,
  };

  for (const session of sessions) {
    const day = localDayNumber(new Date(session.startedAt));
    if (!Number.isFinite(day) || day < firstDay || day > lastDay) continue;
    const bucket = result.days[day - firstDay];
    bucket.lessons += 1;
    if (session.completed) bucket.completed += 1;
    if (resolveSessionAudience(session, lessons) === 'parent') continue;
    bucket.screenSec += session.durationSec;
    result.totalSec += session.durationSec;

    const domain = Object.prototype.hasOwnProperty.call(lessons, session.lessonId) ? lessons[session.lessonId]?.domains[0] : undefined;
    if (domain) result.domains[domain] = (result.domains[domain] ?? 0) + session.durationSec;
  }

  let index = result.days.length - 1;
  if (index >= 0 && result.days[index].lessons === 0) index -= 1;
  while (index >= 0 && result.days[index].lessons > 0) {
    result.streakDays += 1;
    index -= 1;
  }
  return result;
}
