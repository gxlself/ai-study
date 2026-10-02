import { z } from 'zod';
import { AgeRange, Credit, Id, LText, PackPath, SCHEMA_VERSION, SemVer } from './common';

/**
 * 内容包（Content Pack）= 一个文件夹（或 zip）：
 *
 *   <pack>/
 *     pack.json            ← PackManifest
 *     lexicon.json         ← 词库（可选）
 *     routes/*.json        ← 成长路线（可选）
 *     lessons/**\/*.json   ← 课程（递归扫描）
 *     assets/...           ← 图片等素材
 *     audio/manifest.json  ← 朗读音频清单（构建脚本 / 服务端 TTS 生成）
 *     audio/tts/<lang>/*.m4a
 *
 * 服务端从 content/packs/ 与 data/packs/ 加载；后台可上传 zip 导入。
 * 播放端通过 /packs/<packId>/<path> 访问其中文件。
 */
export const PackManifest = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  version: SemVer,
  name: LText,
  description: LText.optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().optional(),
  ageRange: AgeRange,
  lexicon: PackPath.default('lexicon.json'),
  routes: z.array(PackPath).default([]),
  lessonsDir: PackPath.default('lessons'),
  requires: z
    .object({
      /** 需要的 SDK 版本范围，如 "^1.0.0" */
      sdk: z.string().optional(),
      /** 需要的第三方活动插件：type → 版本范围 */
      plugins: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  credits: z.array(Credit).default([]),
  cover: PackPath.optional(),
  tags: z.array(z.string()).optional(),
});
export type PackManifest = z.infer<typeof PackManifest>;

/**
 * 朗读音频清单 audio/manifest.json
 * key = speechKey(lang, text)（见 utils.ts），value = 内容包相对路径
 */
export const AudioManifest = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  voices: z.record(z.string(), z.string()).default({}),
  entries: z.record(z.string(), PackPath),
});
export type AudioManifest = z.infer<typeof AudioManifest>;

/** 服务端返回的内容包信息 */
export interface PackInfo {
  id: string;
  version: string;
  name: { zh: string; en?: string };
  description?: { zh: string; en?: string };
  author?: string;
  license?: string;
  ageRange: [number, number];
  enabled: boolean;
  /** builtin = 仓库 content/packs；installed = 后台导入；custom = 家长自建课程包 */
  source: 'builtin' | 'installed' | 'custom';
  /** 内容包文件访问前缀，如 "/packs/sprout.core/" */
  baseUrl: string;
  lessonCount: number;
  conceptCount: number;
  routeIds: string[];
  credits: { name: string; url?: string; license: string; note?: string }[];
  errors?: string[];
}

/**
 * 预编译内容包 bundle.json（scripts/bundle-pack.ts 生成）：
 * 浏览器无法列目录，播放端离线模式（LocalSource）与远程快速加载都用它。
 */
export interface PackBundle {
  schemaVersion: 1;
  builtAt: string;
  manifest: PackManifest;
  lexicon: import('./lexicon').Lexicon | null;
  routes: import('./route').Route[];
  lessons: import('./lesson').Lesson[];
  audio: AudioManifest | null;
}
