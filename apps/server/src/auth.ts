import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { ApiError } from './errors';
import type { Store } from './db';

const scrypt = promisify(scryptCallback);
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
interface PasswordHash { salt: string; hash: string }
export type Principal = { role: 'admin'; hash: string } | { role: 'device'; hash: string; deviceId: string };

declare module 'fastify' {
  interface FastifyRequest { principal: Principal | null }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string { return randomBytes(32).toString('base64url'); }

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return { salt, hash: hash.toString('hex') };
}

export async function verifyPassword(password: string, saved: PasswordHash | null): Promise<boolean> {
  if (!saved) return false;
  const actual = await scrypt(password, saved.salt, 64) as Buffer;
  const expected = Buffer.from(saved.hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function issueAdminToken(store: Store): { token: string; expiresAt: string } {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + THIRTY_DAYS).toISOString();
  store.db.prepare('DELETE FROM admin_tokens WHERE expires_at <= ?').run(now.toISOString());
  store.db.prepare('INSERT INTO admin_tokens VALUES (?, ?)').run(tokenHash(token), expiresAt);
  return { token, expiresAt };
}

export function passwordHash(store: Store): PasswordHash | null {
  return store.setting<PasswordHash | null>('admin.password', null);
}

export function authGuard(store: Store, scope: 'admin' | 'device' | 'either'): preHandlerAsyncHookHandler {
  return async (request) => {
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new ApiError(401, 'UNAUTHORIZED', '请先登录或配对设备');
    const hash = tokenHash(match[1]);
    const admin = store.db.prepare('SELECT hash FROM admin_tokens WHERE hash = ? AND expires_at > ?')
      .get(hash, new Date().toISOString());
    if (admin) {
      request.principal = { role: 'admin', hash };
    } else {
      const device = store.db.prepare('SELECT id FROM devices WHERE token_hash = ?').get(hash);
      if (!device) throw new ApiError(401, 'UNAUTHORIZED', '登录已过期或设备已被移除');
      request.principal = { role: 'device', hash, deviceId: device.id as string };
    }
    if (scope !== 'either' && request.principal.role !== scope) throw new ApiError(403, 'FORBIDDEN', '没有访问此接口的权限');
  };
}

export function authorizeChild(store: Store, request: FastifyRequest, childId: string): void {
  if (request.principal?.role === 'device' && store.device(request.principal.deviceId).childId !== childId) {
    throw new ApiError(403, 'CHILD_FORBIDDEN', '此设备只能访问当前绑定的孩子');
  }
  store.child(childId);
}
