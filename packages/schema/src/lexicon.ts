import { z } from 'zod';
import { AgeRange, Id, PackPath, SCHEMA_VERSION } from './common';

/**
 * 词库（Lexicon）：中英双语"概念卡"的唯一来源。
 * 课程里只引用 concept id（如 "dog"），图片 / 中英文 / 拟声 / 音频都从词库解析，避免重复与错乱。
 */
export const CONCEPT_CATEGORIES = [
  'animals', // 动物
  'fruits', // 水果
  'vegetables', // 蔬菜
  'food', // 食物
  'vehicles', // 交通工具
  'body', // 身体部位
  'family', // 家人
  'home', // 家居 / 日常物品
  'clothes', // 衣物
  'nature', // 自然 / 天气
  'colors', // 颜色
  'shapes', // 形状
  'numbers', // 数字
  'emotions', // 情绪
  'actions', // 动作
  'toys', // 玩具
  'music', // 乐器 / 声音
  'places', // 场所
  'other',
] as const;
export const ConceptCategory = z.enum(CONCEPT_CATEGORIES);
export type ConceptCategory = z.infer<typeof ConceptCategory>;

export const Concept = z.object({
  /** 全局唯一（同一内容包内），小写英文，如 "dog"、"red"、"circle"、"num-3" */
  id: Id,
  category: ConceptCategory,
  /** 中文名（给孩子说的叫法，如 "小狗"） */
  zh: z.string().min(1),
  /** 英文名（单数、小写，专有名词除外，如 "dog"） */
  en: z.string().min(1),
  /** 拼音（带声调），家长参考 */
  pinyin: z.string().optional(),
  /** 中文量词（数数时用："一共三只小狗"），默认 "个"。动物多为 只/条/头/匹，车为 辆，花为 朵，书为 本 */
  measure: z.string().optional(),
  /** 英文复数（不规则时必填，如 sheep / mice / fish / buses），默认在 en 后加 s */
  plural: z.string().optional(),
  /** 图片：内容包相对路径（推荐 SVG） */
  image: PackPath,
  /** 拟声 / 特征短语（可选）：如 { zh: "汪汪汪", en: "woof woof" } */
  sound: z.object({ zh: z.string(), en: z.string() }).optional(),
  /** 一句话描述，用于词卡第二句（可选）：如 { zh: "小狗会摇尾巴", en: "The dog wags its tail." } */
  phrase: z.object({ zh: z.string(), en: z.string() }).optional(),
  /** 颜色概念的色值 / 物体主色（可选） */
  color: z.string().optional(),
  /** 数字概念的数值（可选） */
  value: z.number().optional(),
  /** 建议的最小适用月龄（可选） */
  ageRange: AgeRange.optional(),
  tags: z.array(z.string()).optional(),
});
export type Concept = z.infer<typeof Concept>;

export const Lexicon = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  concepts: z.array(Concept),
});
export type Lexicon = z.infer<typeof Lexicon>;

/** 运行时解析后的词条（图片已转成可访问 URL，附带来源内容包） */
export interface ResolvedConcept extends Concept {
  packId: string;
  imageUrl: string;
}

/** 课程中内联的临时概念（例如家长上传的家人照片），无需进词库 */
export const InlineConcept = z.object({
  id: z.string().optional(),
  zh: z.string().min(1),
  en: z.string().optional(),
  pinyin: z.string().optional(),
  image: z.string().min(1),
  sound: z.object({ zh: z.string(), en: z.string() }).optional(),
  phrase: z.object({ zh: z.string(), en: z.string() }).optional(),
});
export type InlineConcept = z.infer<typeof InlineConcept>;

/** 引用一个概念：词库 id 字符串，或内联对象 */
export const ConceptRef = z.union([z.string().min(1), InlineConcept]);
export type ConceptRef = z.infer<typeof ConceptRef>;
