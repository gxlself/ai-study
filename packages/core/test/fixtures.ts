import { ChildInput, Lesson, PlanOverrides } from '@sprout/schema';
import type { ChildProfile, LessonSummary, Route, SessionRecord, Stage, Theme } from '@sprout/schema';

export function localDate(value: string, hour = 12, minute = 0, second = 0): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  date.setFullYear(year);
  return date;
}

export function makeTheme(id: string, lessons: string[] = [`${id}.lesson`], weeks = 1): Theme {
  return { id, title: { zh: id }, weeks, domains: ['language'], lessons };
}

export function makeStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 'test.stage',
    title: { zh: 'Test stage' },
    ageRange: [6, 36],
    focus: [{ zh: 'Test focus' }],
    screen: { sessionMaxMin: 10, dailyMaxMin: 20, lessonsPerDay: 2, coView: 'required' },
    themes: [makeTheme('test.theme', ['a', 'b', 'c'])],
    ...overrides,
  };
}

export function makeRoute(stages: Stage[] = [makeStage()]): Route {
  return { schemaVersion: 1, id: 'test.route', title: { zh: 'Test route' }, stages };
}

export function makePlan(overrides: Partial<PlanOverrides> = {}): PlanOverrides {
  return PlanOverrides.parse({ routeId: 'test.route', ...overrides });
}

export function makeChild(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    ...ChildInput.parse({ name: 'Sprout', birthday: '2022-01-01', screen: { windows: [] } }),
    id: 'test.child',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return Lesson.parse({
    schemaVersion: 1,
    id: 'test.lesson',
    title: { zh: 'Test lesson', en: 'Test lesson' },
    ageRange: [18, 36],
    domains: ['language'],
    durationMin: 4,
    coView: 'required',
    objectives: [{ zh: 'Test objective' }],
    parentGuide: { intro: 'Test guide' },
    offline: [{ title: 'Offline activity', steps: ['Play together'] }],
    steps: [{ type: 'calm', props: {} }],
    ...overrides,
  });
}

export function makeSummary(id: string, overrides: Partial<LessonSummary> = {}): LessonSummary {
  return {
    id,
    packId: 'test.pack',
    title: { zh: id },
    ageRange: [18, 36],
    domains: ['language'],
    durationMin: 4,
    coView: 'required',
    stepTypes: ['calm'],
    ...overrides,
  };
}

export function makeIndex(...lessons: (string | LessonSummary)[]): Record<string, LessonSummary> {
  return Object.fromEntries(lessons.map((lesson) => {
    const summary = typeof lesson === 'string' ? makeSummary(lesson) : lesson;
    return [summary.id, summary];
  }));
}

type HistoryEntry = Pick<SessionRecord, 'lessonId' | 'startedAt' | 'completed' | 'durationSec'>;

export function makeSession(
  lessonId: string,
  date = '2024-07-01',
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  return { lessonId, startedAt: localDate(date).toISOString(), completed: true, durationSec: 60, ...overrides };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
