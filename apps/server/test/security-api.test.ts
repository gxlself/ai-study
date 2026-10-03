import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { ChildInput } from '@sprout/schema';
import { buildApp } from '../src/app';
import { PREVIEW_TOKEN_TTL_MS, tokenHash } from '../src/auth';
import { Store } from '../src/db';
import { RESOURCE_LIMITS } from '../src/security/limits';
import { exampleLesson, fixture } from './app-fixture';
import { plugin, pluginZip } from './fixtures/content';

function multipart(bytes: Uint8Array) {
  const boundary = 'sprout-security-test';
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="plugin.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('T18 服务端安全回归', () => {
  let app: FastifyInstance;
  let paths: ReturnType<typeof fixture>;
  let token: string;
  let childId: string;
  const request = (method: InjectOptions['method'], url: string, payload?: InjectOptions['payload'], auth = token) =>
    app.inject({ method, url, payload, headers: auth ? { authorization: `Bearer ${auth}` } : {} });
  const withDb = <T>(read: (db: DatabaseSync) => T): T => {
    const db = new DatabaseSync(join(paths.dataDir, 'sprout.db'));
    try { return read(db); } finally { db.close(); }
  };
  const pair = async (child?: string, allowedChildIds?: string[] | null) => {
    const start = (await request('POST', '/api/pair/start', {}, '')).json();
    const device = (await request('POST', '/api/pair/approve', { code: start.code, childId: child, allowedChildIds })).json();
    const poll = (await request('GET', `/api/pair/${start.pairingId}`, undefined, '')).json();
    return { device, token: poll.deviceToken as string };
  };
  const session = (durationSec: number, elapsedSec: number, extra: Record<string, unknown> = {}) => {
    const endedAt = new Date().toISOString();
    return { childId, lessonId: exampleLesson.id, startedAt: new Date(Date.parse(endedAt) - elapsedSec * 1000).toISOString(),
      endedAt, durationSec, completed: true, stepsCompleted: 1, stepsTotal: 1, ...extra };
  };
  beforeEach(async () => {
    paths = fixture();
    app = await buildApp({ ...paths, reloadIntervalMs: 0,
      playerDist: join(paths.directory, 'no-player'), adminDist: join(paths.directory, 'no-admin'), corsOrigins: null });
    const setup = await request('POST', '/api/setup', {
      password: 'security-test-password', child: { name: '芽芽', birthday: '2024-01-01' },
    }, '');
    expect(setup.statusCode, setup.body).toBe(200);
    token = setup.json().token;
    childId = (await request('GET', '/api/children')).json()[0].id;
    await request('PUT', '/api/settings', { ttsProvider: 'none' });
  });
  afterEach(async () => {
    await app?.close();
    if (paths) rmSync(paths.directory, { recursive: true, force: true });
  });

  it('只由管理员签发十分钟预览令牌，数据库只保存哈希', async () => {
    const paired = await pair(childId);
    expect((await request('POST', '/api/preview/token', undefined, '')).statusCode).toBe(401);
    expect((await request('POST', '/api/preview/token', undefined, paired.token)).statusCode).toBe(403);
    const before = Date.now();
    const preview = await request('POST', '/api/preview/token');
    expect(preview.statusCode, preview.body).toBe(200);
    const issued = preview.json();
    expect(issued.token).not.toBe(token);
    expect(Date.parse(issued.expiresAt)).toBeGreaterThanOrEqual(before + PREVIEW_TOKEN_TTL_MS);
    expect(Date.parse(issued.expiresAt)).toBeLessThanOrEqual(Date.now() + PREVIEW_TOKEN_TTL_MS);
    const stored = withDb((db) => db.prepare('SELECT * FROM preview_tokens').all());
    expect(stored).toEqual([{ hash: tokenHash(issued.token), expires_at: issued.expiresAt }]);
    expect(JSON.stringify(stored)).not.toContain(issued.token);
  });

  it('预览只允许 GET 白名单；不能读取家庭资料、备份、管理页面或写接口', async () => {
    const file = multipart(pluginZip());
    expect((await app.inject({ method: 'POST', url: '/api/plugins/install', ...file,
      headers: { ...file.headers, authorization: `Bearer ${token}` } })).statusCode).toBe(201);
    const preview = (await request('POST', '/api/preview/token')).json().token;
    for (const path of [
      '/api/lessons', '/api/lessons/core.sample', '/api/lexicon', '/api/packs', '/api/plugins',
      '/api/routes', '/api/routes/sprout.core.route', '/api/schemas',
      '/packs/sprout.core/assets/circle.svg', '/plugins/acme.demo/dist/index.js',
    ]) expect((await request('GET', path, undefined, preview)).statusCode, path).toBe(200);
    for (const path of [
      '/api/children', `/api/children/${childId}`, '/api/devices', '/api/device/bootstrap',
      '/api/settings', '/api/sessions', '/api/backup', '/api/tts/status', '/api/auth/me',
      '/api/packs/sprout.core/export', '/api/packs/sprout.core/validate', '/api/health', '/api/docs/json', '/admin/', '/',
    ]) expect((await request('GET', path, undefined, preview)).statusCode, path).toBe(403);
    for (const [method, path] of [
      ['POST', '/api/sessions'], ['POST', '/api/preview/token'], ['POST', '/api/pair/start'],
      ['POST', '/api/lessons'], ['PUT', '/api/packs/sprout.core'], ['DELETE', '/api/plugins/acme.demo'],
      ['HEAD', '/packs/sprout.core/assets/circle.svg'],
    ] as const) expect((await request(method, path, {}, preview)).statusCode, path).toBe(403);
  });

  it('过期令牌不能读取 API 或原本公开的静态文件，即使过期行已清理', async () => {
    const preview = (await request('POST', '/api/preview/token')).json().token;
    withDb((db) => db.prepare('UPDATE preview_tokens SET expires_at = ? WHERE hash = ?')
      .run('2000-01-01T00:00:00.000Z', tokenHash(preview)));
    for (const path of ['/api/lessons', '/api/schemas', '/packs/sprout.core/assets/circle.svg']) {
      expect((await request('GET', path, undefined, preview)).statusCode).toBe(401);
    }
    await request('POST', '/api/preview/token');
    expect((await request('GET', '/packs/sprout.core/assets/circle.svg', undefined, preview)).statusCode).toBe(401);
    expect((await request('GET', '/packs/sprout.core/assets/circle.svg', undefined, '')).statusCode).toBe(200);
  });

  it('配对默认允许全部孩子，电视可切换；管理员收紧后阻止未授权访问及上报', async () => {
    const other = (await request('POST', '/api/children', { name: '豆豆', birthday: '2024-02-01' })).json().id;
    const paired = await pair(childId);
    expect(paired.device.allowedChildIds).toBeNull();
    const bootstrap = (await request('GET', '/api/device/bootstrap', undefined, paired.token)).json();
    expect(bootstrap.children.map((child: { id: string }) => child.id)).toEqual([childId, other]);
    expect((await request('GET', `/api/children/${other}`, undefined, paired.token)).statusCode).toBe(403);
    expect((await request('POST', '/api/sessions', session(30, 30, { childId: other }), paired.token)).statusCode).toBe(403);
    expect((await request('PUT', '/api/device/child', { childId: other }, paired.token)).statusCode).toBe(200);
    expect((await request('POST', '/api/sessions', session(30, 30, { childId: other }), paired.token)).statusCode).toBe(201);
    await request('PUT', `/api/devices/${paired.device.id}`, { allowedChildIds: [childId] });
    expect((await request('GET', '/api/devices')).json()[0].childId).toBeNull();
    expect((await request('GET', '/api/device/bootstrap', undefined, paired.token)).json().children
      .map((child: { id: string }) => child.id)).toEqual([childId]);
    expect((await request('PUT', '/api/device/child', { childId: other }, paired.token)).statusCode).toBe(403);
    expect((await request('GET', `/api/children/${other}`, undefined, paired.token)).statusCode).toBe(403);
    expect((await request('POST', '/api/sessions', session(30, 30, { childId: other }), paired.token)).statusCode).toBe(403);
    expect((await request('PUT', `/api/devices/${paired.device.id}`, { childId: other })).statusCode).toBe(403);
  });

  it('未绑定的新设备可选择孩子，显式 [] 才表示无授权；拒绝未知或重复的允许孩子', async () => {
    const paired = await pair();
    expect(paired.device).toMatchObject({ childId: null, allowedChildIds: null });
    expect((await request('GET', '/api/device/bootstrap', undefined, paired.token)).json().children
      .map((child: { id: string }) => child.id)).toEqual([childId]);
    expect((await request('PUT', '/api/device/child', { childId }, paired.token)).statusCode).toBe(200);
    expect((await request('PUT', `/api/devices/${paired.device.id}`, { allowedChildIds: [] })).json()
      .allowedChildIds).toEqual([]);
    expect((await request('GET', '/api/device/bootstrap', undefined, paired.token)).json().children).toEqual([]);
    expect((await request('PUT', '/api/device/child', { childId }, paired.token)).statusCode).toBe(403);
    expect((await request('PUT', `/api/devices/${paired.device.id}`, { allowedChildIds: ['missing'] })).statusCode).toBe(404);
    expect((await request('PUT', `/api/devices/${paired.device.id}`, { allowedChildIds: [childId, childId] })).statusCode).toBe(400);
    const update = await request('PUT', `/api/devices/${paired.device.id}`, { allowedChildIds: null, childId });
    expect(update.json()).toMatchObject({ allowedChildIds: null, childId });
    const future = (await request('POST', '/api/children', { name: '新孩子', birthday: '2024-03-01' })).json().id;
    expect((await request('PUT', '/api/device/child', { childId: future }, paired.token)).statusCode).toBe(200);
    await request('DELETE', `/api/children/${future}`);
    expect((await request('GET', '/api/devices')).json()[0]).toMatchObject({ childId: null, allowedChildIds: null });
    await request('PUT', `/api/devices/${paired.device.id}`, { allowedChildIds: [childId], childId });
    await request('DELETE', `/api/children/${childId}`);
    expect((await request('GET', '/api/devices')).json()[0]).toMatchObject({ childId: null, allowedChildIds: [] });
  });

  it('显式设备授权列表重启及备份恢复不丢失；旧备份缺少字段时默认全部孩子', async () => {
    const paired = await pair(childId);
    const other = (await request('POST', '/api/children', { name: '豆豆', birthday: '2024-02-01' })).json().id;
    await request('PUT', `/api/devices/${paired.device.id}`, { allowedChildIds: [childId, other] });
    await app.close();
    app = await buildApp({ ...paths, reloadIntervalMs: 0, corsOrigins: null });
    expect((await request('GET', '/api/devices')).json()[0].allowedChildIds).toEqual([childId, other]);
    const backup = (await request('GET', '/api/backup')).json();
    expect((await request('POST', '/api/backup/restore', { ...backup,
      devices: [{ ...backup.devices[0], allowedChildIds: ['missing'] }] })).statusCode).toBe(400);
    expect((await request('POST', '/api/backup/restore', backup)).statusCode).toBe(200);
    expect((await request('GET', '/api/devices')).json()[0].allowedChildIds).toEqual([childId, other]);
    delete backup.devices[0].allowedChildIds;
    expect((await request('POST', '/api/backup/restore', backup)).statusCode).toBe(200);
    expect((await request('GET', '/api/devices')).json()[0].allowedChildIds).toBeNull();
  });

  it('配对批准支持显式列表和空数组，并拒绝不在列表内的当前孩子', async () => {
    const other = (await request('POST', '/api/children', { name: '豆豆', birthday: '2024-02-01' })).json().id;
    const restricted = await pair(childId, [childId]);
    expect(restricted.device).toMatchObject({ childId, allowedChildIds: [childId] });
    expect((await request('PUT', '/api/device/child', { childId: other }, restricted.token)).statusCode).toBe(403);
    const blocked = await pair(undefined, []);
    expect(blocked.device).toMatchObject({ childId: null, allowedChildIds: [] });
    expect((await request('GET', '/api/device/bootstrap', undefined, blocked.token)).json().children).toEqual([]);
    expect((await request('PUT', '/api/device/child', { childId }, blocked.token)).statusCode).toBe(403);
    const start = (await request('POST', '/api/pair/start', {}, '')).json();
    expect((await request('POST', '/api/pair/approve', { code: start.code, childId, allowedChildIds: [] })).statusCode).toBe(403);
    expect((await request('POST', '/api/pair/approve', { code: start.code, allowedChildIds: ['missing'] })).statusCode).toBe(404);
    expect((await request('POST', '/api/pair/approve', { code: start.code, allowedChildIds: [childId, childId] })).statusCode).toBe(400);
    const approved = await request('POST', '/api/pair/approve', { code: start.code, childId, allowedChildIds: null });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({ childId, allowedChildIds: null });
  });

  it('设备更新省略允许列表时保留 null、非空数组和空数组，当前孩子不决定允许范围', async () => {
    const other = (await request('POST', '/api/children', { name: '豆豆', birthday: '2024-02-01' })).json().id;
    const paired = await pair(childId);
    const path = `/api/devices/${paired.device.id}`;
    expect((await request('PUT', path, { name: '卧室电视' })).json().allowedChildIds).toBeNull();
    expect((await request('PUT', path, { childId: other })).json()).toMatchObject({ childId: other, allowedChildIds: null });
    expect(withDb((db) => db.prepare('SELECT allowed_child_ids_json FROM devices WHERE id = ?').get(paired.device.id))
      ?.allowed_child_ids_json).toBeNull();
    await request('PUT', path, { allowedChildIds: [childId, other] });
    expect((await request('PUT', path, { name: '客厅电视', childId })).json())
      .toMatchObject({ childId, allowedChildIds: [childId, other] });
    await request('PUT', path, { allowedChildIds: [] });
    expect((await request('PUT', path, { name: '暂不使用' })).json()).toMatchObject({ childId: null, allowedChildIds: [] });
    expect((await request('PUT', path, { allowedChildIds: null })).json().allowedChildIds).toBeNull();
  });

  it('删除孩子只清理数组中的 id，null 的默认全部权限保持不变', async () => {
    const other = (await request('POST', '/api/children', { name: '豆豆', birthday: '2024-02-01' })).json().id;
    const all = await pair(childId);
    const restricted = await pair(childId, [childId, other]);
    await request('DELETE', `/api/children/${childId}`);
    let devices = (await request('GET', '/api/devices')).json();
    expect(devices.find((device: { id: string }) => device.id === all.device.id))
      .toMatchObject({ childId: null, allowedChildIds: null });
    expect(devices.find((device: { id: string }) => device.id === restricted.device.id))
      .toMatchObject({ childId: null, allowedChildIds: [other] });
    await request('DELETE', `/api/children/${other}`);
    devices = (await request('GET', '/api/devices')).json();
    expect(devices.find((device: { id: string }) => device.id === all.device.id).allowedChildIds).toBeNull();
    expect(devices.find((device: { id: string }) => device.id === restricted.device.id).allowedChildIds).toEqual([]);
  });

  it('截断虚报时长并记录审计 event；正常记录与 clientId 幂等不变', async () => {
    const paired = await pair(childId);
    const oversized = await request('POST', '/api/sessions', session(7200, 10, { clientId: 'clamped' }), paired.token);
    expect(oversized.statusCode, oversized.body).toBe(201);
    expect(oversized.json()).toMatchObject({ durationSec: 15, events: [{
      t: 15, type: 'server:duration-clamped', data: { reportedDurationSec: 7200, acceptedDurationSec: 15, elapsedLimitSec: 15 },
    }] });
    const duplicate = await request('POST', '/api/sessions', session(20, 30, { clientId: 'clamped' }), paired.token);
    expect(duplicate.json()).toEqual(oversized.json());
    const normal = await request('POST', '/api/sessions', session(40, 60), paired.token);
    expect(normal.json().durationSec).toBe(40);
    expect(normal.json().events).toBeUndefined();
    expect((await request('GET', `/api/children/${childId}/screen`)).json().usedSec).toBe(55);
  });

  it('按年龄和家庭单次上限两倍截断，事件列表满时仍保留服务端审计', async () => {
    await request('PUT', `/api/children/${childId}`, { screen: { sessionMaxMin: 1 } });
    const events = Array.from({ length: 500 }, (_, t) => ({ t, type: 'client:step' }));
    const bounded = await request('POST', '/api/sessions', session(7200, 7200, { events }));
    expect(bounded.json()).toMatchObject({ durationSec: 120 });
    expect(bounded.json().events).toHaveLength(500);
    expect(bounded.json().events.at(-1)).toMatchObject({ type: 'server:duration-clamped', data: { sessionLimitSec: 120 } });
    const birthday = new Date();
    birthday.setDate(1);
    birthday.setMonth(birthday.getMonth() - 20);
    const yyyyMmDd = `${birthday.getFullYear()}-${String(birthday.getMonth() + 1).padStart(2, '0')}-01`;
    await request('PUT', `/api/children/${childId}`, { birthday: yyyyMmDd, screen: { sessionMaxMin: 30 } });
    expect((await request('POST', '/api/sessions', session(7200, 7200))).json().durationSec).toBe(960);
  });

  it('停用包/插件的 GET、HEAD、条件缓存请求均为 404；包内主动文件只作为下载文本', async () => {
    for (const file of ['page.HTML', 'module.js', 'module.mjs']) writeFileSync(join(paths.packDir, 'assets', file), '<script>unsafe()</script>');
    for (const file of ['page.HTML', 'module.js', 'module.mjs']) {
      const response = await request('GET', `/packs/sprout.core/assets/${file}`, undefined, '');
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }
    const svg = await request('GET', '/packs/sprout.core/assets/circle.svg', undefined, '');
    await request('PUT', '/api/packs/sprout.core', { enabled: false });
    for (const method of ['GET', 'HEAD'] as const) {
      expect((await request(method, '/packs/sprout.core/assets/circle.svg', undefined, '')).statusCode).toBe(404);
    }
    expect((await app.inject({ url: '/packs/sprout.core/assets/circle.svg',
      headers: { 'if-none-match': String(svg.headers.etag) } })).statusCode).toBe(404);
    const upload = multipart(pluginZip(plugin({ permissions: ['network', 'storage'] })));
    const installed = await app.inject({ method: 'POST', url: '/api/plugins/install', ...upload,
      headers: { ...upload.headers, authorization: `Bearer ${token}` } });
    expect(installed.json()).toMatchObject({ source: 'installed', permissions: ['network', 'storage'],
      entryUrl: '/plugins/acme.demo/dist/index.js' });
    const entry = await request('GET', installed.json().entryUrl, undefined, '');
    expect(entry.statusCode).toBe(200);
    expect(entry.headers['content-type']).toMatch(/javascript/);
    expect(entry.headers['content-disposition']).toBeUndefined();
    await request('PUT', '/api/plugins/acme.demo', { enabled: false });
    expect((await request('GET', installed.json().entryUrl, undefined, '')).statusCode).toBe(404);
    expect((await request('HEAD', installed.json().entryUrl, undefined, '')).statusCode).toBe(404);
  });

  it('CORS 反射可信局域网/Capacitor 来源，公网和 null 来源不获得允许头；环境覆盖为精确列表', async () => {
    for (const origin of ['http://localhost:5311', 'http://192.168.1.20:5311', 'https://10.0.0.5', 'capacitor://localhost']) {
      const cors = await app.inject({ method: 'OPTIONS', url: '/api/children',
        headers: { origin, 'access-control-request-method': 'GET' } });
      expect(cors.statusCode, cors.body).toBe(204);
      expect(cors.headers['access-control-allow-origin']).toBe(origin);
    }
    for (const origin of ['https://untrusted.example', 'http://169.254.169.254', 'null']) {
      const cors = await app.inject({ url: '/api/health', headers: { origin } });
      expect(cors.headers['access-control-allow-origin']).toBeUndefined();
    }
    const expired = await app.inject({ url: '/api/children', headers: {
      origin: 'http://localhost:5311', authorization: `Bearer ${'a'.repeat(43)}`,
    } });
    expect(expired.statusCode).toBe(401);
    expect(expired.headers['access-control-allow-origin']).toBe('http://localhost:5311');
    const preview = (await request('POST', '/api/preview/token')).json().token;
    const previewPreflight = await app.inject({ method: 'OPTIONS', url: '/api/children', headers: {
      origin: 'http://localhost:5311', 'access-control-request-method': 'GET', authorization: `Bearer ${preview}`,
    } });
    expect(previewPreflight.statusCode).toBe(403);
    await app.close();
    app = await buildApp({ ...paths, reloadIntervalMs: 0, corsOrigins: ['https://trusted.example'] });
    const trusted = await app.inject({ url: '/api/health', headers: { origin: 'https://trusted.example' } });
    expect(trusted.headers['access-control-allow-origin']).toBe('https://trusted.example');
    expect((await app.inject({ url: '/api/health', headers: { origin: 'http://localhost:5311' } }))
      .headers['access-control-allow-origin']).toBeUndefined();
  });

  it('配对按实际 IP 限流，X-Forwarded-For 不能绕过，并清理已过期配对码', async () => {
    const first = (await request('POST', '/api/pair/start', {}, '')).json();
    withDb((db) => db.prepare('UPDATE pairings SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', first.pairingId));
    for (let i = 1; i < RESOURCE_LIMITS['pair-start'].capacity; i++) {
      expect((await app.inject({ method: 'POST', url: '/api/pair/start', payload: {},
        headers: { 'x-forwarded-for': `10.0.0.${i}` } })).statusCode).toBe(200);
    }
    const limited = await request('POST', '/api/pair/start', {}, '');
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(withDb((db) => db.prepare('SELECT id FROM pairings WHERE id = ?').get(first.pairingId))).toBeUndefined();
    expect((await app.inject({ method: 'POST', url: '/api/pair/start', payload: {}, remoteAddress: '10.0.0.99' })).statusCode).toBe(200);
  });

  it.each([
    ['/api/auth/login', 'password', false],
    ['/api/media', 'upload', true],
    ['/api/packs/import', 'import', true],
    ['/api/plugins/install', 'import', true],
    ['/api/plugins/remote', 'remote-plugin', true],
    ['/api/backup/restore', 'import', true],
    ['/api/tts', 'tts', true],
  ] as const)('高成本入口 %s 在解析/执行前限流', async (path, kind, admin) => {
    const capacity = RESOURCE_LIMITS[kind].capacity - (kind === 'password' ? 1 : 0);
    for (let i = 0; i < capacity; i++) {
      const invalid = await request('POST', path, {}, admin ? token : '');
      expect(invalid.statusCode, invalid.body).toBe(400);
    }
    const limited = await request('POST', path, {}, admin ? token : '');
    expect(limited.statusCode, limited.body).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('未认证上传在解析无效请求体之前拒绝，Swagger 描述新增接口与设备权限字段', async () => {
    const denied = await app.inject({ method: 'POST', url: '/api/media', payload: '{',
      headers: { 'content-type': 'application/json' } });
    expect(denied.statusCode).toBe(401);
    const docs = (await request('GET', '/api/docs/json', undefined, '')).json();
    expect(docs.paths['/api/preview/token'].post.responses['200']).toBeTruthy();
    expect(docs.paths['/api/devices/{id}'].put.requestBody.content['application/json'].schema
      .properties.allowedChildIds).toBeTruthy();
    expect(docs.paths['/api/pair/approve'].post.requestBody.content['application/json'].schema
      .properties.allowedChildIds).toBeTruthy();
  });

  it('小型高成本 JSON 入口拒绝巨量请求体，不影响下一次请求', async () => {
    const huge = await request('POST', '/api/auth/login', { password: 'x'.repeat(17 * 1024) }, '');
    expect(huge.statusCode).toBe(413);
    expect((await request('POST', '/api/auth/login', { password: 'security-test-password' }, '')).statusCode).toBe(200);
  });
});

it.each([1, 2])('v%s 数据库无损迁移到 v3，旧设备统一恢复默认全部孩子且只迁移一次', (version) => {
  const paths = fixture();
  let store: Store | undefined;
  try {
    store = new Store(paths.dataDir);
    const child = store.saveChild(ChildInput.parse({ name: '芽芽', birthday: '2024-01-01' }));
    const now = new Date().toISOString();
    store.putDevice({ id: 'bound', name: '客厅', kind: 'tv', childId: child.id, allowedChildIds: [child.id], createdAt: now, lastSeenAt: null });
    store.putDevice({ id: 'unbound', name: '平板', kind: 'tablet', childId: null, allowedChildIds: [], createdAt: now, lastSeenAt: null });
    store.putDevice({ id: 'all', name: '书房', kind: 'browser', childId: null, createdAt: now, lastSeenAt: null });
    expect(store.device('all').allowedChildIds).toBeNull();
    store.db.prepare('UPDATE devices SET token_hash = ? WHERE id = ?').run('existing-token-hash', 'bound');
    if (version === 1) {
      store.db.exec('DROP TABLE preview_tokens; ALTER TABLE devices DROP COLUMN allowed_child_ids_json; PRAGMA user_version = 1');
    } else {
      store.db.exec('PRAGMA user_version = 2');
    }
    store.close();
    store = undefined;
    store = new Store(paths.dataDir);
    expect(store.db.prepare('PRAGMA user_version').get()?.user_version).toBe(3);
    expect(store.device('bound')).toMatchObject({ childId: child.id, allowedChildIds: null });
    expect(store.device('unbound').allowedChildIds).toBeNull();
    expect(store.device('all').allowedChildIds).toBeNull();
    expect(store.db.prepare('SELECT token_hash FROM devices WHERE id = ?').get('bound')?.token_hash).toBe('existing-token-hash');
    expect(store.child(child.id).name).toBe('芽芽');
    store.db.prepare('UPDATE devices SET allowed_child_ids_json = ? WHERE id = ?').run(JSON.stringify([child.id]), 'bound');
    store.close();
    store = undefined;
    store = new Store(paths.dataDir);
    expect(store.device('bound').allowedChildIds).toEqual([child.id]);
  } finally {
    store?.close();
    rmSync(paths.directory, { recursive: true, force: true });
  }
});
