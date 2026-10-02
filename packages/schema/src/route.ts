import { z } from 'zod';
import { AgeRange, Domain, Id, LText, SCHEMA_VERSION } from './common';
import { CoView } from './lesson';

/**
 * 成长路线（Route）：阶段 Stage → 主题 Theme → 课程 Lesson。
 * 排课器（@sprout/core scheduler）依据孩子月龄定位阶段与主题，按天生成"今日小旅程"。
 */

/** 屏幕时间策略（各阶段默认值，后台可按孩子下调；上调不得超过 dailyMaxMin 硬上限 60） */
export const ScreenPolicy = z.object({
  sessionMaxMin: z.number().min(1).max(30),
  dailyMaxMin: z.number().min(1).max(60),
  /** 每天建议的课程数 */
  lessonsPerDay: z.number().int().min(1).max(4),
  coView: CoView,
});
export type ScreenPolicy = z.infer<typeof ScreenPolicy>;

export const Theme = z.object({
  id: Id,
  title: LText,
  description: LText.optional(),
  /** 建议持续周数（主题内课程每天轮换、反复，重复对婴幼儿有益） */
  weeks: z.number().int().min(1).max(8),
  domains: z.array(Domain).min(1),
  /** 主题内课程（按建议顺序） */
  lessons: z.array(z.string()).min(1),
  /** 线下重点（家长看） */
  offlineFocus: z.array(z.string()).optional(),
});
export type Theme = z.infer<typeof Theme>;

export const Stage = z.object({
  id: Id,
  title: LText,
  subtitle: LText.optional(),
  ageRange: AgeRange,
  /** 本阶段发展重点 */
  focus: z.array(LText).min(1),
  screen: ScreenPolicy,
  themes: z.array(Theme).min(1),
  /** 一日作息 / 生活中的学习建议（家长看） */
  dailyRhythm: z.array(z.string()).optional(),
  /** 本阶段对应的里程碑观察月龄（milestones.json 的 ageMonths） */
  milestonesAt: z.array(z.number().int()).optional(),
});
export type Stage = z.infer<typeof Stage>;

export const Route = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  title: LText,
  description: LText.optional(),
  stages: z.array(Stage).min(1),
});
export type Route = z.infer<typeof Route>;
