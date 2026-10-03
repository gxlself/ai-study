import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { DeviceInfo, PreviewToken } from '@sprout/schema';
import { ApiError } from './errors';
import type { Store } from './db';

const scrypt = promisify(scryptCallback);
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
export const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;
interface PasswordHash { salt: string; hash: string }
export type Principal = { role: 'admin' | 'preview'; hash: string } | { role: 'device'; hash: string; deviceId: string };

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

export function issuePreviewToken(store: Store): PreviewToken {
  const token = newToken();
  const now = Date.now();
  const expiresAt = new Date(now + PREVIEW_TOKEN_TTL_MS).toISOString();
  store.db.prepare('DELETE FROM preview_tokens WHERE expires_at <= ?').run(new Date(now).toISOString());
  store.db.prepare('INSERT INTO preview_tokens VALUES (?, ?)').run(tokenHash(token), expiresAt);
  return { token, expiresAt };
}

export function passwordHash(store: Store): PasswordHash | null {
  return store.setting<PasswordHash | null>('admin.password', null);
}

function previewReadAllowed(request: FastifyRequest): boolean {
  return request.method === 'GET' && [
    '/api/lessons', '/api/lessons/:id', '/api/lexicon', '/api/packs', '/api/plugins',
    '/api/routes', '/api/routes/:id', '/api/schemas', '/packs/:id/*', '/plugins/:id/*',
  ].includes(request.routeOptions.url ?? '');
}

function authenticate(store: Store, request: FastifyRequest): void {
  if (request.principal) return;
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/i.exec(request.headers.authorization ?? '');
  if (!match) throw new ApiError(401, 'UNAUTHORIZED', '请先登录或配对设备');
  const hash = tokenHash(match[1]);
  const now = new Date().toISOString();
  const admin = store.db.prepare('SELECT hash FROM admin_tokens WHERE hash = ? AND expires_at > ?').get(hash, now);
  if (admin) {
    request.principal = { role: 'admin', hash };
    return;
  }
  const device = store.db.prepare('SELECT id FROM devices WHERE token_hash = ?').get(hash);
  if (device) {
    request.principal = { role: 'device', hash, deviceId: device.id as string };
    return;
  }
  const preview = store.db.prepare('SELECT hash FROM preview_tokens WHERE hash = ? AND expires_at > ?').get(hash, now);
  if (!preview) throw new ApiError(401, 'UNAUTHORIZED', '登录或预览已过期，或设备已被移除');
  request.principal = { role: 'preview', hash };
}

/** 携带预览令牌的公共接口与静态请求也必须经过只读白名单。 */
export function optionalAuthGuard(store: Store): preHandlerAsyncHookHandler {
  return async (request) => {
    if (request.headers.authorization === undefined) return;
    authenticate(store, request);
    if (request.principal?.role === 'preview' && !previewReadAllowed(request)) {
      throw new ApiError(403, 'PREVIEW_FORBIDDEN', '预览令牌只能读取课程与活动资源');
    }
  };
}

export function authGuard(store: Store, scope: 'admin' | 'device' | 'either'): preHandlerAsyncHookHandler {
  return async (request) => {
    authenticate(store, request);
    if (request.principal?.role === 'preview') {
      if (scope === 'either' && previewReadAllowed(request)) return;
      throw new ApiError(403, 'PREVIEW_FORBIDDEN', '预览令牌只能读取课程与活动资源');
    }
    if (scope !== 'either' && request.principal?.role !== scope) throw new ApiError(403, 'FORBIDDEN', '没有访问此接口的权限');
  };
}

export function deviceAllowsChild(device: DeviceInfo, childId: string): boolean {
  return device.allowedChildIds == null || device.allowedChildIds.includes(childId);
}

export function assertDeviceChildAllowed(device: DeviceInfo, childId: string): void {
  if (!deviceAllowsChild(device, childId)) {
    throw new ApiError(403, 'CHILD_FORBIDDEN', '管理员尚未允许此设备使用这个孩子的资料');
  }
}

export function authorizeChild(store: Store, request: FastifyRequest, childId: string): void {
  if (request.principal?.role === 'device') {
    const device = store.device(request.principal.deviceId);
    assertDeviceChildAllowed(device, childId);
    if (device.childId !== childId) throw new ApiError(403, 'CHILD_FORBIDDEN', '此设备只能访问当前绑定的孩子');
  }
  store.child(childId);
}
