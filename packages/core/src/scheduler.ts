import { ageOf } from '@sprout/schema';
import type {
  ChildProfile,
  LessonSummary,
  PlanOverrides,
  Route,
  SessionRecord,
  Stage,
  Theme,
  TodayPlan,
  TodayPlanItem,
} from '@sprout/schema';
import { birthdayMonthDay, localDateString, localDayNumber } from './dates';
import { resolveChildMode, resolveScreenPolicy, screenStatus } from './screen';

export function findStage(route: Route, ageMonths: number): Stage | null {
  const first = route.stages[0];
  const last = route.stages.at(-1);
  if (!first || !last) return null;
  if (ageMonths < first.ageRange[0]) return first;
  if (ageMonths > last.ageRange[1]) return last;
  return route.stages.find((stage) => ageMonths >= stage.ageRange[0] && ageMonths <= stage.ageRange[1]) ?? null;
}

export function currentTheme(
  route: Route,
  stage: Stage,
  child: { birthday: string; plan: PlanOverrides },
  date: Date,
): { theme: Theme; weekIndex: number } | null {
  if (child.plan.themeId !== null) {
    for (const candidate of route.stages) {
      const manual = candidate.themes.find((theme) => theme.id === child.plan.themeId);
      if (manual) return { theme: manual, weekIndex: 0 };
    }
  }

  const totalWeeks = stage.themes.reduce((total, theme) => total + theme.weeks, 0);
  if (totalWeeks <= 0) return null;
  const elapsedDays = localDayNumber(date) - birthdayMonthDay(child.birthday, stage.ageRange[0]);
  const elapsedWeeks = Math.max(0, Math.floor(elapsedDays / 7));
  let week = elapsedWeeks % totalWeeks;
  for (const theme of stage.themes) {
    if (week < theme.weeks) return { theme, weekIndex: week };
    week -= theme.weeks;
  }
  return null;
}

function previousTheme(route: Route, theme: Theme): Theme | null {
  for (let stageIndex = 0; stageIndex < route.stages.length; stageIndex += 1) {
    const stage = route.stages[stageIndex];
    const themeIndex = stage.themes.findIndex((candidate) => candidate.id === theme.id);
    if (themeIndex < 0) continue;
    if (themeIndex > 0) return stage.themes[themeIndex - 1];
    return route.stages[stageIndex - 1]?.themes.at(-1) ?? null;
  }
  return null;
}

export function planToday(args: {
  route: Route;
  lessons: Record<string, LessonSummary>;
  child: Pick<ChildProfile, 'id' | 'name' | 'birthday' | 'screen' | 'plan'>;
  history: Pick<SessionRecord, 'lessonId' | 'startedAt' | 'completed' | 'durationSec'>[];
  date: Date;
  usedSec: number;
}): TodayPlan {
  const { route, lessons, child, history, date, usedSec } = args;
  const age = ageOf(child.birthday, date);
  const stage = findStage(route, age.months);
  const policy = resolveScreenPolicy(stage, child.screen, age.months);
  const mode = resolveChildMode(stage, child, age.months);
  const current = stage ? currentTheme(route, stage, child, date) : null;
  const day = localDayNumber(date);
  const completedCounts = new Map<string, number>();
  const recentLessons = new Set<string>();
  for (const session of history) {
    const sessionDay = localDayNumber(new Date(session.startedAt));
    if (!Number.isFinite(sessionDay) || sessionDay > day) continue;
    if (session.completed) {
      completedCounts.set(session.lessonId, (completedCounts.get(session.lessonId) ?? 0) + 1);
    }
    if (sessionDay >= day - 6) recentLessons.add(session.lessonId);
  }

  const items: TodayPlanItem[] = [];
  const selected = new Set<string>();
  const skipped = new Set(child.plan.skipped);
  const add = (lessonId: string, reason: TodayPlanItem['reason']): boolean => {
    if (
      items.length >= policy.lessonsPerDay ||
      selected.has(lessonId) ||
      skipped.has(lessonId) ||
      !Object.hasOwn(lessons, lessonId) ||
      !lessons[lessonId] ||
      (mode === 'parent-only' && lessons[lessonId].audience !== 'parent')
    ) return false;
    selected.add(lessonId);
    items.push({ lessonId, reason, lesson: lessons[lessonId] });
    return true;
  };

  for (const lessonId of child.plan.pinned) add(lessonId, 'pinned');

  const themeLessons = current?.theme.lessons ?? [];
  const rotation = (index: number) => ((index + day) % themeLessons.length + themeLessons.length) % themeLessons.length;
  const ranked = themeLessons.map((lessonId, index) => ({ lessonId, rotation: rotation(index) }));
  ranked.sort((a, b) =>
    (completedCounts.get(a.lessonId) ?? 0) - (completedCounts.get(b.lessonId) ?? 0) ||
    a.rotation - b.rotation,
  );
  for (const { lessonId } of ranked) add(lessonId, 'theme');

  if (policy.lessonsPerDay >= 2 && items.length < policy.lessonsPerDay && current) {
    const previous = previousTheme(route, current.theme);
    for (const lessonId of previous?.lessons ?? []) {
      if (!recentLessons.has(lessonId) && add(lessonId, 'review')) break;
    }
  }

  if (items.length < policy.lessonsPerDay && child.plan.focusDomains.length > 0 && stage) {
    const focus = new Set(child.plan.focusDomains);
    for (const theme of stage.themes) {
      for (const lessonId of theme.lessons) {
        if (Object.hasOwn(lessons, lessonId) && focus.has(lessons[lessonId]?.domains[0])) {
          add(lessonId, 'balance');
        }
      }
    }
  }

  for (const lessonId of themeLessons) add(lessonId, 'theme');

  let totalMin = items.reduce((total, item) => total + (item.lesson.audience === 'parent' ? 0 : item.lesson.durationMin), 0);
  // 容忍浮点求和的舍入误差，避免恰好达标的小数分钟课程被误删。
  const tolerance = Number.EPSILON * Math.max(totalMin, policy.dailyMaxMin) * items.length;
  // 只从尾部删共看课；家长指引不占孩子预算，单课超额也不能例外保留。
  for (let index = items.length - 1; index >= 0 && totalMin - policy.dailyMaxMin > tolerance; index--) {
    if (items[index].lesson.audience === 'parent') continue;
    totalMin -= items[index].lesson.durationMin;
    items.splice(index, 1);
  }

  return {
    date: localDateString(date),
    child: { id: child.id, name: child.name, ageMonths: age.months, ageDays: age.days },
    route: { id: route.id, title: route.title },
    stage: stage ? { id: stage.id, title: stage.title, ageRange: stage.ageRange } : null,
    theme: current ? {
      id: current.theme.id,
      title: current.theme.title,
      weekIndex: current.weekIndex,
      weeks: current.theme.weeks,
    } : null,
    items,
    screen: { ...screenStatus({ policy, windows: child.screen.windows, usedSec, now: date }), mode },
  };
}
