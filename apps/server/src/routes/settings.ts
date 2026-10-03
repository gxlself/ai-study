import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { options, type AppContext } from '../context';
import { parse } from '../errors';

export const settingsSchema = z.object({
  familyName: z.string().trim().min(1).max(100),
  ttsProvider: z.enum(['auto', 'macos-say', 'none']),
  ttsVoices: z.object({ zh: z.string().max(100), en: z.string().max(100) }).strict(),
  serverUrlHint: z.string().max(2048).refine((url) => !url || /^https?:\/\/[^\s]+$/.test(url), '请使用 http 或 https 地址'),
}).strict();

export function registerSettings(app: FastifyInstance, context: AppContext): void {
  const { store, tts } = context;
  const route = (summary: string) => options(context, 'admin', '设置与朗读', summary);
  app.get('/api/settings', route('家庭设置'), async () => store.settings());
  app.put('/api/settings', route('更新家庭设置'), async (request) => {
    const patch = parse(settingsSchema.partial().extend({
      ttsVoices: settingsSchema.shape.ttsVoices.partial().optional(),
    }), request.body);
    const previous = store.settings();
    const settings = { ...previous, ...patch, ttsVoices: { ...previous.ttsVoices, ...patch.ttsVoices } };
    store.setSetting('public', settings);
    return settings;
  });
  app.get('/api/tts/status', options(context, 'admin', '设置与朗读', '本机朗读能力与声音列表', 'tts'), async () => tts.status());
  app.post('/api/tts', options(context, 'admin', '设置与朗读', '生成朗读音频', 'tts'), async (request) => {
    const { lang, text } = parse(z.object({ lang: z.enum(['zh', 'en']), text: z.string().trim().min(1).max(2000) }).strict(), request.body);
    return tts.generate(lang, text);
  });
}
