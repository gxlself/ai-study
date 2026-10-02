import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SessionInput } from '@sprout/schema';
import { resolveSessionAudience } from '@sprout/core';
import { authorizeChild } from '../auth';
import { ApiError, dateString, isoString, localDate, parse } from '../errors';
import { options, sessionLessonIndex, type AppContext } from '../context';

export const sessionInputSchema = SessionInput.extend({
  childId: z.string().min(1).max(128), lessonId: z.string().min(1).max(256),
  startedAt: isoString, endedAt: isoString,
  clientId: z.string().min(1).max(256).optional(),
}).refine((input) => Date.parse(input.endedAt) >= Date.parse(input.startedAt), {
  path: ['endedAt'], message: '结束时间不能早于开始时间',
}).refine((input) => input.stepsCompleted <= input.stepsTotal, {
  path: ['stepsCompleted'], message: '已完成步骤不能超过总步骤',
});

function bound(value: string | undefined, end: boolean): string | undefined {
  if (value === undefined) return undefined;
  if (dateString.safeParse(value).success) {
    const date = localDate(value);
    date.setHours(0, 0, 0, 0);
    if (end) date.setDate(date.getDate() + 1);
    return date.toISOString();
  }
  return new Date(parse(isoString, value)).toISOString();
}

export function registerSessions(app: FastifyInstance, context: AppContext): void {
  const { store } = context;
  app.post('/api/sessions', options(context, 'either', '学习记录', '上报记录（clientId 幂等）'), async (request, reply) => {
    const parsed = parse(sessionInputSchema, request.body);
    authorizeChild(store, request, parsed.childId);
    const input = {
      ...parsed,
      audience: resolveSessionAudience(parsed, sessionLessonIndex(context)),
      startedAt: new Date(parsed.startedAt).toISOString(), endedAt: new Date(parsed.endedAt).toISOString(),
    };
    const record = store.saveSession(input, request.principal?.role === 'device' ? request.principal.deviceId : undefined);
    reply.code(201);
    return record;
  });
  app.get('/api/sessions', options(context, 'admin', '学习记录', '按孩子和时间查询学习记录'), async (request) => {
    const input = parse(z.object({
      childId: z.string().min(1).optional(), from: z.string().optional(), to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(5000).default(200),
    }), request.query);
    if (input.childId) store.child(input.childId);
    const from = bound(input.from, false);
    const to = bound(input.to, true);
    if (from && to && from >= to) throw new ApiError(400, 'INVALID_RANGE', '开始时间必须早于结束时间');
    return store.sessions({ childId: input.childId, from, to, limit: input.limit });
  });
}
