import type { Audience, LessonSummary, SessionRecord } from '@sprout/schema';

type AudienceSession = Pick<SessionRecord, 'lessonId' | 'audience'>;

export function resolveSessionAudience(
  session: AudienceSession,
  lessons: Record<string, LessonSummary>,
): Audience {
  if (session.audience !== undefined) return session.audience;
  return Object.hasOwn(lessons, session.lessonId) ? lessons[session.lessonId]?.audience ?? 'child' : 'child';
}

export function childScreenSeconds(
  sessions: (AudienceSession & Pick<SessionRecord, 'durationSec'>)[],
  lessons: Record<string, LessonSummary>,
): number {
  return sessions.reduce((seconds, session) => seconds +
    (resolveSessionAudience(session, lessons) === 'parent' ? 0 : session.durationSec), 0);
}
