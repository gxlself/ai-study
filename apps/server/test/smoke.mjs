import { spawn, execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { once } from 'node:events';

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
  server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: new URL('../../..', import.meta.url),
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', SPROUT_DATA_DIR: dataDir,
      SPROUT_CONTENT_DIRS: join(dataDir, 'no-source-packs'),
    },
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
