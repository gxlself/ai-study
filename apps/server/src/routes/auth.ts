import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, issueAdminToken, issuePreviewToken, passwordHash, verifyPassword } from '../auth';
import { ApiError, parse } from '../errors';
import { options, type AppContext } from '../context';
import { childInputSchema } from './children';
import type { ResourceKind } from '../security/limits';

const password = z.string().min(6).max(256);

export function registerAuth(app: FastifyInstance, context: AppContext): void {
  const { store } = context;
  const route = (scope: 'admin' | 'public', summary: string, resource?: ResourceKind) =>
    options(context, scope, '初始化与认证', summary, resource);
  app.get('/api/health', route('public', '服务状态'), async () => ({
    ok: true, version: '1.0.0', time: new Date().toISOString(),
  }));
  app.get('/api/setup/status', route('public', '是否已初始化'), async () => ({ initialized: !!passwordHash(store) }));
  app.post('/api/setup', route('public', '设置家庭与管理员密码', 'password'), async (request) => {
    if (passwordHash(store)) throw new ApiError(409, 'ALREADY_INITIALIZED', '已经完成初始化，请直接登录');
    const input = parse(z.object({
      password, familyName: z.string().trim().min(1).max(100).optional(), child: childInputSchema.optional(),
    }).strict(), request.body);
    const saved = await hashPassword(input.password);
    return store.transaction(() => {
      if (passwordHash(store)) throw new ApiError(409, 'ALREADY_INITIALIZED', '已经完成初始化，请直接登录');
      store.setSetting('admin.password', saved);
      if (input.familyName) store.setSetting('public', { ...store.settings(), familyName: input.familyName });
      if (input.child) store.saveChild(input.child);
      return issueAdminToken(store);
    });
  });
  app.post('/api/auth/login', route('public', '管理员登录', 'password'), async (request, reply) => {
    const { password: candidate } = parse(z.object({ password: z.string().min(1).max(256) }).strict(), request.body);
    const now = Date.now();
    const row = store.db.prepare('SELECT * FROM login_attempts WHERE ip = ?').get(request.ip);
    if (row && Number(row.locked_until) > now) {
      reply.header('Retry-After', Math.ceil((Number(row.locked_until) - now) / 1000));
      throw new ApiError(429, 'LOGIN_LOCKED', '登录尝试过多，请五分钟后重试');
    }
    if (!await verifyPassword(candidate, passwordHash(store))) {
      // 在异步密码计算后读取最新次数，避免并发失败漏计。
      const current = store.db.prepare('SELECT * FROM login_attempts WHERE ip = ?').get(request.ip);
      const failures = current && (!Number(current.locked_until) || Number(current.locked_until) > now)
        ? Number(current.failures) + 1 : 1;
      const locked = failures >= 5;
      store.db.prepare(`INSERT INTO login_attempts VALUES (?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET failures=excluded.failures, locked_until=excluded.locked_until`)
        .run(request.ip, failures, locked ? Date.now() + 5 * 60 * 1000 : 0);
      if (locked) reply.header('Retry-After', 300);
      throw new ApiError(locked ? 429 : 401, locked ? 'LOGIN_LOCKED' : 'INVALID_PASSWORD',
        locked ? '登录尝试过多，请五分钟后重试' : '密码不正确');
    }
    store.db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(request.ip);
    return issueAdminToken(store);
  });
  app.post('/api/auth/logout', route('admin', '退出登录并作废令牌'), async (request) => {
    store.db.prepare('DELETE FROM admin_tokens WHERE hash = ?').run(request.principal!.hash);
    return { ok: true };
  });
  app.get('/api/auth/me', route('admin', '当前管理员'), async () => ({ role: 'admin' }));
  app.post('/api/preview/token', route('admin', '签发十分钟只读预览令牌', 'preview'), async () => issuePreviewToken(store));
  app.post('/api/auth/password', route('admin', '修改管理员密码', 'password'), async (request) => {
    const input = parse(z.object({ oldPassword: z.string().max(256), newPassword: password }).strict(), request.body);
    const previous = passwordHash(store);
    if (!await verifyPassword(input.oldPassword, previous)) throw new ApiError(401, 'INVALID_PASSWORD', '原密码不正确');
    const next = await hashPassword(input.newPassword);
    store.transaction(() => {
      if (JSON.stringify(passwordHash(store)) !== JSON.stringify(previous)) {
        throw new ApiError(409, 'PASSWORD_CHANGED', '密码已被修改，请重新登录');
      }
      store.setSetting('admin.password', next);
      store.db.prepare('DELETE FROM admin_tokens WHERE hash != ?').run(request.principal!.hash);
      store.db.prepare('DELETE FROM login_attempts').run();
    });
    return { ok: true };
  });
}
