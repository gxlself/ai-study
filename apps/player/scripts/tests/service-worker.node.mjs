import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const template = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://sprout.test';
const FILES = ['index.html', 'assets/index-abc.js', 'assets/style-def.css',
  'bundled/packs/sprout.core/bundle.json', 'bundled/packs/sprout.core/assets/apple.svg'];

function bodyResponse(text, type = 'text/plain', options = {}) {
  return new Response(text, { ...options, headers: { 'Content-Type': type, ...options.headers } });
}

function json(value, options = {}) {
  return bodyResponse(JSON.stringify(value), 'application/json', options);
}

function memoryCaches() {
  const buckets = new Map();
  const keyOf = (input) => typeof input === 'string' ? input : input.url;
  return {
    buckets,
    async open(name) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const bucket = buckets.get(name);
      return {
        async match(key) { return bucket.get(keyOf(key))?.clone(); },
        async put(key, response) {
          assert.ok(response.ok && response.status !== 206);
          assert.equal(typeof key === 'string' ? 'GET' : key.method, 'GET');
          bucket.set(keyOf(key), response.clone());
        },
      };
    },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { return buckets.delete(name); },
    storedURLs() { return [...buckets.values()].flatMap((bucket) => [...bucket.keys()]); },
  };
}

function worker({ base = '/', version = 'test-v1', files = FILES, caches = memoryCaches() } = {}) {
  const handlers = new Map();
  const calls = [];
  let claimed = false;
  let offline = false;
  let network = (request) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith('.json') || path.includes('/api/')) return json({ path, generation: 'network' });
    if (path.endsWith('.html')) return bodyResponse('<!doctype html><title>Fixture shell</title>', 'text/html');
    if (path.endsWith('.svg')) return bodyResponse('<svg/>', 'image/svg+xml');
    if (path.endsWith('.js')) return bodyResponse('export const fixture = true;', 'text/javascript');
    return bodyResponse('body {}', 'text/css');
  };
  const fetcher = async (input, options) => {
    const request = new Request(input, options);
    calls.push(request);
    if (offline) throw new TypeError('offline');
    return network(request);
  };
  const source = template.replace(/\/\* SPROUT_PRECACHE_START \*\/[\s\S]*?\/\* SPROUT_PRECACHE_END \*\//,
    `const BUILD = ${JSON.stringify({ version, files })};`);
  vm.runInNewContext(source, {
    self: {
      location: { href: `${ORIGIN}${base}sw.js` },
      clients: { async claim() { claimed = true; } },
      addEventListener(type, handler) { handlers.set(type, handler); },
    },
    caches, fetch: fetcher, URL, Request, Response, Set, Promise, console,
  });
  return {
    caches, calls, get claimed() { return claimed; },
    setOffline(value = true) { offline = value; },
    network(handler) { network = handler; },
    async lifecycle(type) {
      const pending = [];
      handlers.get(type)({ waitUntil(promise) { pending.push(promise); } });
      await Promise.all(pending);
    },
    async request(path, init = {}, navigate = false) {
      const request = new Request(new URL(path, `${ORIGIN}${base}`), init);
      if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
      const pending = [];
      let responsePromise;
      handlers.get('fetch')({
        request,
        respondWith(promise) { responsePromise = promise; },
        waitUntil(promise) { pending.push(promise); },
      });
      if (!responsePromise) return null;
      const response = await responsePromise;
      await Promise.all(pending);
      return response;
    },
  };
}

test('安装预缓存所有哈希资源与未访问的内置图片；断网可启动与读取', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.equal(sw.calls.length, FILES.length);
  assert.ok(sw.calls.every((request) => request.method === 'GET' && request.credentials === 'omit'));
  await sw.lifecycle('activate');
  assert.equal(sw.claimed, true);
  sw.setOffline();
  assert.match(await (await sw.request('/', {}, true)).text(), /Fixture shell/);
  assert.match(await (await sw.request('/assets/index-abc.js')).text(), /export const/);
  assert.equal((await sw.request('/bundled/packs/sprout.core/assets/apple.svg')).status, 200);
  assert.equal((await sw.request('/bundled/packs/sprout.core/bundle.json')).status, 200);
  assert.equal(sw.calls.length, FILES.length, '离线命中缓存不发网络请求');
});

test('应用可以部署子目录，根目录后台和未知导航不被截获', async () => {
  const sw = worker({ base: '/player/' });
  await sw.lifecycle('install');
  sw.setOffline();
  assert.match(await (await sw.request('/player/', {}, true)).text(), /Fixture shell/);
  assert.equal((await sw.request('/player/assets/index-abc.js')).status, 200);
  assert.equal(await sw.request('/admin/', {}, true), null);
  assert.equal(await sw.request('/not-a-player-route', {}, true), null);
  assert.equal(await sw.request('/', {}, true), null);
  assert.equal(await sw.request('https://other.test/assets/index-abc.js'), null);
});

test('普通内容包 cache-first，第一次成功后可离线；带查询参数不复用', async () => {
  const sw = worker();
  const path = '/packs/example/assets/leaf.svg';
  assert.equal((await sw.request(path)).status, 200);
  const firstCalls = sw.calls.length;
  sw.setOffline();
  assert.equal((await sw.request(path)).status, 200);
  assert.equal(sw.calls.length, firstCalls);
  await assert.rejects(sw.request(`${path}?token=private`), /offline/);
  assert.deepEqual(sw.caches.storedURLs(), [`${ORIGIN}${path}`]);
});

test('只有公共 schemas API network-first，成功更新，离线和 5xx 可回退', async () => {
  const sw = worker();
  let revision = 1;
  sw.network(() => json({ revision }));
  assert.deepEqual(await (await sw.request('/api/schemas')).json(), { revision: 1 });
  revision = 2;
  assert.deepEqual(await (await sw.request('/api/schemas')).json(), { revision: 2 });
  assert.equal(sw.calls.length, 2);
  assert.ok(sw.calls.every((request) => request.cache === 'no-store' && request.credentials === 'omit'));
  sw.setOffline();
  assert.deepEqual(await (await sw.request('/api/schemas')).json(), { revision: 2 });
  sw.setOffline(false);
  sw.network(() => json({ error: 'unavailable' }, { status: 503 }));
  assert.deepEqual(await (await sw.request('/api/schemas')).json(), { revision: 2 });
  sw.network(() => json({ error: 'denied' }, { status: 403 }));
  assert.equal((await sw.request('/api/schemas')).status, 403);
});

test('不同身份、退出登录与配对的一次性 token 都不落盘，也不回退公共缓存', async () => {
  const sw = worker();
  await sw.request('/api/schemas');
  const publicSnapshot = [...sw.caches.storedURLs()];
  sw.network((request) => json({ identity: request.headers.get('Authorization') ?? 'no-token', deviceToken: 'private' }));
  for (const token of ['Bearer family-a', 'Bearer family-b']) {
    for (const path of ['/api/children', '/api/device/bootstrap', '/api/sessions', '/api/settings', '/api/schemas']) {
      const response = await sw.request(path, { headers: { Authorization: token } });
      assert.equal((await response.json()).identity, token);
      assert.equal(sw.calls.at(-1).cache, 'no-store');
    }
  }
  for (const path of ['/api/pair/once', '/api/setup/status', '/api/health', '/api/children',
    '/api/schemas?token=private', '/api/schemas?version=1']) {
    assert.equal((await sw.request(path)).status, 200);
  }
  assert.deepEqual(sw.caches.storedURLs(), publicSnapshot);
  sw.setOffline();
  for (const token of ['Bearer family-a', 'Bearer family-b']) {
    await assert.rejects(sw.request('/api/schemas', { headers: { Authorization: token } }), /offline/);
    await assert.rejects(sw.request('/api/children', { headers: { Authorization: token } }), /offline/);
  }
  await assert.rejects(sw.request('/api/pair/once'), /offline/);
  await assert.rejects(sw.request('/api/children'), /offline/);
  assert.deepEqual(sw.caches.storedURLs(), publicSnapshot);
});

test('即使旧缓存已有私有响应，匿名和另一身份断网也绝不读取', async () => {
  const caches = memoryCaches();
  for (const name of ['shell', 'packs', 'public-api']) {
    const cache = await caches.open(`sprout-player:%2F:test-v1:${name}`);
    await cache.put(`${ORIGIN}/api/children`, json({ family: 'previous-identity' }));
    await cache.put(`${ORIGIN}/api/pair/once`, json({ deviceToken: 'previous-private-token' }));
  }
  const sw = worker({ caches });
  sw.setOffline();
  for (const path of ['/api/children', '/api/pair/once']) {
    await assert.rejects(sw.request(path), /offline/);
    await assert.rejects(sw.request(path, { headers: { Authorization: 'Bearer family-b' } }), /offline/);
  }
});

test('非 GET 不截获；Range、鉴权内容、custom 及 no-store 不缓存', async () => {
  const sw = worker();
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    assert.equal(await sw.request('/api/sessions', { method }), null);
  }
  for (const [path, init] of [
    ['/packs/sprout.custom/assets/photo.svg', {}],
    ['/packs/sprout.custom', {}],
    ['/packs/sprout%2ecustom/assets/photo.svg', {}],
    ['/packs/%73prout.custom/assets/photo.svg', {}],
    ['/bundled/packs/sprout.custom/assets/photo.svg', {}],
    ['/bundled/packs/sprout%2ecustom/assets/photo.svg', {}],
    ['/packs/example/audio/clip.m4a', { headers: { Range: 'bytes=0-15' } }],
    ['/packs/example/assets/photo.svg', { headers: { Authorization: 'Bearer family-a' } }],
    ['/packs/example/assets/photo.svg', { cache: 'no-store' }],
  ]) {
    await sw.request(path, init);
    assert.equal(sw.calls.at(-1).cache, 'no-store');
  }
  assert.deepEqual(sw.caches.storedURLs(), []);
});

test('编码后的 API 路径仍仅走网络，不可冒充公开 schemas 白名单', async () => {
  const sw = worker();
  sw.network(() => json({ token: 'must-not-cache' }));
  for (const path of ['/%61pi/children', '/api%2Fpair/once', '/api/%73chemas']) {
    assert.equal((await sw.request(path)).status, 200);
    assert.equal(sw.calls.at(-1).cache, 'no-store');
  }
  assert.deepEqual(sw.caches.storedURLs(), []);
});

test('失败、部分、重定向、opaque 和私有响应不缓存', async () => {
  const variants = [
    () => bodyResponse('missing', 'text/plain', { status: 404 }),
    () => bodyResponse('partial', 'text/plain', { status: 206 }),
    () => bodyResponse('private', 'text/plain', { headers: { 'Cache-Control': 'max-age=60, private' } }),
    () => bodyResponse('private', 'text/plain', { headers: { 'Cache-Control': 'no-store' } }),
    () => bodyResponse('vary', 'text/plain', { headers: { Vary: '*' } }),
    () => bodyResponse('vary', 'text/plain', { headers: { Vary: 'Accept, Authorization' } }),
    () => bodyResponse('vary', 'text/plain', { headers: { Vary: 'Cookie' } }),
    () => bodyResponse('<html>SPA fallback</html>', 'text/html'),
    () => {
      const response = bodyResponse('redirected');
      Object.defineProperty(response, 'redirected', { value: true });
      response.clone = () => response;
      return response;
    },
    () => {
      const response = bodyResponse('opaque');
      Object.defineProperty(response, 'type', { value: 'opaque' });
      response.clone = () => response;
      return response;
    },
  ];
  for (const response of variants) {
    const sw = worker();
    sw.network(response);
    await sw.request('/packs/example/assets/example.svg');
    assert.deepEqual(sw.caches.storedURLs(), []);
  }
});

test('公共 API 不保存非 JSON、private、Vary Cookie、4xx 响应', async () => {
  for (const response of [
    () => bodyResponse('<html>fallback</html>', 'text/html'),
    () => json({ secret: 'private' }, { headers: { 'Cache-Control': 'private' } }),
    () => json({ secret: 'cookie' }, { headers: { Vary: 'Cookie' } }),
    () => json({ error: 'unauthorized' }, { status: 401 }),
  ]) {
    const sw = worker();
    sw.network(response);
    await sw.request('/api/schemas');
    assert.deepEqual(sw.caches.storedURLs(), []);
  }
});

test('任一预缓存资源失败则安装失败，不激活、不清理旧版本', async () => {
  const sw = worker();
  await sw.caches.open('sprout-player:%2F:previous:shell');
  sw.network((request) => request.url.endsWith('.js')
    ? bodyResponse('missing', 'text/plain', { status: 404 })
    : request.url.endsWith('.json') ? json({}) : bodyResponse('asset'));
  await assert.rejects(sw.lifecycle('install'), /预缓存失败/);
  assert.equal(sw.claimed, false);
  assert.ok((await sw.caches.keys()).includes('sprout-player:%2F:previous:shell'));
});

test('清理仅限当前应用路径，保留后台和另一播放端缓存；新构建不读旧包', async () => {
  const caches = memoryCaches();
  await caches.open('admin-v1');
  await caches.open('sprout-player:%2Fother%2F:old:shell');
  await caches.open('sprout-player:%2F:old:public-api');
  const first = worker({ caches, version: 'version-1' });
  await first.lifecycle('install');
  const next = worker({ caches, version: 'version-2' });
  await next.lifecycle('install');
  await next.lifecycle('activate');
  const names = await caches.keys();
  assert.ok(names.includes('admin-v1'));
  assert.ok(names.includes('sprout-player:%2Fother%2F:old:shell'));
  assert.equal(names.some((name) => name.startsWith('sprout-player:%2F:version-1:')), false);
  assert.equal(names.includes('sprout-player:%2F:old:public-api'), false);
  next.setOffline();
  assert.equal((await next.request('/bundled/packs/sprout.core/bundle.json')).status, 200);
});

test('缓存额度不足不影响成功的网络响应', async () => {
  const caches = memoryCaches();
  caches.open = async () => ({ async match() { return undefined; }, async put() { throw new Error('quota'); } });
  const sw = worker({ caches });
  assert.equal((await sw.request('/packs/example/assets/apple.svg')).status, 200);
  assert.equal((await sw.request('/api/schemas')).status, 200);
});
