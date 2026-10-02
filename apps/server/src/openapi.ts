import { z } from 'zod';
import type { FastifySchema } from 'fastify';
import { ChildInput, Concept, DOMAINS, Lesson, MilestoneObservationInput, SessionInput } from '@sprout/schema';

const json = (schema: z.core.$ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
const body = (schema: z.core.$ZodType): FastifySchema => ({ body: json(schema) });
const string = { type: 'string' };
const childUpdate = ChildInput.partial();
const settings = z.object({
  familyName: z.string().min(1).max(100).optional(),
  ttsProvider: z.enum(['auto', 'macos-say', 'none']).optional(),
  ttsVoices: z.object({ zh: z.string().optional(), en: z.string().optional() }).optional(),
  serverUrlHint: z.string().optional(),
});
const upload: FastifySchema = {
  consumes: ['multipart/form-data'],
  body: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
};
const enable = body(z.object({ enabled: z.boolean() }));
const deviceUpdate = body(z.object({ name: z.string().optional(), childId: z.string().nullable().optional() }));
const requests: Record<string, FastifySchema> = {
  'POST /api/setup': body(z.object({ password: z.string().min(6), familyName: z.string().optional(), child: ChildInput.optional() })),
  'POST /api/auth/login': body(z.object({ password: z.string() })),
  'POST /api/auth/password': body(z.object({ oldPassword: z.string(), newPassword: z.string().min(6) })),
  'POST /api/children': body(ChildInput),
  'PUT /api/children/:id': body(childUpdate),
  'PUT /api/children/:id/milestones/:itemId': body(MilestoneObservationInput),
  'POST /api/packs/import': upload,
  'PUT /api/packs/:id': enable,
  'POST /api/lexicon': body(Concept),
  'PUT /api/lexicon/:id': body(Concept),
  'POST /api/lessons': body(Lesson),
  'PUT /api/lessons/:id': body(Lesson),
  'POST /api/media': upload,
  'POST /api/plugins/install': upload,
  'POST /api/plugins/remote': body(z.object({ manifestUrl: z.url() })),
  'PUT /api/plugins/:id': enable,
  'POST /api/pair/start': body(z.object({ name: z.string().optional(), kind: z.enum(['tv', 'tablet', 'browser']).optional() })),
  'POST /api/pair/approve': body(z.object({ code: z.string().regex(/^\d{6}$/), name: z.string().optional(), childId: z.string().nullable().optional() })),
  'PUT /api/devices/:id': deviceUpdate,
  'PUT /api/device/child': body(z.object({ childId: z.string() })),
  'POST /api/sessions': body(SessionInput),
  'PUT /api/settings': body(settings),
  'POST /api/tts': body(z.object({ lang: z.enum(['zh', 'en']), text: z.string().min(1).max(2000) })),
  'POST /api/backup/restore': {
    body: { type: 'object', required: ['schemaVersion', 'children', 'sessions', 'observations', 'devices', 'settings', 'custom'],
      properties: {
        schemaVersion: { type: 'integer', enum: [1] }, createdAt: { type: 'string', format: 'date-time' },
        children: { type: 'array', items: { type: 'object' } }, sessions: { type: 'array', items: { type: 'object' } },
        observations: { type: 'array', items: { type: 'object' } }, devices: { type: 'array', items: { type: 'object' } },
        settings: { type: 'object' }, custom: { type: 'object' },
      },
    },
  },
};

const queries: Record<string, Record<string, unknown>> = {
  '/api/children/:id/today': { date: { type: 'string', format: 'date' } },
  '/api/children/:id/stats': { days: { type: 'integer', minimum: 1, maximum: 366, default: 7 } },
  '/api/lexicon': { packId: string, category: string, q: string },
  '/api/lessons': {
    age: { type: 'number', minimum: 0, maximum: 72 }, domain: { type: 'string', enum: DOMAINS },
    q: string, packId: string, themeId: string, audience: { type: 'string', enum: ['parent', 'child'] },
  },
  '/api/sessions': { childId: string, from: string, to: string, limit: { type: 'integer', minimum: 1, maximum: 5000, default: 200 } },
};

/** 仅供文档展示；实际请求仍由路由的契约校验处理，避免 Swagger 改写数据。 */
export function documentSchema(schema: FastifySchema, method: string | string[], url: string): FastifySchema {
  if (!url.startsWith('/api/') || schema.hide) return schema;
  const input = requests[`${Array.isArray(method) ? method[0] : method} ${url}`] ?? {};
  return {
    ...schema, ...input,
    ...(queries[url] ? { querystring: { type: 'object', properties: queries[url] } } : {}),
  };
}
