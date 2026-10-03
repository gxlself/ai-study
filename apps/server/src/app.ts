import { existsSync, readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { MilestonesFile } from '@sprout/schema';
import { loadConfig, type ServerConfig } from './config';
import { Store } from './db';
import { PackRegistry } from './content/registry';
import { PluginRegistry } from './plugins/registry';
import { TtsService } from './tts';
import { ApiError } from './errors';
import type { AppContext } from './context';
import { registerAuth } from './routes/auth';
import { registerChildren } from './routes/children';
import { registerDevices } from './routes/devices';
import { registerSessions } from './routes/sessions';
import { registerContent } from './routes/content';
import { registerPlugins } from './routes/plugins';
import { registerSettings } from './routes/settings';
import { registerBackup } from './routes/backup';
import { guardRawPath, registerStatic } from './static';
import { documentSchema } from './openapi';
import { optionalAuthGuard } from './auth';
import { corsOriginAllowed } from './security/cors';
import { ResourceLimiter } from './security/limits';

export async function buildApp(overrides: Partial<ServerConfig> = {}): Promise<FastifyInstance> {
  const config = loadConfig(overrides);
  const app = Fastify({
    logger: config.logger ? { redact: ['req.headers.authorization'] } : false,
    bodyLimit: 25 * 1024 * 1024,
    requestTimeout: 120000,
    trustProxy: false,
  });
  const store = new Store(config.dataDir);
  const limits = new ResourceLimiter();
  limits.register(app);
  let tts: TtsService | undefined;
  let reloadTimer: ReturnType<typeof setInterval> | undefined;
  app.decorateRequest('principal', null);
  app.addHook('onClose', async () => {
    if (reloadTimer) clearInterval(reloadTimer);
    try { await tts?.close(); }
    finally { store.close(); }
  });
  app.setErrorHandler((error, request, reply) => {
    const failure = error as Error & { statusCode?: number; code?: string; issues?: unknown };
    let status = typeof failure.statusCode === 'number' && failure.statusCode >= 400 && failure.statusCode <= 599
      ? failure.statusCode : 500;
    if (failure.code?.startsWith('FST_FILES_LIMIT') || failure.code === 'FST_REQ_FILE_TOO_LARGE') status = 413;
    if (status === 429 && !reply.hasHeader('Retry-After')) reply.header('Retry-After', 5);
    if (status === 500) request.log.error({ err: error }, '请求处理失败');
    const message = failure instanceof ApiError || (status < 500 && failure.issues)
      ? failure.message
      : status === 500 ? '服务端暂时无法处理请求'
      : status === 413 ? '上传文件或请求超过大小限制'
      : status === 429 ? '请求过于频繁，请稍后再试'
      : status === 400 ? '请求格式或内容无效'
      : failure.message;
    reply.code(status).send({
      error: { code: failure.code ?? 'INTERNAL_ERROR', message },
      ...(failure.issues === undefined ? {} : { issues: failure.issues }),
    });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({
    error: { code: 'NOT_FOUND', message: '接口或资源不存在' },
  }));
  app.addHook('onRequest', async (request, reply) => {
    guardRawPath(request.raw.url ?? request.url);
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  try {
    await app.register(cors, {
      origin: (origin, callback) => callback(null, corsOriginAllowed(origin, config.corsOrigins)),
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      preflightContinue: true,
    });
    app.addHook('onRequest', optionalAuthGuard(store));
    app.addHook('onRequest', async (request, reply) => {
      if (request.method === 'OPTIONS' && reply.hasHeader('Access-Control-Allow-Origin')) {
        reply.code(204).header('Content-Length', '0').send();
      }
    });
    await app.register(multipart, { limits: { files: 1, fileSize: 50 * 1024 * 1024 } });
    await app.register(swagger, {
      transform: ({ schema, url, route }) => ({ schema: documentSchema(schema, route.method, url), url }),
      openapi: {
        info: { title: '芽芽成长 Sprout API', version: '1.0.0', description: '家庭局域网亲子共学服务。管理员令牌或配对设备令牌通过 Bearer 传递。' },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      },
    });
    const plugins = new PluginRegistry({ dataDir: config.dataDir, db: store.db });
    const packs = new PackRegistry({
      dataDir: config.dataDir,
      contentDirs: config.contentDirs,
      getEnabled: (id) => store.setting(`pack.enabled.${id}`, true),
      setEnabled: (id, enabled) => store.setSetting(`pack.enabled.${id}`, enabled),
      validateExternal: (type, props) => plugins.validateExternal(type, props),
    });
    packs.reload();
    tts = new TtsService({ dataDir: config.dataDir, getSettings: () => store.settings() });
    let milestones: MilestonesFile = {
      version: 'unavailable', sources: [], items: [],
      disclaimer: {
        zh: '成长观察仅用于亲子交流，不是诊断工具。里程碑数据暂未加载。',
        en: 'Observations are not a diagnostic tool. Milestone data is not available.',
      },
    };
    if (existsSync(config.milestonesPath)) {
      try { milestones = MilestonesFile.parse(JSON.parse(readFileSync(config.milestonesPath, 'utf8'))); }
      catch (error) { app.log.warn({ err: error }, '里程碑文件校验失败，保留空状态'); }
    }
    const context: AppContext = { config, store, packs, plugins, tts, milestones, limits };
    registerAuth(app, context);
    registerChildren(app, context);
    registerDevices(app, context);
    registerSessions(app, context);
    registerContent(app, context);
    registerPlugins(app, context);
    registerSettings(app, context);
    registerBackup(app, context);
    await app.register(swaggerUi, {
      routePrefix: '/api/docs', staticCSP: true,
      uiConfig: { docExpansion: 'list', deepLinking: true, validatorUrl: null },
    });
    await registerStatic(app, context);
    if (config.reloadIntervalMs > 0) {
      reloadTimer = setInterval(() => {
        try { packs.reload(); }
        catch (error) { app.log.warn({ err: error }, '内容热重载失败，将在下一轮重试'); }
      }, config.reloadIntervalMs);
      reloadTimer.unref();
    }
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
