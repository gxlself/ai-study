import {
  BUILTIN_ACTIVITY_META, allJsonSchemas, validateLesson, PARENT_ACTIVITY_TYPES,
  type ActivityStep, type ConceptCategory, type Lesson, type PlanOverrides,
  type PluginInfo, type ResolvedConcept, type ValidationIssue,
} from '@sprout/schema';
import { asSchema, defaultForSchema, isRecord, normalizeOptionalValues, parsePropsJson, type JsonSchema } from './schema';

export const CUSTOM_PACK = 'sprout.custom';
export const CONTRACT_SCHEMAS = allJsonSchemas();
export type LessonDocument = { lesson: Lesson; packId: string; baseUrl: string; issues: ValidationIssue[] };

export const CATEGORY_LABELS: Record<ConceptCategory, string> = {
  animals: '动物', fruits: '水果', vegetables: '蔬菜', food: '食物', vehicles: '交通工具',
  body: '身体部位', family: '家人', home: '家居用品', clothes: '衣物', nature: '自然',
  colors: '颜色', shapes: '形状', numbers: '数字', emotions: '情绪', actions: '动作',
  toys: '玩具', music: '乐器与声音', places: '场所', other: '其他',
};

export interface ActivityChoice {
  type: string;
  name: string;
  ageRange?: [number, number];
  enabled: boolean;
  schema?: JsonSchema;
  defaultProps?: Record<string, unknown>;
  pluginName: string;
}

export function activityChoices(plugins: PluginInfo[], schemas: Record<string, JsonSchema>): ActivityChoice[] {
  return plugins.flatMap((plugin) => plugin.activities.map((activity) => {
    const builtin = BUILTIN_ACTIVITY_META[activity.type as keyof typeof BUILTIN_ACTIVITY_META];
    return {
      type: activity.type,
      name: activity.name.zh,
      ageRange: activity.ageRange ?? builtin?.ageRange,
      enabled: plugin.enabled && !plugin.errors?.length,
      schema: plugin.source === 'builtin' ? schemas[`activity.${activity.type}`] : activity.propsSchema,
      defaultProps: activity.defaultProps,
      pluginName: plugin.name.zh,
    };
  }));
}

export interface StepDraft {
  key: string;
  step: ActivityStep;
  mode: 'form' | 'json';
  json: string;
}

export function stepDraft(step: ActivityStep): StepDraft {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `step-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    step,
    mode: 'form',
    json: JSON.stringify(step.props, null, 2),
  };
}

export function newStep(activity: ActivityChoice): StepDraft {
  const defaults = defaultForSchema(activity.schema ?? { type: 'object' });
  const step = stepDraft({
    type: activity.type,
    props: { ...asSchema(defaults), ...structuredClone(activity.defaultProps ?? {}) },
  });
  if (!activity.schema) step.mode = 'json';
  return step;
}

export function newLesson(): Lesson {
  return {
    schemaVersion: 1,
    id: `custom.lesson-${Date.now().toString(36)}`,
    title: { zh: '' },
    ageRange: [6, 17],
    domains: ['language'],
    durationMin: 3,
    coView: 'required',
    audience: 'parent',
    objectives: [{ zh: '' }],
    parentGuide: { intro: '' },
    offline: [{ title: '', steps: [''] }],
    steps: [],
  };
}

export function validateDraft(
  metadata: Record<string, unknown>,
  steps: StepDraft[],
  concepts?: ResolvedConcept[],
  activities: ActivityChoice[] = [],
): ReturnType<typeof validateLesson> {
  const issues = steps.flatMap((step, index) =>
    step.mode === 'json' ? parsePropsJson(step.json, `steps.${index}.props`).issues : [],
  );
  const normalizedSteps = steps.map((item) => {
    const schema = activities.find((activity) => activity.type === item.step.type)?.schema ?? CONTRACT_SCHEMAS[`activity.${item.step.type}`];
    return { ...item.step, props: schema ? normalizeOptionalValues(item.step.props, schema) : item.step.props };
  });
  const normalized = normalizeOptionalValues({ ...metadata, steps: normalizedSteps }, CONTRACT_SCHEMAS.lesson);
  const result = validateLesson(normalized, {
    knownConcepts: concepts ? new Set(concepts.map((concept) => concept.id)) : undefined,
    // 第三方完整 JSON Schema 由保存接口校验，本地只确认插件已启用。
    validateExternal: (type) => activities.some((activity) => activity.type === type && activity.enabled) ? [] : null,
  });
  const unavailable = steps.flatMap((item, index): ValidationIssue[] => {
    const activity = activities.find((candidate) => candidate.type === item.step.type);
    return activity && !activity.enabled
      ? [{ path: `steps.${index}.type`, message: '此活动插件未启用或存在加载错误', level: 'error' }]
      : [];
  });
  const safety: ValidationIssue[] = [];
  if (result.lesson && (result.lesson.audience ?? 'child') === 'child') {
    if (result.lesson.coView !== 'required') safety.push({ path: 'coView', message: '亲子共看课必须由家长全程陪同', level: 'error' });
    if (result.lesson.ageRange[0] < 24 && result.lesson.durationMin > 8) {
      safety.push({ path: 'durationMin', message: '包含 18–23 月龄的亲子共看课每次不得超过 8 分钟', level: 'error' });
    }
  }
  return { lesson: result.lesson, issues: [...issues, ...result.issues, ...unavailable, ...safety] };
}

export function choicesForAudience(activities: ActivityChoice[], audience: Lesson['audience']): ActivityChoice[] {
  return audience === 'parent' ? activities.filter((activity) => PARENT_ACTIVITY_TYPES.includes(activity.type)) : activities;
}

export function preferredConcepts(concepts: ResolvedConcept[], packId = CUSTOM_PACK): ResolvedConcept[] {
  const priority = (concept: ResolvedConcept) => concept.packId === packId ? 0 : concept.packId === 'sprout.core' ? 1 : 2;
  const map = new Map<string, ResolvedConcept>();
  [...concepts].sort((a, b) => priority(a) - priority(b)).forEach((concept) => {
    if (!map.has(concept.id)) map.set(concept.id, concept);
  });
  return [...map.values()];
}

export function assetUrl(path: string | undefined, packId = CUSTOM_PACK, concepts: ResolvedConcept[] = []): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('concept:')) {
    return preferredConcepts(concepts, packId).find((concept) => concept.id === path.slice(8))?.imageUrl;
  }
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/') && !path.startsWith('//')) return path;
  if (/^[a-z]+:/i.test(path) || path.startsWith('//') || path.includes('\\') || path.split('/').includes('..')) return undefined;
  return `/packs/${encodeURIComponent(packId)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function toggleLessonPlan(plan: PlanOverrides, lessonId: string, action: 'pinned' | 'skipped'): Pick<PlanOverrides, 'pinned' | 'skipped'> {
  const opposite = action === 'pinned' ? 'skipped' : 'pinned';
  const removing = plan[action].includes(lessonId);
  return {
    [action]: removing ? plan[action].filter((id) => id !== lessonId) : [...new Set([...plan[action], lessonId])],
    [opposite]: removing ? [...plan[opposite]] : plan[opposite].filter((id) => id !== lessonId),
  } as Pick<PlanOverrides, 'pinned' | 'skipped'>;
}

export function responseLessonId(response: unknown): string | undefined {
  if (!isRecord(response)) return undefined;
  if (typeof response.id === 'string') return response.id;
  if (isRecord(response.lesson) && typeof response.lesson.id === 'string') return response.lesson.id;
  return undefined;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试';
}
