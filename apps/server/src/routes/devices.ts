import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DeviceBootstrap, DeviceInfo } from '@sprout/schema';
import { ApiError, parse } from '../errors';
import { newToken, tokenHash } from '../auth';
import { options, parameter, type AppContext } from '../context';

const deviceName = z.string().trim().min(1).max(80);
const childIdSchema = z.string().min(1).max(128).nullable();

export function registerDevices(app: FastifyInstance, context: AppContext): void {
  const { store, packs, plugins } = context;
  const route = (scope: 'admin' | 'device' | 'public', summary: string) => options(context, scope, '设备与配对', summary);
  app.post('/api/pair/start', route('public', '开始十分钟设备配对'), async (request) => {
    const input = parse(z.object({
      name: deviceName.optional(), kind: z.enum(['tv', 'tablet', 'browser']).default('browser'),
    }).strict(), request.body ?? {});
    const now = new Date();
    store.db.prepare('DELETE FROM pairings WHERE expires_at < ?').run(new Date(now.getTime() - 24 * 3600 * 1000).toISOString());
    const pending = store.db.prepare("SELECT COUNT(*) AS count FROM pairings WHERE expires_at > ? AND status = 'pending'")
      .get(now.toISOString())!;
    if (Number(pending.count) >= 1000) throw new ApiError(429, 'TOO_MANY_PAIRINGS', '配对请求过多，请稍后重试');
    let code: string;
    do { code = randomInt(0, 1000000).toString().padStart(6, '0'); }
    while (store.db.prepare('SELECT id FROM pairings WHERE code = ?').get(code));
    const pairingId = randomUUID();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    store.db.prepare('INSERT INTO pairings(id, code, name, kind, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(pairingId, code, input.name ?? '播放设备', input.kind, expiresAt);
    return { pairingId, code, expiresAt };
  });
  app.get('/api/pair/:pairingId', route('public', '轮询配对结果（令牌仅返回一次）'), async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return store.transaction(() => {
      const row = store.db.prepare('SELECT * FROM pairings WHERE id = ?').get(parameter(request, 'pairingId'));
      if (!row) throw new ApiError(404, 'PAIRING_NOT_FOUND', '配对请求不存在，请重新开始');
      if ((row.expires_at as string) <= new Date().toISOString()) return { status: 'expired' };
      if (row.status === 'pending') return { status: 'pending' };
      if (row.claimed) return { status: 'approved', deviceId: row.device_id };
      const deviceToken = newToken();
      store.db.prepare('UPDATE devices SET token_hash = ? WHERE id = ?').run(tokenHash(deviceToken), row.device_id as string);
      store.db.prepare('UPDATE pairings SET claimed = 1 WHERE id = ?').run(row.id as string);
      return { status: 'approved', deviceId: row.device_id, deviceToken };
    });
  });
  app.post('/api/pair/approve', route('admin', '确认配对并绑定孩子'), async (request) => {
    const input = parse(z.object({
      code: z.string().regex(/^\d{6}$/), name: deviceName.optional(), childId: childIdSchema.optional(),
    }).strict(), request.body);
    if (input.childId) store.child(input.childId);
    return store.transaction(() => {
      const row = store.db.prepare('SELECT * FROM pairings WHERE code = ?').get(input.code);
      if (!row || (row.expires_at as string) <= new Date().toISOString()) {
        throw new ApiError(410, 'PAIRING_EXPIRED', '配对码不存在或已过期，请在播放端重新生成');
      }
      if (row.status !== 'pending') throw new ApiError(409, 'PAIRING_APPROVED', '此配对码已使用');
      const device: DeviceInfo = {
        id: randomUUID(), name: input.name ?? row.name as string, kind: row.kind as string,
        childId: input.childId ?? null, createdAt: new Date().toISOString(), lastSeenAt: null,
      };
      store.putDevice(device);
      store.db.prepare("UPDATE pairings SET status = 'approved', device_id = ? WHERE id = ?")
        .run(device.id, row.id as string);
      return device;
    });
  });
  app.get('/api/devices', route('admin', '设备列表'), async () => store.devices());
  app.put('/api/devices/:id', route('admin', '更新设备名称或绑定孩子'), async (request) => {
    const previous = store.device(parameter(request));
    const input = parse(z.object({ name: deviceName.optional(), childId: childIdSchema.optional() }).strict(), request.body);
    if (input.childId) store.child(input.childId);
    store.db.prepare('UPDATE devices SET name = ?, child_id = ? WHERE id = ?')
      .run(input.name ?? previous.name, input.childId === undefined ? previous.childId : input.childId, previous.id);
    return store.device(previous.id);
  });
  app.delete('/api/devices/:id', route('admin', '移除设备并吊销令牌'), async (request) => {
    store.device(parameter(request));
    store.db.prepare('DELETE FROM devices WHERE id = ?').run(parameter(request));
    return { ok: true };
  });
  app.get('/api/device/bootstrap', route('device', '播放端启动数据'), async (request): Promise<DeviceBootstrap> => {
    const deviceId = request.principal!.role === 'device' ? request.principal!.deviceId : '';
    const serverTime = new Date().toISOString();
    store.db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(serverTime, deviceId);
    const device = store.device(deviceId);
    const settings = store.settings();
    return {
      serverTime, device, child: device.childId ? store.child(device.childId) : null,
      children: store.children().map(({ id, name, nickname, avatar, birthday }) => ({ id, name, nickname, avatar, birthday })),
      packs: packs.list().filter((pack) => pack.enabled), plugins: plugins.list().filter((plugin) => plugin.enabled),
      settings: { familyName: settings.familyName, ttsVoices: settings.ttsVoices },
    };
  });
  app.put('/api/device/child', route('device', '播放端切换孩子'), async (request) => {
    const input = parse(z.object({ childId: z.string().min(1).max(128) }).strict(), request.body);
    const child = store.child(input.childId);
    const id = request.principal!.role === 'device' ? request.principal!.deviceId : '';
    store.db.prepare('UPDATE devices SET child_id = ? WHERE id = ?').run(child.id, id);
    return store.device(id);
  });
}
