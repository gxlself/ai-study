import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../../../apps/server/src/app';
import type { ChildProfile, PackInfo, TodayPlan } from '@sprout/schema';

const pack = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const dataDir = await mkdtemp(path.join(pack, '.qa/.import-'));
let app: Awaited<ReturnType<typeof buildApp>> | undefined;

try {
  app = await buildApp({
    dataDir,
    contentDirs: [path.join(repo, 'content/packs/sprout-core')],
    playerDist: path.join(dataDir, 'no-player'),
    adminDist: path.join(dataDir, 'no-admin'),
    reloadIntervalMs: 0,
    logger: false,
  });
  const password = randomBytes(24).toString('hex');
  const setup = await app.inject({ method: 'POST', url: '/api/setup', payload: { password, familyName: '文化包验证' } });
  assert.equal(setup.statusCode, 200, setup.body);
  const authorization = `Bearer ${setup.json<{ token: string }>().token}`;
  const headers = { authorization };
  await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: { ttsProvider: 'none' } });
  const bytes = await readFile(path.join(repo, 'release/sprout.culture-1.0.0.zip'));
  const boundary = `sprout-${randomBytes(12).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sprout.culture-1.0.0.zip"\r\nContent-Type: application/zip\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const imported = await app.inject({
    method: 'POST', url: '/api/packs/import',
    headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body,
  });
  assert.equal(imported.statusCode, 201, imported.body);
  const info = imported.json<PackInfo & { issues: unknown[] }>();
  assert.equal(info.id, 'sprout.culture');
  assert.equal(info.lessonCount, 20);
  assert.equal(info.conceptCount, 7);
  assert.deepEqual(info.routeIds, []);
  assert.equal(info.source, 'installed');
  assert.equal(info.enabled, true);
  assert.deepEqual(info.issues, []);

  const report = await app.inject({ url: '/api/packs/sprout.culture/validate', headers });
  assert.equal(report.statusCode, 200);
  assert.deepEqual(report.json(), { issues: [] });
  const counts: Record<string, number> = {};
  for (const age of [6, 17, 18, 23, 24, 36]) {
    for (const audience of ['parent', 'child']) {
      const response: typeof imported = await app.inject({ url: `/api/lessons?packId=sprout.culture&age=${age}&audience=${audience}`, headers });
      assert.equal(response.statusCode, 200, response.body);
      const items = response.json<unknown[]>();
      assert.equal(items.length, audience === 'parent' ? 8 : age >= 24 ? 4 : 0);
      counts[`${age}-${audience}`] = items.length;
    }
  }
  const lantern = await app.inject({ url: '/packs/sprout.culture/assets/images/festivals/lantern.svg' });
  assert.equal(lantern.statusCode, 200);
  assert.match(lantern.headers['content-type'] ?? '', /image\/svg\+xml/);
  const detail = await app.inject({ url: '/api/lessons/culture.child.lantern-festival', headers });
  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.json<{ issues: unknown[] }>().issues, []);
  const audio = JSON.parse(await readFile(path.join(pack, 'audio/manifest.json'), 'utf8')) as { entries: Record<string, string> };
  for (const key of ['zh:灯笼', 'en:lantern', 'zh:新年好！', 'en:Happy New Year!']) {
    const response: typeof imported = await app.inject({ url: `/packs/sprout.culture/${audio.entries[key]}` });
    assert.equal(response.statusCode, 200, key);
    assert.ok(response.rawPayload.byteLength > 128);
  }

  const today = new Date();
  const born = new Date(today.getFullYear(), today.getMonth() - 30, 1);
  const birthday = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-01`;
  const created = await app.inject({
    method: 'POST', url: '/api/children', headers, payload: {
      name: '验证档案', birthday, screen: { mode: 'parent-only' },
      plan: { pinned: ['culture.parent-toddler.spring-festival', 'culture.child.spring-festival'] },
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const child = created.json<ChildProfile>();
  const planned = await app.inject({ url: `/api/children/${child.id}/today`, headers });
  assert.equal(planned.statusCode, 200, planned.body);
  const plan = planned.json<TodayPlan>();
  assert.ok(plan.items.some((item) => item.lessonId === 'culture.parent-toddler.spring-festival'));
  const optional = plan.items.find((item) => item.lessonId === 'culture.child.spring-festival');
  if (optional) assert.equal(optional.offlineOnly, true);
  assert.ok(plan.items.every((item) => item.lesson.audience === 'parent' || item.offlineOnly));
  assert.equal(plan.screen.mode, 'parent-only');
  const switched = await app.inject({
    method: 'PUT', url: `/api/children/${child.id}`, headers, payload: { screen: { mode: 'co-view' } },
  });
  assert.equal(switched.statusCode, 200, switched.body);
  const coView = await app.inject({ url: `/api/children/${child.id}/today`, headers });
  assert.equal(coView.statusCode, 200, coView.body);
  const childScreenItem = coView.json<TodayPlan>().items.find((item) => item.lessonId === 'culture.child.spring-festival');
  assert.ok(childScreenItem);
  assert.equal(childScreenItem.offlineOnly, undefined);
  console.log(JSON.stringify({
    imported: { id: info.id, lessonCount: info.lessonCount, conceptCount: info.conceptCount, routeIds: info.routeIds, issues: info.issues },
    ageFilters: counts,
    staticImagesAndAudio: 'passed',
    pinnedParentGuide: 'passed',
    parentOnlyNoChildScreen: 'passed',
    parentOnlyPinnedChild: optional ? 'offline-only' : 'not-scheduled (external-route pin limitation)',
    optionalCoView: 'passed',
  }, null, 2));
} finally {
  await app?.close();
  await rm(dataDir, { recursive: true, force: true });
}
