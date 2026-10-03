import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../../../apps/server/src/app.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const coreRoot = fileURLToPath(new URL('../../sprout-core/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const output = path.join(root, '.qa');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(output, 'import-'));
let app;
const result = { imported: false, dataRemoved: false, appClosed: false };

try {
  app = await buildApp({
    dataDir,
    contentDirs: [coreRoot],
    reloadIntervalMs: 0,
    logger: false,
    playerDist: path.join(dataDir, 'no-player'),
    adminDist: path.join(dataDir, 'no-admin'),
  });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { password: randomUUID() },
  });
  assert.equal(setup.statusCode, 200, '临时家庭初始化失败');
  const token = setup.json().token;
  assert.ok(token, '临时管理员令牌缺失');
  const headers = { authorization: `Bearer ${token}` };
  const request = async (url, method = 'GET', payload) => {
    const response = await app.inject({ url, method, payload, headers });
    assert.ok(response.statusCode >= 200 && response.statusCode < 300, `${method} ${url} 返回 ${response.statusCode}`);
    return response.json();
  };

  const boundary = `sprout-english-${randomUUID()}`;
  const bytes = await readFile(path.join(repoRoot, 'release/sprout.english-1.0.0.zip'));
  const imported = await app.inject({
    method: 'POST',
    url: '/api/packs/import',
    headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sprout.english-1.0.0.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  assert.equal(imported.statusCode, 201, 'ZIP 导入失败');
  const pack = imported.json();
  assert.equal(pack.id, 'sprout.english');
  assert.equal(pack.source, 'installed');
  assert.equal(pack.lessonCount, 12);
  assert.equal(pack.conceptCount, 1);
  assert.equal(pack.enabled, true);
  assert.deepEqual(pack.routeIds, []);
  assert.deepEqual((pack.issues ?? []).filter((issue) => issue.level === 'error'), []);
  result.imported = true;
  result.importIssues = pack.issues ?? [];

  const parents = await request('/api/lessons?packId=sprout.english&audience=parent');
  const children = await request('/api/lessons?packId=sprout.english&audience=child');
  assert.equal(parents.length, 9);
  assert.equal(children.length, 3);
  assert.deepEqual(await request('/api/lessons?packId=sprout.english&audience=child&age=23'), []);
  assert.equal((await request('/api/lessons?packId=sprout.english&audience=child&age=24')).length, 3);
  assert.equal((await request('/api/lessons?packId=sprout.english&audience=parent&age=6')).length, 3);
  assert.ok(!(await request('/api/routes')).some((route) => route.packId === 'sprout.english'));
  result.parentLessons = parents.length;
  result.childLessons = children.length;

  for (const summary of [...parents, ...children]) {
    const detail = await request(`/api/lessons/${summary.id}`);
    assert.equal(detail.packId, 'sprout.english');
    assert.deepEqual(detail.issues.filter((issue) => issue.level === 'error'), []);
  }
  for (const url of [
    '/packs/sprout.english/assets/images/everyday-english.svg',
    '/packs/sprout.english/assets/images/actions/stand-up.svg',
    '/packs/sprout.core/assets/images/home/cup.svg',
  ]) {
    const response = await app.inject({ url });
    assert.equal(response.statusCode, 200, `素材无法访问：${url}`);
    assert.match(response.headers['content-type'] ?? '', /image\/svg\+xml/);
    assert.ok(response.body.includes('<svg'));
  }
  const audio = await request('/packs/sprout.english/audio/manifest.json');
  assert.equal(Object.keys(audio.entries).length, 121);
  const sample = await app.inject({ url: `/packs/sprout.english/${Object.values(audio.entries)[0]}` });
  assert.equal(sample.statusCode, 200);
  assert.equal(sample.rawPayload.toString('ascii', 4, 8), 'ftyp');
  result.audioEntries = Object.keys(audio.entries).length;

  const now = new Date();
  const birthday = `${now.getFullYear() - 2}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const child = await request('/api/children', 'POST', {
    name: '英语包临时验收',
    birthday,
    screen: { mode: 'parent-only' },
  });
  const saved = await request(`/api/children/${child.id}`, 'PUT', {
    plan: { pinned: ['english.parent.action-game'] },
  });
  assert.ok(saved.plan.pinned.includes('english.parent.action-game'));
  const plan = await request(`/api/children/${child.id}/today`);
  assert.ok(plan.items.some((item) => item.lessonId === 'english.parent.action-game' && item.reason === 'pinned'));
  assert.equal(plan.screen.mode, 'parent-only');
  result.pinnedParentLesson = 'english.parent.action-game';
} finally {
  try {
    if (app) {
      await app.close();
      result.appClosed = true;
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    result.dataRemoved = true;
    await writeFile(path.join(output, 'import-check.json'), `${JSON.stringify(result, null, 2)}\n`);
  }
}
assert.ok(result.appClosed && result.dataRemoved);
console.log('API 导入：201，12 节课、1 个新词条、0 条路线；9 家长课与 3 共看课可浏览。');
console.log('年龄筛选、置顶家长课、核心素材与本包素材、121 条音频清单均通过。');
console.log('进程内应用已关闭，临时数据库和导入副本已删除，没有监听端口。');
