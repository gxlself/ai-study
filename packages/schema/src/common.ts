import { z } from 'zod';

/**
 * 公共基础类型。所有内容（词库 / 课程 / 路线 / 内容包 / 插件清单）都建立在这里。
 * 修改本文件 = 修改契约，必须同步 docs/dev/content-format.md 并提升 SCHEMA_VERSION。
 */
export const SCHEMA_VERSION = 1 as const;

/** 学习领域（课程按领域平衡；首个为主领域） */
export const DOMAINS = [
  'language', // 中文语言与阅读
  'english', // 英语启蒙
  'math', // 数学思维
  'cognition', // 认知探索（颜色/形状/物体恒存/分类/记忆）
  'science', // 自然与科学（动物/植物/天气/身体）
  'social', // 社会情绪（情绪/家人/分享/规则）
  'music', // 音乐律动
  'art', // 美术创意
  'motor', // 大动作 / 精细动作
  'life', // 生活习惯与自理
] as const;
export const Domain = z.enum(DOMAINS);
export type Domain = z.infer<typeof Domain>;

export const DOMAIN_LABELS: Record<Domain, { zh: string; en: string; color: string }> = {
  language: { zh: '语言阅读', en: 'Language', color: '#F08A5D' },
  english: { zh: '英语启蒙', en: 'English', color: '#5DA9E9' },
  math: { zh: '数学思维', en: 'Math', color: '#6C9A3B' },
  cognition: { zh: '认知探索', en: 'Cognition', color: '#9B72CF' },
  science: { zh: '自然科学', en: 'Nature & Science', color: '#2BA88C' },
  social: { zh: '社会情绪', en: 'Social & Emotional', color: '#E5677D' },
  music: { zh: '音乐律动', en: 'Music & Rhythm', color: '#F2B134' },
  art: { zh: '美术创意', en: 'Art', color: '#D96BB0' },
  motor: { zh: '运动发展', en: 'Movement', color: '#3D8FB8' },
  life: { zh: '生活习惯', en: 'Daily Living', color: '#8D7B68' },
};

/** 语言 */
export const Lang = z.enum(['zh', 'en']);
export type Lang = z.infer<typeof Lang>;

/**
 * 孩子的语言模式（由后台按孩子设置）：
 * - zh: 只中文；en: 只英文
 * - zh-en: 中文在前、英文在后（默认，中文为母语 + 英语启蒙）
 * - en-zh: 英文在前、中文在后
 */
export const LanguageMode = z.enum(['zh', 'zh-en', 'en-zh', 'en']);
export type LanguageMode = z.infer<typeof LanguageMode>;

/** 双语文本：zh 必填，en 可选，pinyin 可选（仅用于家长参考，不强调给婴幼儿认读） */
export const LText = z.object({
  zh: z.string().min(1),
  en: z.string().min(1).optional(),
  pinyin: z.string().optional(),
});
export type LText = z.infer<typeof LText>;

/**
 * 可朗读文本。zh/en 至少一个。
 * 运行时根据孩子 LanguageMode 决定读哪几种、顺序如何；
 * 音频由构建脚本 / 服务端 TTS 依据文本自动生成（见 audio manifest），作者只写文字。
 */
export const Speech = z
  .object({
    zh: z.string().min(1).optional(),
    en: z.string().min(1).optional(),
  })
  .refine((s) => !!(s.zh || s.en), { message: 'Speech 至少需要 zh 或 en' });
export type Speech = z.infer<typeof Speech>;

/** 月龄范围 [min, max]，闭区间，单位：月 */
export const AgeRange = z
  .tuple([z.number().int().min(0).max(72), z.number().int().min(0).max(72)])
  .refine(([a, b]) => a <= b, { message: 'ageRange 需 min <= max' });
export type AgeRange = z.infer<typeof AgeRange>;

/** 内容包内相对路径（不允许 .. 与绝对路径），例如 "assets/images/animals/dog.svg" */
export const PackPath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.split('/').includes('..') && !/^[a-z]+:/i.test(p), {
    message: '必须是内容包内相对路径',
  });
export type PackPath = z.infer<typeof PackPath>;

/** 资源引用：内容包相对路径，或 http(s) URL，或 "concept:<id>"（引用词库词条的图片） */
export const AssetRef = z.string().min(1);
export type AssetRef = z.infer<typeof AssetRef>;

/** 语义化版本号 */
export const SemVer = z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, '需为 semver，如 1.0.0');

/** 标识符：小写字母数字、点、横线 */
export const Id = z.string().regex(/^[a-z0-9][a-z0-9.\-_]*$/, 'id 仅允许小写字母、数字、. - _');

/** 署名（素材 / 内容来源），用于合规展示 */
export const Credit = z.object({
  name: z.string(),
  url: z.string().optional(),
  license: z.string(),
  note: z.string().optional(),
});
export type Credit = z.infer<typeof Credit>;
