import { z } from 'zod';
import { AgeRange, Id, LText, SCHEMA_VERSION, SemVer } from './common';

/**
 * 第三方活动插件清单 plugin.json（插件以文件夹 / zip 安装到 data/plugins/<id>/，或登记远程 URL）
 *
 *   <plugin>/
 *     plugin.json   ← PluginManifest
 *     index.js      ← ESM，default export: ActivityPlugin | ActivityPlugin[]（见 @sprout/plugin-sdk）
 *     assets/...
 */
export const PluginActivityDecl = z.object({
  /** 必须带命名空间点号，如 "acme.puzzle" */
  type: z.string().regex(/^[a-z0-9][a-z0-9\-]*(\.[a-z0-9][a-z0-9\-]*)+$/, '第三方活动 type 需形如 vendor.name'),
  name: LText,
  description: LText.optional(),
  ageRange: AgeRange.optional(),
  /** props 的 JSON Schema（draft 2020-12），用于服务端校验与后台表单生成 */
  propsSchema: z.record(z.string(), z.unknown()).optional(),
  /** 后台"新建步骤"时的默认 props */
  defaultProps: z.record(z.string(), z.unknown()).optional(),
});
export type PluginActivityDecl = z.infer<typeof PluginActivityDecl>;

export const PluginManifest = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  version: SemVer,
  name: LText,
  description: LText.optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  license: z.string().optional(),
  /** 兼容的 SDK 版本范围，如 "^1.0.0" */
  sdk: z.string(),
  /** 入口 ESM（插件目录相对路径，或绝对 URL） */
  entry: z.string().min(1),
  activities: z.array(PluginActivityDecl).min(1),
  /** 声明需要的能力（播放端据此提示家长） */
  permissions: z.array(z.enum(['network', 'microphone', 'camera', 'storage'])).default([]),
});
export type PluginManifest = z.infer<typeof PluginManifest>;

/** 服务端返回的插件信息 */
export interface PluginInfo {
  id: string;
  version: string;
  name: { zh: string; en?: string };
  description?: { zh: string; en?: string };
  source: 'builtin' | 'installed' | 'remote';
  enabled: boolean;
  /** 播放端 import() 的入口 URL（builtin 为空） */
  entryUrl?: string;
  activities: PluginActivityDecl[];
  permissions: string[];
  errors?: string[];
}
