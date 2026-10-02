import { z } from 'zod';
import { BUILTIN_ACTIVITY_PROPS, type BuiltinActivityType } from './activities';
import { Lesson } from './lesson';
import { Lexicon } from './lexicon';
import { PackManifest } from './pack';
import { PluginManifest } from './plugin';
import { Route } from './route';

/** 导出 JSON Schema：用于后台表单生成、第三方工具、文档 */
export function activityPropsJsonSchema(type: BuiltinActivityType): Record<string, unknown> {
  return z.toJSONSchema(BUILTIN_ACTIVITY_PROPS[type], { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}

export function allJsonSchemas(): Record<string, Record<string, unknown>> {
  const opt = { io: 'input' as const, unrepresentable: 'any' as const };
  const out: Record<string, Record<string, unknown>> = {
    lesson: z.toJSONSchema(Lesson, opt) as Record<string, unknown>,
    lexicon: z.toJSONSchema(Lexicon, opt) as Record<string, unknown>,
    route: z.toJSONSchema(Route, opt) as Record<string, unknown>,
    pack: z.toJSONSchema(PackManifest, opt) as Record<string, unknown>,
    plugin: z.toJSONSchema(PluginManifest, opt) as Record<string, unknown>,
  };
  for (const t of Object.keys(BUILTIN_ACTIVITY_PROPS) as BuiltinActivityType[]) {
    out[`activity.${t}`] = activityPropsJsonSchema(t);
  }
  return out;
}
