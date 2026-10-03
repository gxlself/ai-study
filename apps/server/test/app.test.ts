import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zipSync, strToU8 } from 'fflate';
import { buildApp } from '../src/app';
import { exampleLesson, parentLesson, fixture } from './app-fixture';
import { localDateString } from '@sprout/core';

function multipart(file: Uint8Array, name: string, mime = 'application/zip'): { payload: Buffer; headers: Record<string, string> } {
  const boundary = 'sprout-test-boundary';
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`),
      Buffer.from(file), Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('Sprout API 集成', () => {
  let app: FastifyInstance;
  let paths: ReturnType<typeof fixture>;
  let token: string;
  let childId: string;
  const request = (method: InjectOptions['method'], url: string, payload?: InjectOptions['payload'], auth = token) =>
    app.inject({ method, url, payload, headers: auth ? { authorization: `Bearer ${auth}` } : {} });
  const pairing = async (child = childId) => {
    const start = (await request('POST', '/api/pair/start', { kind: 'tv' }, '')).json();
    const device = (await request('POST', '/api/pair/approve', { code: start.code, childId: child })).json();
    const poll = (await request('GET', `/api/pair/${start.pairingId}`, undefined, '')).json();
    return { ...start, ...poll, device };
  };
  beforeEach(async () => {
    paths = fixture();
    app = await buildApp({
      ...paths, playerDist: join(paths.directory, 'no-player'), adminDist: join(paths.directory, 'no-admin'),
      reloadIntervalMs: 0,
    });
    const setup = await request('POST', '/api/setup', { password: 'family-test-password', child: { name: '芽芽', birthday: '2025-01-01' } }, '');
    expect(setup.statusCode, setup.body).toBe(200);
    token = setup.json().token;
    childId = (await request('GET', '/api/children')).json()[0].id;
    await request('PUT', '/api/settings', { ttsProvider: 'none' });
  });
  afterEach(async () => {
    await app?.close();
    if (paths) rmSync(paths.directory, { recursive: true, force: true });
  });

  it('初始化、登录、锁定、密码更改和退出；数据库不存明文密码或令牌', async () => {
    expect((await request('GET', '/api/setup/status', undefined, '')).json()).toEqual({ initialized: true });
    expect((await request('POST', '/api/setup', { password: 'another-password' }, '')).statusCode).toBe(409);
    const logged = await request('POST', '/api/auth/login', { password: 'family-test-password' }, '');
    expect(logged.statusCode).toBe(200);
    expect(Date.parse(logged.json().expiresAt)).toBeGreaterThan(Date.now());
    for (let i = 0; i < 5; i++) {
      const result = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'wrong' }, remoteAddress: '10.0.0.2' });
      expect(result.statusCode).toBe(i === 4 ? 429 : 401);
    }
    const locked = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'family-test-password' }, remoteAddress: '10.0.0.2' });
    expect(locked.statusCode).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
    expect((await request('POST', '/api/auth/password', { oldPassword: 'family-test-password', newPassword: 'new-test-password' })).statusCode).toBe(200);
    expect((await request('GET', '/api/auth/me', undefined, logged.json().token)).statusCode).toBe(401);
    const db = new DatabaseSync(join(paths.dataDir, 'sprout.db'));
    const data = JSON.stringify(db.prepare('SELECT * FROM settings').all()) + JSON.stringify(db.prepare('SELECT * FROM admin_tokens').all());
    db.close();
    expect(data).not.toContain('new-test-password');
    expect(data).not.toContain(token);
    expect((await request('POST', '/api/auth/logout')).statusCode).toBe(200);
    expect((await request('GET', '/api/auth/me')).statusCode).toBe(401);
  }, 120_000);

  it('孩子 CRUD、深合并、日期与时段校验', async () => {
    const create = await request('POST', '/api/children', { name: '豆豆', birthday: '2024-08-15' });
    expect(create.statusCode).toBe(201);
    const id = create.json().id;
    expect(create.json().screen.windows).toEqual([{ start: '08:00', end: '18:30' }]);
    await request('PUT', `/api/children/${id}`, { languageMode: 'en', showPinyin: true, screen: { mode: 'parent-only' } });
    await request('PUT', `/api/children/${id}`, { screen: { dailyMaxMin: 12 }, plan: { pinned: ['core.sample'] } });
    const update = await request('PUT', `/api/children/${id}`, { screen: { distanceReminder: false }, plan: { themeId: 'core.theme' } });
    expect(update.json().screen).toMatchObject({ dailyMaxMin: 12, distanceReminder: false, sessionMaxMin: null });
    expect(update.json().plan).toMatchObject({ pinned: ['core.sample'], themeId: 'core.theme' });
    expect(update.json()).toMatchObject({ languageMode: 'en', showPinyin: true, screen: { mode: 'parent-only' } });
    expect((await request('PUT', `/api/children/${id}`, { screen: { windows: [{ start: '29:00', end: '12:00' }] } })).statusCode).toBe(400);
    expect((await request('POST', '/api/children', { name: '测试', birthday: '2025-02-30' })).statusCode).toBe(400);
    expect((await request('DELETE', `/api/children/${id}`)).statusCode).toBe(200);
    expect((await request('GET', `/api/children/${id}`)).statusCode).toBe(404);
  });

  it('配对完整流程、仅一次令牌、权限隔离、切换孩子及吊销', async () => {
    const start = (await request('POST', '/api/pair/start', { kind: 'tv' }, '')).json();
    expect(start.code).toMatch(/^\d{6}$/);
    expect((await request('GET', `/api/pair/${start.pairingId}`, undefined, '')).json()).toEqual({ status: 'pending' });
    const device = await request('POST', '/api/pair/approve', { code: start.code, childId, name: '客厅' });
    expect(device.statusCode).toBe(200);
    expect(device.json().allowedChildIds).toBeNull();
    const poll = (await request('GET', `/api/pair/${start.pairingId}`, undefined, '')).json();
    expect(poll.deviceToken).toBeTypeOf('string');
    expect((await request('GET', `/api/pair/${start.pairingId}`, undefined, '')).json().deviceToken).toBeUndefined();
    expect((await request('POST', '/api/pair/approve', { code: start.code, childId })).statusCode).toBe(409);
    const bootstrap = await request('GET', '/api/device/bootstrap', undefined, poll.deviceToken);
    expect(bootstrap.json().child.id).toBe(childId);
    expect(bootstrap.json().device.lastSeenAt).toBeTruthy();
    expect((await request('GET', '/api/children', undefined, poll.deviceToken)).statusCode).toBe(403);
    const child2 = (await request('POST', '/api/children', { name: '豆豆', birthday: '2024-07-01' })).json().id;
    expect((await request('GET', `/api/children/${child2}`, undefined, poll.deviceToken)).statusCode).toBe(403);
    expect((await request('PUT', '/api/device/child', { childId: child2 }, poll.deviceToken)).statusCode).toBe(200);
    expect((await request('GET', `/api/children/${child2}`, undefined, poll.deviceToken)).statusCode).toBe(200);
    await request('DELETE', `/api/devices/${device.json().id}`);
    expect((await request('GET', '/api/device/bootstrap', undefined, poll.deviceToken)).statusCode).toBe(401);
  });

  it('过期配对返回 expired，不能批准', async () => {
    const start = (await request('POST', '/api/pair/start', {}, '')).json();
    const db = new DatabaseSync(join(paths.dataDir, 'sprout.db'));
    db.prepare('UPDATE pairings SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', start.pairingId);
    db.close();
    expect((await request('GET', `/api/pair/${start.pairingId}`, undefined, '')).json().status).toBe('expired');
    expect((await request('POST', '/api/pair/approve', { code: start.code })).statusCode).toBe(410);
  });

  it('今日计划、记录去重、时长累计、统计和级联删除', async () => {
    const paired = await pairing();
    const now = new Date().toISOString();
    const input = {
      childId, lessonId: 'core.sample', startedAt: new Date(Date.parse(now) - 600_000).toISOString(), endedAt: now,
      durationSec: 600, completed: true, stepsCompleted: 1, stepsTotal: 1, clientId: 'offline-session-1',
    };
    const first = await request('POST', '/api/sessions', input, paired.deviceToken);
    const second = await request('POST', '/api/sessions', input, paired.deviceToken);
    expect(first.statusCode, first.body).toBe(201);
    expect(second.json().id).toBe(first.json().id);
    expect((await request('GET', `/api/sessions?childId=${childId}`)).json()).toHaveLength(1);
    const today = await request('GET', `/api/children/${childId}/today`);
    expect(today.statusCode, today.body).toBe(200);
    expect(today.json().items[0].lessonId).toBe('core.sample');
    expect(today.json().screen).toMatchObject({ usedSec: 600, allowedNow: false, reason: 'daily-limit' });
    const stats = (await request('GET', `/api/children/${childId}/stats?days=7`)).json();
    expect(stats.totalSec).toBe(600);
    expect(stats.domains.cognition).toBe(600);
    expect(stats.days).toHaveLength(7);
    const date = localDateString(new Date());
    expect((await request('GET', `/api/sessions?from=${date}&to=${date}`)).json()).toHaveLength(1);
    await request('DELETE', `/api/children/${childId}`);
    expect((await request('GET', '/api/sessions')).json()).toEqual([]);
    expect((await request('GET', '/api/devices')).json()[0].childId).toBeNull();
  });

  it('家长课筛选、guide、printables 与新校验规则', async () => {
    const created = await request('POST', '/api/lessons', { ...parentLesson, id: 'guide' });
    expect(created.statusCode, created.body).toBe(201);
    const parents = await request('GET', '/api/lessons?audience=parent');
    expect(parents.json()).toHaveLength(1);
    expect(parents.json()[0]).toMatchObject({ audience: 'parent', hasPrintables: true });
    expect((await request('GET', '/api/lessons?audience=child')).json().every((lesson: { audience: string }) => lesson.audience === 'child')).toBe(true);
    expect((await request('GET', '/api/lessons?audience=invalid')).statusCode).toBe(400);
    expect((await request('POST', '/api/lessons', { ...exampleLesson, id: 'too-young', ageRange: [17, 30] })).statusCode).toBe(400);
    expect((await request('POST', '/api/lessons', { ...exampleLesson, id: 'parent-screen', audience: 'parent' })).statusCode).toBe(400);
    const invalidPrintable = await request('POST', '/api/lessons', { ...parentLesson, id: 'missing-print', printables: [{ kind: 'cards', title: '卡片', items: ['missing'] }] });
    expect(invalidPrintable.statusCode).toBe(400);
    expect(invalidPrintable.json().issues.some((issue: { path: string }) => issue.path.startsWith('printables'))).toBe(true);
    expect((await request('GET', '/api/plugins')).json()[0].activities.some((activity: { type: string }) => activity.type === 'guide')).toBe(true);
    const duplicated = await request('POST', '/api/lessons/custom.guide/duplicate');
    expect(duplicated.statusCode, duplicated.body).toBe(201);
    expect(duplicated.json()).toMatchObject({ audience: 'parent', offline: parentLesson.offline });
    expect(duplicated.json().printables).toHaveLength(1);
  });

  it('家长课不计孩子屏幕秒数，旧记录回退课程 audience，停用包不改变历史计时', async () => {
    const parent = (await request('POST', '/api/lessons', { ...parentLesson, id: 'counter' })).json();
    const now = new Date().toISOString();
    const input = { childId, startedAt: new Date(Date.parse(now) - 900_000).toISOString(), endedAt: now,
      completed: true, stepsCompleted: 1, stepsTotal: 1 };
    const inferred = await request('POST', '/api/sessions', { ...input, lessonId: parent.id, durationSec: 600, clientId: 'parent-inferred' });
    expect(inferred.json().audience).toBe('parent');
    await request('POST', '/api/sessions', { ...input, lessonId: 'old-removed-parent', durationSec: 900, audience: 'parent' });
    const childRecord = await request('POST', '/api/sessions', { ...input, lessonId: 'core.sample', durationSec: 60 });
    expect(childRecord.json().audience).toBe('child');
    const db = new DatabaseSync(join(paths.dataDir, 'sprout.db'));
    const { audience: _, ...legacy } = inferred.json<Record<string, unknown>>();
    db.prepare('UPDATE sessions SET data = ? WHERE id = ?').run(JSON.stringify(legacy), legacy.id as string);
    db.close();
    await request('PUT', '/api/packs/sprout.custom', { enabled: false });
    expect((await request('GET', `/api/children/${childId}/screen`)).json().usedSec).toBe(60);
    const today = (await request('GET', `/api/children/${childId}/today`)).json();
    expect(today.screen.usedSec).toBe(60);
    const stats = (await request('GET', `/api/children/${childId}/stats?days=1`)).json();
    expect(stats.totalSec).toBe(60);
    expect(stats.days[0]).toMatchObject({ screenSec: 60, lessons: 3, completed: 3 });
    const backup = (await request('GET', '/api/backup')).json();
    expect(backup.sessions.find((session: { id: string }) => session.id === childRecord.json().id).audience).toBe('child');
  });

  it('服务端计划和 screen 使用实际模式及年龄上限，已用满仍保留家长指引', async () => {
    const parent = (await request('POST', '/api/lessons', { ...parentLesson, id: 'plan-parent' })).json();
    const routePath = join(paths.packDir, 'routes/core.json');
    const sourceRoute = JSON.parse(readFileSync(routePath, 'utf8'));
    sourceRoute.stages[0].screen.childScreen = 'optional';
    sourceRoute.stages[0].themes[0].lessons.push(parent.id);
    writeFileSync(routePath, JSON.stringify(sourceRoute));
    await request('POST', '/api/packs/reload');
    const birthday = (months: number) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - months);
      return localDateString(date);
    };
    await request('PUT', `/api/children/${childId}`, {
      birthday: birthday(17), screen: { mode: 'co-view', sessionMaxMin: 30, dailyMaxMin: 1, windows: [] },
      plan: { pinned: ['core.sample', parent.id] },
    });
    const young = (await request('GET', `/api/children/${childId}/today`)).json();
    expect(young.screen.mode).toBe('parent-only');
    expect(young.items.map((item: { lessonId: string }) => item.lessonId)).toEqual([parent.id]);
    await request('PUT', `/api/children/${childId}`, { birthday: birthday(20), screen: { mode: 'auto', dailyMaxMin: 10 } });
    expect((await request('GET', `/api/children/${childId}/screen`)).json().mode).toBe('parent-only');
    await request('PUT', `/api/children/${childId}`, { screen: { mode: 'co-view' } });
    const allowed = (await request('GET', `/api/children/${childId}/today`)).json();
    expect(allowed.screen).toMatchObject({ mode: 'co-view', sessionMaxSec: 480, coView: 'required' });
    expect(allowed.items.some((item: { lessonId: string }) => item.lessonId === 'core.sample')).toBe(true);
    await request('PUT', `/api/children/${childId}`, { birthday: birthday(24) });
    expect((await request('GET', `/api/children/${childId}/screen`)).json().sessionMaxSec).toBe(1200);
    const now = new Date().toISOString();
    await request('POST', '/api/sessions', { childId, lessonId: 'core.sample',
      startedAt: new Date(Date.parse(now) - 600_000).toISOString(), endedAt: now,
      durationSec: 600, completed: true, stepsCompleted: 1, stepsTotal: 1 });
    const full = (await request('GET', `/api/children/${childId}/today`)).json();
    expect(full.screen).toMatchObject({ allowedNow: false, reason: 'daily-limit' });
    expect(full.items.some((item: { lessonId: string }) => item.lessonId === parent.id)).toBe(true);
  });

  it('自定义课 CRUD、引用校验、复制与词库 CRUD', async () => {
    const invalid = await request('POST', '/api/lessons', { ...exampleLesson, steps: [{ type: 'word-cards', props: { items: ['missing'] } }] });
    expect(invalid.statusCode, invalid.body).toBe(400);
    expect(invalid.json().issues.some((issue: { level: string }) => issue.level === 'error')).toBe(true);
    const created = await request('POST', '/api/lessons', { ...exampleLesson, id: 'my-circle' });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    expect(id).toMatch(/^custom\./);
    const createdLesson = created.json() as Record<string, unknown>;
    expect((await request('PUT', `/api/lessons/${id}`, { ...createdLesson, title: { zh: '新圆圆' } })).statusCode).toBe(200);
    expect((await request('GET', `/api/lessons/${id}`)).json().lesson.title.zh).toBe('新圆圆');
    const copied = await request('POST', '/api/lessons/core.sample/duplicate');
    expect(copied.statusCode, copied.body).toBe(201);
    expect(copied.json().id).toMatch(/^custom\./);
    expect((await request('DELETE', '/api/lessons/core.sample')).statusCode).toBe(403);
    expect((await request('DELETE', `/api/lessons/${id}`)).statusCode).toBe(200);
    const concept = { id: 'square', category: 'shapes', zh: '方形', en: 'square', image: 'assets/square.svg' };
    expect((await request('POST', '/api/lexicon', concept)).statusCode).toBe(201);
    expect((await request('PUT', '/api/lexicon/square', { ...concept, zh: '正方形' })).statusCode).toBe(200);
    expect((await request('GET', '/api/lexicon?q=正方形')).json()[0].imageUrl).toMatch(/^\/packs\/sprout.custom\//);
    expect((await request('DELETE', '/api/lexicon/square')).statusCode).toBe(200);
  });

  it('内容包 ZIP 导入、同版本覆盖、拒绝降级、启停、校验、导出和删除', async () => {
    const zip = (version: string, bad = false) => zipSync({
      'example/pack.json': strToU8(JSON.stringify({ schemaVersion: 1, id: 'example.pack', version, name: { zh: '测试包' }, ageRange: [6, 36] })),
      'example/lessons/one.json': strToU8(JSON.stringify({ ...exampleLesson, id: 'example.lesson',
        ...(bad ? { steps: [{ type: 'choose', props: {} }] } : {}) })),
    });
    const imported = await app.inject({ method: 'POST', url: '/api/packs/import', ...multipart(zip('1.0.0'), 'pack.zip'),
      headers: { ...multipart(zip('1.0.0'), 'pack.zip').headers, authorization: `Bearer ${token}` } });
    expect(imported.statusCode, imported.body).toBe(201);
    expect(imported.json().lessonCount).toBe(1);
    const same = multipart(zip('1.0.0'), 'same.zip');
    expect((await app.inject({ method: 'POST', url: '/api/packs/import', ...same, headers: { ...same.headers, authorization: `Bearer ${token}` } })).statusCode).toBe(201);
    const lower = multipart(zip('0.9.0'), 'lower.zip');
    expect((await app.inject({ method: 'POST', url: '/api/packs/import', ...lower, headers: { ...lower.headers, authorization: `Bearer ${token}` } })).statusCode).toBe(409);
    const bad = multipart(zip('2.0.0', true), 'bad.zip');
    expect((await app.inject({ method: 'POST', url: '/api/packs/import', ...bad, headers: { ...bad.headers, authorization: `Bearer ${token}` } })).statusCode).toBe(400);
    expect((await request('GET', '/api/lessons/example.lesson')).statusCode).toBe(200);
    await request('PUT', '/api/packs/example.pack', { enabled: false });
    expect((await request('GET', '/api/lessons/example.lesson')).statusCode).toBe(404);
    await request('PUT', '/api/packs/example.pack', { enabled: true });
    expect((await request('GET', '/api/packs/example.pack/export')).headers['content-type']).toContain('application/zip');
    expect((await request('GET', '/api/packs/example.pack/validate')).json().issues).toBeInstanceOf(Array);
    expect((await request('DELETE', '/api/packs/example.pack')).statusCode).toBe(200);
    expect((await request('DELETE', '/api/packs/sprout.core')).statusCode).toBe(403);
  });

  it('插件安装、props 校验、启停与删除', async () => {
    expect((await request('GET', '/api/plugins')).json()[0]).toMatchObject({ id: 'sprout.builtin', source: 'builtin' });
    expect((await request('GET', '/api/plugins')).json()[0].activities).toHaveLength(17);
    const zip = zipSync({
      'plugin.json': strToU8(JSON.stringify({
        schemaVersion: 1, id: 'example.plugin', version: '1.0.0', name: { zh: '示例' }, sdk: '^1.0.0', entry: 'index.js',
        activities: [{ type: 'example.shape', name: { zh: '形状' }, propsSchema: {
          type: 'object', required: ['label'], properties: { label: { type: 'string' } },
        } }],
      })),
      'index.js': strToU8('export default []'),
    });
    const file = multipart(zip, 'plugin.zip');
    const installed = await app.inject({ method: 'POST', url: '/api/plugins/install', ...file, headers: { ...file.headers, authorization: `Bearer ${token}` } });
    expect(installed.statusCode, installed.body).toBe(201);
    expect(installed.json().entryUrl).toBe('/plugins/example.plugin/index.js');
    const bad = await request('POST', '/api/lessons', { ...exampleLesson, id: 'bad-plugin', steps: [{ type: 'example.shape', props: {} }] });
    expect(bad.statusCode, bad.body).toBe(400);
    expect((await request('GET', '/plugins/example.plugin/index.js', undefined, '')).statusCode).toBe(200);
    expect((await request('PUT', '/api/plugins/example.plugin', { enabled: false })).json().enabled).toBe(false);
    expect((await request('DELETE', '/api/plugins/example.plugin')).statusCode).toBe(200);
    expect((await request('DELETE', '/api/plugins/sprout.builtin')).statusCode).toBe(403);
  });

  it('静态 SVG/ETag/CORS、缺少 dist 提示、未知 API、路径和符号链接防护', async () => {
    const svg = await request('GET', '/packs/sprout.core/assets/circle.svg', undefined, '');
    expect(svg.statusCode).toBe(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.headers.etag).toBeTruthy();
    expect(svg.headers['cache-control']).toContain('max-age');
    const cached = await app.inject({ url: '/packs/sprout.core/assets/circle.svg', headers: { 'if-none-match': String(svg.headers.etag) } });
    expect(cached.statusCode).toBe(304);
    const cors = await app.inject({ method: 'OPTIONS', url: '/api/children', headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'GET' } });
    expect(cors.statusCode).toBe(204);
    expect(cors.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    expect((await request('GET', '/', undefined, '')).body).toContain('播放端尚未构建');
    expect((await request('GET', '/admin/', undefined, '')).body).toContain('管理端尚未构建');
    expect((await request('GET', '/api/not-real', undefined, '')).statusCode).toBe(404);
    for (const path of ['/packs/sprout.core/%2e%2e/sprout.db', '/packs/sprout.core/%252e%252e/sprout.db', '/packs/sprout.core/assets%5c..%5csecret']) {
      const result = await request('GET', path, undefined, '');
      expect([400, 403, 404], result.body).toContain(result.statusCode);
      expect(result.body).not.toContain('SQLite');
    }
    writeFileSync(join(paths.directory, 'private.txt'), 'PRIVATE_SENTINEL');
    symlinkSync(join(paths.directory, 'private.txt'), join(paths.packDir, 'assets', 'escape.txt'));
    const outside = await request('GET', '/packs/sprout.core/assets/escape.txt', undefined, '');
    expect(outside.statusCode).toBe(403);
    expect(outside.body).not.toContain('PRIVATE_SENTINEL');
  });

  it('SVG 上传拒绝主动内容，合法图片可访问，拒绝 ZIP 路径穿越', async () => {
    const evil = multipart(strToU8('<svg><script>alert(1)</script></svg>'), 'evil.svg', 'image/svg+xml');
    expect((await app.inject({ method: 'POST', url: '/api/media', ...evil, headers: { ...evil.headers, authorization: `Bearer ${token}` } })).statusCode).toBe(400);
    const good = multipart(strToU8('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>'), 'safe.svg', 'image/svg+xml');
    const media = await app.inject({ method: 'POST', url: '/api/media', ...good, headers: { ...good.headers, authorization: `Bearer ${token}` } });
    expect(media.statusCode, media.body).toBe(201);
    expect((await request('GET', media.json().url, undefined, '')).statusCode).toBe(200);
    const zip = multipart(zipSync({ '../escaped.txt': strToU8('UNSAFE') }), 'escape.zip');
    const result = await app.inject({ method: 'POST', url: '/api/packs/import', ...zip, headers: { ...zip.headers, authorization: `Bearer ${token}` } });
    expect([400, 403]).toContain(result.statusCode);
  });

  it('备份恢复、坏备份不覆盖、令牌不外泄、设置深合并、里程碑', async () => {
    const paired = await pairing();
    await request('POST', '/api/lessons', { ...exampleLesson, id: 'backup' });
    await request('PUT', `/api/children/${childId}/milestones/test-item`, { status: 'emerging', observedAt: '2026-01-01' });
    expect((await request('GET', `/api/children/${childId}/milestones`)).json().observations).toHaveLength(1);
    await request('PUT', '/api/settings', { ttsVoices: { zh: 'Tingting' } });
    expect((await request('GET', '/api/settings')).json().ttsVoices).toEqual({ zh: 'Tingting', en: '' });
    const backupResponse = await request('GET', '/api/backup');
    expect(backupResponse.body).not.toContain(token);
    expect(backupResponse.body).not.toContain(paired.deviceToken);
    expect(backupResponse.body).not.toContain('family-test-password');
    const backup = backupResponse.json();
    expect((await request('POST', '/api/backup/restore', { ...backup, children: [] })).statusCode).toBe(400);
    expect((await request('GET', '/api/children')).json()).toHaveLength(1);
    await request('POST', '/api/children', { name: '另一个', birthday: '2025-05-01' });
    const restored = await request('POST', '/api/backup/restore', backup);
    expect(restored.statusCode, restored.body).toBe(200);
    expect((await request('GET', '/api/children')).json()).toHaveLength(1);
    expect((await request('GET', '/api/device/bootstrap', undefined, paired.deviceToken)).statusCode).toBe(401);
    expect((await request('GET', '/api/lessons/custom.backup')).statusCode).toBe(200);
    expect((await request('GET', '/api/tts/status')).json().available).toBe(false);
    expect((await request('POST', '/api/tts', { lang: 'zh', text: '你好' })).statusCode).toBe(503);
    await request('DELETE', `/api/children/${childId}/milestones/test-item`);
    expect((await request('GET', `/api/children/${childId}/milestones`)).json().observations).toHaveLength(0);
  });

  it('Swagger 与 schemas 公开可访问并包含全部接口', async () => {
    expect((await request('GET', '/api/health', undefined, '')).json().ok).toBe(true);
    const schemas = (await request('GET', '/api/schemas', undefined, '')).json();
    expect(schemas.lesson).toBeTruthy();
    expect(schemas['activity.count']).toBeTruthy();
    const docs = await request('GET', '/api/docs/', undefined, '');
    expect(docs.statusCode, docs.body).toBe(200);
    const spec = (await request('GET', '/api/docs/json', undefined, '')).json();
    expect(spec.paths['/api/backup/restore']).toBeTruthy();
    expect(spec.paths['/api/children/{id}/today']).toBeTruthy();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(35);
    expect(spec.paths['/api/setup'].post.requestBody.content['application/json'].schema.properties.password.minLength).toBe(6);
    expect(spec.paths['/api/lessons'].get.parameters.some((parameter: { name: string }) => parameter.name === 'audience')).toBe(true);
    expect(spec.paths['/api/media'].post.requestBody.content['multipart/form-data']).toBeTruthy();
  });

  it('重启持久化数据与包启停；SPA 路由回退', async () => {
    await request('PUT', '/api/packs/sprout.core', { enabled: false });
    await app.close();
    const dist = join(paths.directory, 'player');
    mkdirSync(dist);
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>SPROUT_APP</title>');
    writeFileSync(join(dist, 'favicon.png'), Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'));
    app = await buildApp({ ...paths, playerDist: dist, adminDist: dist, reloadIntervalMs: 0 });
    expect((await request('GET', '/api/children')).json()[0].id).toBe(childId);
    expect((await request('GET', '/api/packs')).json().find((p: { id: string }) => p.id === 'sprout.core').enabled).toBe(false);
    expect((await request('GET', '/settings/profile', undefined, '')).body).toContain('SPROUT_APP');
    expect((await request('GET', '/missing.js', undefined, '')).statusCode).toBe(404);
    for (const path of ['/admin/print/lesson/core.s3.find-animal', '/admin/print/theme/example.theme']) {
      const print = await request('GET', path, undefined, '');
      expect(print.statusCode).toBe(200);
      expect(print.headers['content-type']).toContain('text/html');
      expect(print.body).toContain('SPROUT_APP');
    }
    expect((await request('GET', '/admin/assets/missing.js', undefined, '')).statusCode).toBe(404);
    const favicon = await request('GET', '/favicon.ico', undefined, '');
    expect(favicon.statusCode).toBe(200);
    expect(favicon.headers['content-type']).toContain('image/png');
    expect(readFileSync(join(paths.dataDir, 'custom', 'pack.json'), 'utf8')).toContain('sprout.custom');
  });
});
