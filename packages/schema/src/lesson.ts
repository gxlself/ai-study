import { z } from 'zod';
import { AgeRange, Domain, Id, LText, SCHEMA_VERSION } from './common';
import { ContrastPattern } from './activities';
import { ConceptRef } from './lexicon';

/** 一个步骤 = 一个活动插件实例 */
export const ActivityStep = z.object({
  /** 活动类型：内置（无点号）或第三方（含点号命名空间） */
  type: z.string().regex(/^[a-z0-9][a-z0-9\-]*(\.[a-z0-9][a-z0-9\-]*)*$/),
  title: LText.optional(),
  /** 给家长的本步提示（屏幕角落小字显示，不朗读） */
  parentTip: z.string().max(80).optional(),
  props: z.record(z.string(), z.unknown()),
});
export type ActivityStep = z.infer<typeof ActivityStep>;

/** 线下延伸活动：每节课必须至少 1 个，屏幕只是引子，真实互动在屏幕外 */
export const OfflineActivity = z.object({
  title: z.string().min(1),
  minutes: z.number().int().min(1).max(60).optional(),
  materials: z.array(z.string()).optional(),
  steps: z.array(z.string().min(1)).min(1).max(8),
  /** 安全提示（小物件窒息、水、热、高处等） */
  safety: z.string().optional(),
  domains: z.array(Domain).optional(),
  /** 引导式游戏的开放式问题，如"你觉得哪个更重？" */
  question: z.string().optional(),
  /** 难度三档：easier 更简单的玩法 / harder 更有挑战的玩法（默认即中档） */
  levels: z.object({ easier: z.string().optional(), harder: z.string().optional() }).optional(),
});
export type OfflineActivity = z.infer<typeof OfflineActivity>;

export const ParentGuide = z.object({
  /** 开课前展示给家长（≤160 字）：这节课做什么、怎么陪 */
  intro: z.string().min(1).max(160),
  /** 过程中的小技巧 */
  tips: z.array(z.string().max(80)).max(6).optional(),
  /** 家长可以说的话（中英） */
  phrases: z.array(z.object({ zh: z.string(), en: z.string().optional() })).max(8).optional(),
  /** 为什么这样设计（理念 / 研究依据简述，≤120 字） */
  why: z.string().max(120).optional(),
  /** 引用 docs/research/evidence-review.md 的参考文献编号，如 ["R12"] */
  refs: z.array(z.string()).optional(),
});
export type ParentGuide = z.infer<typeof ParentGuide>;

export const CoView = z.enum(['required', 'recommended', 'optional']);
export type CoView = z.infer<typeof CoView>;

/**
 * 课程面向谁：
 * - parent：家长指引课。屏幕给家长看（活动卡 / 儿歌学唱），看完屏幕变暗、去陪玩；不计入孩子屏幕时间。
 *           6–17 月龄只提供这种课（循证依据：docs/research/evidence-review.md 第 9 节）。
 * - child：亲子共看课（缺省）。面向孩子的慢节奏互动，必须/建议家长陪同；ageRange 起点不得小于 18 月。
 */
export const Audience = z.enum(['parent', 'child']);
export type Audience = z.infer<typeof Audience>;

/** 可打印的实体材料（后台"打印"生成 A4 页）：让 6–17 月龄的"可视化学习"发生在屏幕外 */
export const Printable = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('cards'),
    title: z.string().min(1),
    items: z.array(ConceptRef).min(1).max(24),
    size: z.enum(['large', 'medium', 'small']).default('large'),
    showText: z.boolean().default(true),
    showEnglish: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('contrast'),
    title: z.string().min(1),
    patterns: z.array(ContrastPattern).min(1).max(12),
    palette: z.enum(['bw', 'bwr']).default('bw'),
  }),
]);
export type Printable = z.infer<typeof Printable>;

export const Lesson = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** 全局唯一：<packId 简写>.<stage>.<slug>，如 "core.s1.contrast-shapes" */
  id: Id,
  title: LText,
  summary: LText.optional(),
  ageRange: AgeRange,
  /** 首个为主领域 */
  domains: z.array(Domain).min(1).max(4),
  themeId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  /** 建议屏幕时长（分钟） */
  durationMin: z.number().min(1).max(20),
  coView: CoView,
  /** 缺省 child */
  audience: Audience.optional(),
  printables: z.array(Printable).max(4).optional(),
  objectives: z.array(LText).min(1).max(5),
  cover: z
    .object({ concept: z.string().optional(), image: z.string().optional(), bg: z.string().optional() })
    .optional(),
  parentGuide: ParentGuide,
  offline: z.array(OfflineActivity).min(1).max(4),
  steps: z.array(ActivityStep).min(1).max(8),
});
export type Lesson = z.infer<typeof Lesson>;

/** 列表用摘要（服务端索引 / 播放端卡片） */
export interface LessonSummary {
  id: string;
  packId: string;
  title: LText;
  summary?: LText;
  ageRange: [number, number];
  domains: Domain[];
  themeId?: string;
  durationMin: number;
  coView: CoView;
  /** 缺省视为 child */
  audience?: Audience;
  hasPrintables?: boolean;
  cover?: { concept?: string; image?: string; bg?: string; imageUrl?: string };
  stepTypes: string[];
  tags?: string[];
}
