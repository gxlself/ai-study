import { spawn, execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const run = promisify(execFile);
const dataDir = await mkdtemp(join(tmpdir(), 'sprout-smoke-'));
let server;
try {
  let port;
  for (const candidate of [4410, 4510, 4610]) {
    const probe = createServer();
    const free = await new Promise((resolve) => {
      probe.once('error', () => resolve(false));
      probe.listen(candidate, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) { port = candidate; break; }
  }
  if (!port) throw new Error('验收备用端口均被占用');
  const env = {
    ...process.env, PORT: String(port), HOST: '127.0.0.1', SPROUT_DATA_DIR: dataDir,
    SPROUT_CONTENT_DIRS: join(dataDir, 'no-source-packs'),
  };
  delete env.SPROUT_CORS_ORIGINS;
  server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: new URL('../../..', import.meta.url),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (data) => { output += data; });
  server.stderr.on('data', (data) => { output += data; });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`服务启动失败：${output}`);
    try {
      const { stdout } = await run('curl', ['-fsS', '--max-time', '3', `http://127.0.0.1:${port}/api/health`]);
      if (JSON.parse(stdout).ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`服务未就绪：${output}`);
  for (const path of ['/api/health', '/api/schemas', '/api/docs', '/api/docs/json']) {
    const { stdout } = await run('curl', ['-fsSL', '--max-time', '15', '-w', '\nHTTP_STATUS:%{http_code}', `http://127.0.0.1:${port}${path}`]);
    if (!stdout.endsWith('HTTP_STATUS:200')) throw new Error(`${path} 请求失败`);
    if (path === '/api/health' && !JSON.parse(stdout.split('\nHTTP_STATUS:')[0]).ok) throw new Error('health 无效');
    if (path === '/api/schemas' && !JSON.parse(stdout.split('\nHTTP_STATUS:')[0])['activity.guide']) throw new Error('缺少 guide schema');
    console.log(`${path}: HTTP 200, ${stdout.length} bytes`);
  }
  const base = `http://127.0.0.1:${port}`;
  const api = async (method, path, body, token, headers = {}) => {
    const response = await fetch(`${base}${path}`, {
      method, signal: AbortSignal.timeout(15_000),
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const setup = await api('POST', '/api/setup', {
    password: 'temporary-smoke-password', child: { name: '测试孩子', birthday: '2024-01-01' },
  });
  assert.equal(setup.status, 200);
  const admin = setup.data.token;
  const children = await api('GET', '/api/children', undefined, admin);
  const childId = children.data[0].id;
  const other = await api('POST', '/api/children', { name: '另一个测试孩子', birthday: '2024-02-01' }, admin);
  assert.equal(other.status, 201);
  const start = await api('POST', '/api/pair/start', {});
  const approved = await api('POST', '/api/pair/approve', { code: start.data.code, childId }, admin);
  assert.equal(approved.status, 200);
  assert.equal(approved.data.allowedChildIds, null);
  const paired = await api('GET', `/api/pair/${start.data.pairingId}`);
  const device = paired.data.deviceToken;
  const bootstrap = await api('GET', '/api/device/bootstrap', undefined, device);
  assert.deepEqual(bootstrap.data.children.map((child) => child.id), [childId, other.data.id]);
  assert.equal((await api('PUT', '/api/device/child', { childId: other.data.id }, device)).status, 200);
  assert.equal((await api('PUT', `/api/devices/${approved.data.id}`, { name: '临时电视' }, admin)).data.allowedChildIds, null);
  assert.equal((await api('PUT', `/api/devices/${approved.data.id}`, { allowedChildIds: [childId] }, admin)).status, 200);
  assert.equal((await api('PUT', '/api/device/child', { childId: other.data.id }, device)).status, 403);
  assert.equal((await api('PUT', `/api/devices/${approved.data.id}`,
    { allowedChildIds: [childId, other.data.id] }, admin)).status, 200);
  assert.equal((await api('PUT', '/api/device/child', { childId: other.data.id }, device)).status, 200);
  const now = new Date().toISOString();
  const session = await api('POST', '/api/sessions', {
    childId: other.data.id, lessonId: 'smoke.legacy', startedAt: now, endedAt: now, durationSec: 7200,
    completed: false, stepsCompleted: 0, stepsTotal: 1, clientId: 'compiled-smoke',
  }, device);
  assert.equal(session.status, 201);
  assert.equal(session.data.durationSec, 5);
  assert.equal(session.data.events.at(-1).type, 'server:duration-clamped');
  const preview = await api('POST', '/api/preview/token', undefined, admin);
  assert.equal(preview.status, 200);
  assert.equal((await api('GET', '/api/packs', undefined, preview.data.token)).status, 200);
  assert.equal((await api('GET', '/api/schemas', undefined, preview.data.token)).status, 200);
  assert.equal((await api('GET', '/api/children', undefined, preview.data.token)).status, 403);
  assert.equal((await api('POST', '/api/pair/start', {}, preview.data.token)).status, 403);
  assert.equal((await api('GET', '/api/health', undefined, undefined, { origin: 'http://192.168.1.2:5311' }))
    .headers.get('access-control-allow-origin'), 'http://192.168.1.2:5311');
  assert.equal((await api('GET', '/api/health', undefined, undefined, { origin: 'https://untrusted.example' }))
    .headers.get('access-control-allow-origin'), null);
  assert.equal((await api('POST', '/api/plugins/remote', { manifestUrl: 'http://127.0.0.1/plugin.json' }, admin)).status, 400);
  const assets = join(dataDir, 'custom', 'assets');
  await mkdir(assets, { recursive: true });
  await writeFile(join(assets, 'smoke.html'), '<!doctype html><title>SECURITY_SMOKE</title>');
  const assetUrl = `${base}/packs/sprout.custom/assets/smoke.html`;
  const page = await fetch(assetUrl, { signal: AbortSignal.timeout(15_000) });
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-type')?.includes('text/plain'));
  assert.ok(page.headers.get('content-disposition')?.includes('attachment'));
  await page.text();
  assert.equal((await api('PUT', '/api/packs/sprout.custom', { enabled: false }, admin)).status, 200);
  const disabled = await fetch(assetUrl, { signal: AbortSignal.timeout(15_000) });
  assert.equal(disabled.status, 404);
  await disabled.text();
  assert.ok(output.includes('服务使用明文 HTTP'));
  console.log('T18: 预览只读、设备授权、时长截断、CORS、SSRF 拒绝和静态文件安全通过');
  console.log(`构建产物验收通过，端口 ${port}`);
} finally {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
    await stopped;
    clearTimeout(timeout);
    console.log('验收服务已关闭');
  }
  await rm(dataDir, { recursive: true, force: true });
}
