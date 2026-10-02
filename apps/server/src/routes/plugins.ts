import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { options, parameter, type AppContext } from '../context';
import { parse } from '../errors';
import { upload } from './content';

export function registerPlugins(app: FastifyInstance, context: AppContext): void {
  const { plugins, packs } = context;
  const route = (scope: 'admin' | 'either', summary: string) => options(context, scope, '活动插件', summary);
  app.get('/api/plugins', route('either', '活动插件列表'), async () => plugins.list());
  app.post('/api/plugins/install', route('admin', '安装活动插件 ZIP'), async (request, reply) => {
    const file = await upload(request, 50 * 1024 * 1024);
    const result = plugins.installZip(file.bytes);
    packs.reload();
    reply.code(201);
    return result;
  });
  app.post('/api/plugins/remote', route('admin', '登记远程活动插件'), async (request, reply) => {
    const { manifestUrl } = parse(z.object({ manifestUrl: z.url().max(2048) }).strict(), request.body);
    const result = await plugins.registerRemote(manifestUrl);
    packs.reload();
    reply.code(201);
    return result;
  });
  app.put('/api/plugins/:id', route('admin', '启用或停用活动插件'), async (request) => {
    const { enabled } = parse(z.object({ enabled: z.boolean() }).strict(), request.body);
    const result = plugins.setEnabled(parameter(request), enabled);
    packs.reload();
    return result;
  });
  app.delete('/api/plugins/:id', route('admin', '删除第三方活动插件'), async (request) => {
    plugins.deletePlugin(parameter(request));
    packs.reload();
    return { ok: true };
  });
}
