import { z } from 'zod';
import { BUILTIN_ACTIVITY_PROPS, type BuiltinActivityType } from './activities';
import { Lesson } from './lesson';
import type { Concept } from './lexicon';

export interface ValidationIssue {
  path: string;
  message: string;
  level: 'error' | 'warning';
}

function zodIssues(err: z.ZodError, prefix = ''): ValidationIssue[] {
  return err.issues.map((i) => ({
    path: [prefix, ...i.path.map(String)].filter(Boolean).join('.'),
    message: i.message,
    level: 'error' as const,
  }));
}

/** 收集 props 中所有对词库的字符串引用（ConceptRef 为字符串时） */
function collectConceptIds(type: string, props: any): string[] {
  const ids: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string') ids.push(v);
  };
  const sprites = (scene: any) => scene?.sprites?.forEach((s: any) => add(s.concept));
  switch (type) {
    case 'word-cards':
    case 'peekaboo':
    case 'bubbles':
      props.items?.forEach(add);
      break;
    case 'count':
      props.rounds?.forEach((r: any) => add(r.item));
      break;
    case 'subitize':
      props.rounds?.forEach((r: any) => add(r.item));
      break;
    case 'choose':
      props.rounds?.forEach((r: any) =>
        r.options?.forEach((o: any) => (typeof o === 'string' ? add(o) : add(o.concept))),
      );
      break;
    case 'sort':
      props.items?.forEach((i: any) => add(i.item));
      props.bins?.forEach((b: any) => add(b.concept));
      break;
    case 'sequence':
      props.steps?.forEach((s: any) => add(s.concept));
      break;
    case 'pattern':
      props.rounds?.forEach((r: any) => {
        r.sequence?.forEach(add);
        r.options?.forEach(add);
      });
      break;
    case 'story':
      sprites(props.cover);
      props.pages?.forEach((p: any) => sprites(p.scene));
      break;
    case 'song':
      sprites(props.scene);
      break;
    case 'movement':
      props.moves?.forEach((m: any) => add(m.concept));
      break;
  }
  return ids;
}

/**
 * 校验一节课：结构 + 内置活动 props + 词库引用 + 若干语义规则。
 * @param knownConcepts 可用词条 id 集合（同包词库 + 已启用的其他包），传 undefined 则跳过引用检查
 * @param pluginSchemas 第三方活动 type → zod/JSON 校验函数（可选）
 */
export function validateLesson(
  input: unknown,
  opts: {
    knownConcepts?: Set<string>;
    validateExternal?: (type: string, props: unknown) => ValidationIssue[] | null;
  } = {},
): { lesson?: Lesson; issues: ValidationIssue[] } {
  const parsed = Lesson.safeParse(input);
  if (!parsed.success) return { issues: zodIssues(parsed.error) };
  const lesson = parsed.data;
  const issues: ValidationIssue[] = [];

  if (lesson.ageRange[1] - lesson.ageRange[0] > 18) {
    issues.push({ path: 'ageRange', message: '月龄跨度过大（>18 个月），请拆分', level: 'warning' });
  }

  lesson.steps.forEach((step, idx) => {
    const p = `steps.${idx}`;
    const schema = BUILTIN_ACTIVITY_PROPS[step.type as BuiltinActivityType];
    if (schema) {
      const r = schema.safeParse(step.props);
      if (!r.success) {
        issues.push(...zodIssues(r.error, `${p}.props`));
        return;
      }
      // 用带默认值的结果回填，保证播放端拿到完整 props
      (step as any).props = r.data;
      // 语义规则
      if (step.type === 'choose') {
        (r.data as any).rounds.forEach((round: any, ri: number) => {
          const ids = round.options.map((o: any) => (typeof o === 'string' ? o : o.id));
          if (!ids.includes(round.answer)) {
            issues.push({ path: `${p}.props.rounds.${ri}.answer`, message: `answer "${round.answer}" 不在 options 中`, level: 'error' });
          }
        });
      }
      if (step.type === 'pattern') {
        (r.data as any).rounds.forEach((round: any, ri: number) => {
          if (!round.options.includes(round.answer)) {
            issues.push({ path: `${p}.props.rounds.${ri}.answer`, message: 'answer 不在 options 中', level: 'error' });
          }
        });
      }
      if (step.type === 'sort') {
        const bins = new Set((r.data as any).bins.map((b: any) => b.id));
        (r.data as any).items.forEach((it: any, ii: number) => {
          if (!bins.has(it.bin)) issues.push({ path: `${p}.props.items.${ii}.bin`, message: `bin "${it.bin}" 不存在`, level: 'error' });
        });
      }
      if (opts.knownConcepts) {
        for (const id of collectConceptIds(step.type, r.data)) {
          if (!opts.knownConcepts.has(id)) {
            issues.push({ path: `${p}.props`, message: `词库中不存在概念 "${id}"`, level: 'error' });
          }
        }
      }
    } else if (step.type.includes('.')) {
      const ext = opts.validateExternal?.(step.type, step.props);
      if (ext === null || ext === undefined) {
        issues.push({ path: `${p}.type`, message: `未安装的第三方活动 "${step.type}"`, level: 'warning' });
      } else {
        issues.push(...ext.map((i) => ({ ...i, path: `${p}.props.${i.path}` })));
      }
    } else {
      issues.push({ path: `${p}.type`, message: `未知的内置活动 "${step.type}"`, level: 'error' });
    }
  });

  return { lesson, issues };
}

/** 词库校验：id 唯一、颜色/数字词条字段 */
export function validateConcepts(concepts: Concept[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  concepts.forEach((c, i) => {
    if (seen.has(c.id)) issues.push({ path: `concepts.${i}.id`, message: `重复 id "${c.id}"`, level: 'error' });
    seen.add(c.id);
    if (c.category === 'colors' && !c.color) {
      issues.push({ path: `concepts.${i}.color`, message: '颜色词条需要 color', level: 'warning' });
    }
    if (c.category === 'numbers' && c.value === undefined) {
      issues.push({ path: `concepts.${i}.value`, message: '数字词条需要 value', level: 'warning' });
    }
  });
  return issues;
}
