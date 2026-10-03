import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const command = async (...args) => (await exec('docker', args, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })).stdout.trim();

export async function smokeDocker(image = 'sprout-household:t8-check') {
  const name = `sprout-t8-smoke-${process.pid}`;
  let id;
  try {
    id = await command('run', '--detach', '--rm', '--name', name, '--read-only',
      '--tmpfs', '/data:uid=1000,gid=1000,mode=0700',
      '--tmpfs', '/tmp:size=64m,mode=1777',
      '--publish', '127.0.0.1::4310', image);
    const info = JSON.parse(await command('inspect', id))[0];
    const port = info.NetworkSettings.Ports['4310/tcp'][0].HostPort;
    const base = `http://127.0.0.1:${port}`;
    let health;
    for (let attempt = 0; attempt < 60; attempt++) {
      health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
      if (health?.ok) break;
      await new Promise((done) => setTimeout(done, 500));
    }
    assert.ok(health?.ok, '容器没有通过健康检查。');
    assert.equal((await health.json()).ok, true);
    for (const path of ['/', '/admin/']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes('id="root"'), `${path} 应返回真实构建的应用，不是缺 dist 提示页。`);
    }
    const bundle = await fetch(`${base}/bundled/packs/sprout.core/bundle.json`).then((response) => {
      assert.equal(response.status, 200);
      return response.json();
    });
    assert.ok(bundle.lessons.length > 0 && bundle.routes.length > 0);
    const asset = bundle.lexicon.concepts[0].image;
    const imageResponse = await fetch(`${base}/packs/sprout.core/${asset}`);
    assert.equal(imageResponse.status, 200);
    assert.ok((await imageResponse.arrayBuffer()).byteLength > 0);
    const privateApi = await fetch(`${base}/api/children`);
    assert.equal(privateApi.status, 401);
    const processUser = await command('exec', id, 'id', '-u');
    assert.equal(processUser, '1000');
    console.info('Docker 健康检查、播放器/后台静态页面、正式内置资源、鉴权和非 root 运行均通过。');
  } catch (error) {
    if (id) console.error(await command('logs', '--tail', '30', id).catch(() => ''));
    throw error;
  } finally {
    if (id) {
      await command('stop', '--time', '10', id).catch(() => undefined);
      await command('rm', '--force', id).catch(() => undefined);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  smokeDocker(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
