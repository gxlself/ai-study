import {
  ChildInput,
  ageOf,
  type ChildProfile,
  type LanguageMode,
  type MilestoneItem,
  type MilestoneObservation,
  type ResolvedConcept,
  type Route,
  type SessionRecord,
  type TimeWindow,
  type ValidationIssue,
} from '@sprout/schema';
import dayjs, { type Dayjs } from 'dayjs';
import type { ChildFormValues } from './types';
import { effectiveScreenMode, sessionHardLimit } from '../../lib/screen-policy';

export const LANGUAGE_OPTIONS: { value: LanguageMode; label: string; description: string }[] = [
  { value: 'zh', label: '中文', description: '只使用中文显示和朗读。' },
  { value: 'zh-en', label: '中文优先，英语启蒙', description: '先中文、后英文，以中文交流为主。' },
  { value: 'en-zh', label: '英文优先，中文辅助', description: '先英文、后中文，保留中文解释。' },
  { value: 'en', label: '英文', description: '使用英文显示和朗读，缺少英文时保留已有内容。' },
];

export const CO_VIEW_LABELS = {
  required: '需要家长全程陪同',
  recommended: '建议家长陪同',
  optional: '家长可按需陪同',
} as const;

export const SCREEN_MODE_LABELS = {
  auto: '自动',
  'parent-only': '仅家长指引',
  'co-view': '开启亲子共看',
} as const;

export const SCREEN_MODE_EXPLANATION =
  '6–17 月龄以家长指引和屏幕外互动为主；18–23 月龄的亲子共看默认关闭，开启后每次不超过 8 分钟并须家长全程陪同。';

export const MILESTONE_DOMAINS: Record<MilestoneItem['domain'], string> = {
  'social-emotional': '社会与情绪',
  language: '语言与沟通',
  cognitive: '认知探索',
  motor: '动作与身体发展',
};

export function stageForAge(route: Route | undefined, months: number) {
  const first = route?.stages[0];
  const last = route?.stages.at(-1);
  if (first && months < first.ageRange[0]) return first;
  if (last && months > last.ageRange[1]) return last;
  return route?.stages.find((stage) => months >= stage.ageRange[0] && months <= stage.ageRange[1]);
}

export function milestoneAges(items: MilestoneItem[]): number[] {
  return [...new Set(items.map((item) => item.ageMonths))].sort((a, b) => a - b);
}

export function milestoneAgeFor(months: number, ages: number[]): number | undefined {
  const sorted = [...ages].sort((a, b) => a - b);
  return sorted.filter((age) => age <= months).at(-1) ?? sorted[0];
}

export function milestoneProgress(items: MilestoneItem[], observations: MilestoneObservation[], age: number) {
  const group = items.filter((item) => item.ageMonths === age);
  const byItem = new Map(observations.map((observation) => [observation.itemId, observation]));
  return {
    total: group.length,
    done: group.filter((item) => byItem.get(item.id)?.status === 'yes').length,
    pending: group.filter((item) => !byItem.has(item.id)).length,
  };
}

export function avatarUrl(avatar: string | undefined, concepts: ResolvedConcept[]): string | undefined {
  if (!avatar) return undefined;
  const concept = concepts.find((item) => item.id === avatar);
  if (concept) return concept.imageUrl;
  if (/^https?:\/\//i.test(avatar) || /^\/(?!\/)/.test(avatar)) return avatar;
  if (avatar.startsWith('assets/') && !avatar.split('/').includes('..')) {
    return `/packs/sprout.custom/${avatar}`;
  }
  return undefined;
}

function timeValue(value: string): Dayjs {
  const [hour, minute] = value.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0);
}

export function childFormValues(child?: ChildProfile): ChildFormValues {
  return {
    name: child?.name ?? '',
    nickname: child?.nickname ?? '',
    birthday: child ? dayjs(child.birthday) : null,
    avatar: child?.avatar,
    languageMode: child?.languageMode ?? 'zh-en',
    showPinyin: child?.showPinyin ?? false,
    screen: {
      sessionMaxMin: child?.screen.sessionMaxMin ?? null,
      dailyMaxMin: child?.screen.dailyMaxMin ?? null,
      mode: child?.screen.mode,
      windows: (child?.screen.windows ?? [{ start: '08:00', end: '18:30' }]).map((window) => ({
        start: timeValue(window.start),
        end: timeValue(window.end),
      })),
      distanceReminder: child?.screen.distanceReminder ?? true,
    },
    plan: {
      routeId: child?.plan.routeId ?? 'sprout.core.route',
      themeId: child?.plan.themeId ?? null,
      pinned: [...(child?.plan.pinned ?? [])],
      skipped: [...(child?.plan.skipped ?? [])],
      focusDomains: [...(child?.plan.focusDomains ?? [])],
    },
  };
}

export function timeWindowError(windows: TimeWindow[]): string | undefined {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const segments: { start: number; end: number }[] = [];
  for (const window of windows) {
    if (!clock.test(window.start) || !clock.test(window.end)) return '请完整填写开始和结束时间。';
    if (window.start === window.end) return '开始和结束时间不能相同。';
    const start = minute(window.start);
    const end = minute(window.end);
    if (start < end) segments.push({ start, end });
    else {
      segments.push({ start, end: 1440 });
      if (end > 0) segments.push({ start: 0, end });
    }
  }
  const sorted = segments.sort((a, b) => a.start - b.start);
  if (sorted.some((window, index) => index > 0 && window.start < sorted[index - 1].end)) {
    return '可用时段不能重叠。';
  }
  return undefined;
}

const FIELD_LABELS: Record<string, string> = {
  name: '名字（1 至 20 个字）',
  nickname: '昵称（最多 20 个字）',
  birthday: '生日',
  languageMode: '语言模式',
  showPinyin: '拼音设置',
  'screen.sessionMaxMin': '单次上限（1 至 30 分钟）',
  'screen.dailyMaxMin': '每日上限（1 至 60 分钟）',
  'screen.mode': '屏幕模式',
  'screen.windows': '可用时段',
  'screen.distanceReminder': '护眼提醒',
  'plan.routeId': '成长路线',
  'plan.themeId': '主题',
  'plan.pinned': '置顶课程',
  'plan.skipped': '跳过课程',
  'plan.focusDomains': '加强领域',
};

export function prepareChildInput(
  values: ChildFormValues,
  today: Dayjs = dayjs(),
): { input: ChildInput; issues: [] } | { input?: undefined; issues: ValidationIssue[] } {
  const birthday = values.birthday?.isValid() ? values.birthday.format('YYYY-MM-DD') : '';
  const windows = (values.screen.windows ?? []).map((window) => ({
    start: window.start?.isValid() ? window.start.format('HH:mm') : '',
    end: window.end?.isValid() ? window.end.format('HH:mm') : '',
  }));
  const parsed = ChildInput.safeParse({
    ...values,
    name: values.name.trim(),
    nickname: values.nickname?.trim() ?? '',
    avatar: values.avatar ?? '',
    birthday,
    screen: {
      ...values.screen,
      sessionMaxMin: values.screen.sessionMaxMin ?? null,
      dailyMaxMin: values.screen.dailyMaxMin ?? null,
      windows,
    },
    plan: {
      ...values.plan,
      themeId: values.plan.themeId || null,
      pinned: [...new Set(values.plan.pinned)],
      skipped: [...new Set(values.plan.skipped)],
    },
  });
  const issues: ValidationIssue[] = parsed.success ? [] : parsed.error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return { path, message: `请检查${FIELD_LABELS[path] ?? '该项内容'}。`, level: 'error' };
  });
  if (values.birthday?.isAfter(today, 'day')) {
    issues.push({ path: 'birthday', message: '生日不能晚于今天。', level: 'error' });
  }
  const windowError = timeWindowError(windows);
  if (windowError) issues.push({ path: 'screen.windows', message: windowError, level: 'error' });
  const ageMonths = values.birthday?.isValid() && !values.birthday.isAfter(today, 'day')
    ? ageOf(birthday, today.toDate()).months : undefined;
  if (values.screen.mode === 'co-view' && ageMonths !== undefined && ageMonths < 18) {
    issues.push({ path: 'screen.mode', message: '孩子未满 18 个月时不能开启亲子共看，请选择自动或仅家长指引。', level: 'error' });
  }
  if (ageMonths !== undefined && values.screen.sessionMaxMin != null) {
    const mode = effectiveScreenMode(ageMonths, values.screen.mode);
    const limit = sessionHardLimit(ageMonths, mode);
    if (values.screen.sessionMaxMin > limit) {
      issues.push({ path: 'screen.sessionMaxMin', message: `此月龄的亲子共看每次不能超过 ${limit} 分钟。`, level: 'error' });
    }
  }
  if (values.plan.pinned.some((id) => values.plan.skipped.includes(id))) {
    issues.push({ path: 'plan.skipped', message: '同一课程不能同时置顶和跳过。', level: 'error' });
  }
  if (!values.plan.routeId.trim()) {
    issues.push({ path: 'plan.routeId', message: '请选择成长路线。', level: 'error' });
  }
  if (issues.length || !parsed.success) return { issues };
  return { input: parsed.data, issues: [] };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试。';
}

export function errorIssues(error: unknown): ValidationIssue[] {
  if (!error || typeof error !== 'object' || !('issues' in error) || !Array.isArray(error.issues)) return [];
  return error.issues.flatMap((issue: unknown) => {
    if (!issue || typeof issue !== 'object' || !('message' in issue) || typeof issue.message !== 'string') return [];
    const path = 'path' in issue ? issue.path : '';
    return [{
      path: Array.isArray(path) ? path.map(String).join('.') : typeof path === 'string' ? path : '',
      message: issue.message,
      level: 'error' as const,
    }];
  });
}

export function sessionsPath(childId: string, range: [Dayjs, Dayjs] | null, limit: number): string {
  const query = new URLSearchParams({ childId, limit: String(limit) });
  if (range) {
    query.set('from', range[0].startOf('day').toISOString());
    query.set('to', range[1].add(1, 'day').startOf('day').toISOString());
  }
  return `/api/sessions?${query.toString()}`;
}

export function completionPercent(session: Pick<SessionRecord, 'stepsCompleted' | 'stepsTotal'>): number | null {
  if (session.stepsTotal <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(session.stepsCompleted / session.stepsTotal * 100)));
}
