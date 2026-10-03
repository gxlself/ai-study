import type { FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { LessonSummary, MilestonesFile } from '@sprout/schema';
import { summarizeLesson } from '@sprout/core';
import type { ServerConfig } from './config';
import type { Store } from './db';
import type { PackRegistry } from './content/registry';
import type { PluginRegistry } from './plugins/registry';
import type { TtsService } from './tts';
import { authGuard } from './auth';
import type { ResourceKind, ResourceLimiter } from './security/limits';

export interface AppContext {
  config: ServerConfig;
  store: Store;
  packs: PackRegistry;
  plugins: PluginRegistry;
  tts: TtsService;
  milestones: MilestonesFile;
  limits: ResourceLimiter;
}

export function options(
  context: AppContext,
  scope: 'admin' | 'device' | 'either' | 'public',
  tag: string,
  summary: string,
  resource?: ResourceKind,
): RouteShorthandOptions {
  return {
    onRequest: [
      ...(scope === 'public' ? [] : [authGuard(context.store, scope)]),
      ...(resource ? [context.limits.guard(resource)] : []),
    ],
    ...(resource ? { config: { sproutResource: resource } } : {}),
    ...(resource && resource !== 'upload' && resource !== 'import' ? { bodyLimit: 16 * 1024 } : {}),
    schema: {
      tags: [tag], summary,
      security: scope === 'public' ? [] : [{ bearerAuth: [] }],
    },
  };
}

export function parameter(request: FastifyRequest, key = 'id'): string {
  return (request.params as Record<string, string>)[key];
}

/** 旧记录没有 audience 时仍可从已停用但尚未删除的包解析课程类型。 */
export function sessionLessonIndex(context: AppContext): Record<string, LessonSummary> {
  return Object.fromEntries(context.packs.list().flatMap(({ id }) =>
    (context.packs.getPack(id)?.lessons ?? []).map((lesson) => [lesson.id, summarizeLesson(lesson, id)])));
}
