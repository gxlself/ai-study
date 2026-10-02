import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ApiError } from './errors';
import type { AppContext } from './context';

function validPath(path: string): boolean {
  return !path.includes('\0') && !path.includes('\\') && !isAbsolute(path) &&
    !/^[a-z]:/i.test(path) && !path.split('/').some((part) => part === '..' || part.startsWith('.'));
}

export function safeFile(root: string, path: string): string | undefined {
  if (!validPath(path)) throw new ApiError(403, 'UNSAFE_PATH', '不能访问此文件路径');
  const resolved = resolve(root, path);
  if (relative(root, resolved).split(sep).includes('..')) throw new ApiError(403, 'UNSAFE_PATH', '不能访问此文件路径');
  if (!existsSync(resolved)) return undefined;
  const canonicalRoot = realpathSync(root);
  const canonical = realpathSync(resolved);
  const within = relative(canonicalRoot, canonical);
  if (within.startsWith(`..${sep}`) || within === '..' || isAbsolute(within)) {
    throw new ApiError(403, 'UNSAFE_PATH', '不能访问目录外的文件');
  }
  if (!lstatSync(canonical).isFile()) return undefined;
  return resolved;
}

export function guardRawPath(url: string): void {
  let path = url.split('?')[0];
  try {
    for (let index = 0; index < 4; index++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch {
    throw new ApiError(400, 'INVALID_PATH', '请求路径编码无效');
  }
  if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) {
    throw new ApiError(403, 'UNSAFE_PATH', '不能访问目录外的文件');
  }
}

function send(reply: FastifyReply, root: string, path: string, mutable = false): FastifyReply {
  if (!safeFile(root, path)) throw new ApiError(404, 'FILE_NOT_FOUND', '文件不存在');
  reply.header('X-Content-Type-Options', 'nosniff');
  if (extname(path).toLowerCase() === '.svg') {
    reply.type('image/svg+xml');
    reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }
  return reply.sendFile(path, root, {
    maxAge: mutable || path.endsWith('.json') ? 0 : '1d',
    immutable: false, etag: true, lastModified: true, dotfiles: 'deny',
  });
}

export async function registerStatic(app: FastifyInstance, context: AppContext): Promise<void> {
  await app.register(fastifyStatic, { root: context.config.rootDir, serve: false });
  const hidden = { schema: { hide: true } };
  app.get('/packs/:id/*', hidden, async (request, reply) => {
    const { id, '*': path } = request.params as { id: string; '*': string };
    const pack = context.packs.getPack(id);
    if (!pack) throw new ApiError(404, 'PACK_NOT_FOUND', '内容包不存在');
    return send(reply, pack.dir, path, pack.info.source === 'custom');
  });
  app.get('/plugins/:id/*', hidden, async (request, reply) => {
    const { id, '*': path } = request.params as { id: string; '*': string };
    const root = context.plugins.directory(id);
    if (!root) throw new ApiError(404, 'PLUGIN_NOT_FOUND', '插件不存在或不是本地插件');
    return send(reply, root, path);
  });
  const spa = (root: string, path: string, label: string, reply: FastifyReply) => {
    if (!existsSync(join(root, 'index.html'))) {
      return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-store').send(
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>芽芽成长 Sprout</title><body style="font-family:system-ui;max-width:42rem;margin:12vh auto;padding:24px;color:#283b35;background:#f4f8f6"><h1>芽芽成长 Sprout</h1><p>${label}尚未构建，服务端已就绪。</p><p>可访问 <a href="/api/docs">接口文档</a> 查看服务状态。</p></body></html>`,
      );
    }
    const file = safeFile(root, path || 'index.html');
    if (file) return send(reply, root, path || 'index.html', path === 'index.html');
    if (extname(path)) throw new ApiError(404, 'FILE_NOT_FOUND', '静态资源不存在');
    return send(reply, root, 'index.html', true);
  };
  app.get('/admin', hidden, async (_request, reply) => reply.redirect('/admin/'));
  app.get('/admin/*', hidden, async (request, reply) => spa(
    context.config.adminDist, (request.params as { '*': string })['*'], '管理端', reply,
  ));
  app.get('/*', hidden, async (request, reply) => {
    const path = (request.params as { '*': string })['*'];
    if (/^(?:api|packs|plugins)(?:\/|$)/.test(path)) throw new ApiError(404, 'NOT_FOUND', '接口或资源不存在');
    return spa(context.config.playerDist, path, '播放端', reply);
  });
}
