'use strict';

/* SPROUT_PRECACHE_START */
const BUILD = { version: 'development-v1', files: ['index.html'] };
/* SPROUT_PRECACHE_END */

// 构建后由 write-sw-manifest.mjs 注入哈希资源与 bundled 全量文件；开发模板不保证离线启动。
const BASE = new URL('./', self.location.href);
const INDEX_URL = new URL('index.html', BASE).href;
const CACHE_PREFIX = `sprout-player:${encodeURIComponent(BASE.pathname)}:`;
const SHELL_CACHE = `${CACHE_PREFIX}${BUILD.version}:shell`;
const PACK_CACHE = `${CACHE_PREFIX}${BUILD.version}:packs`;
const PUBLIC_API_CACHE = `${CACHE_PREFIX}${BUILD.version}:public-api`;
const ACTIVE_CACHES = new Set([SHELL_CACHE, PACK_CACHE, PUBLIC_API_CACHE]);
const PRECACHE_URLS = BUILD.files.map((file) => new URL(file, BASE));
const SHELL_URLS = new Set(PRECACHE_URLS.map((url) => url.href));
const BUNDLED_PATH = new URL('bundled/', BASE).pathname;
const SCOPED_API_PATH = new URL('api/', BASE).pathname;
const SCOPED_PACK_PATH = new URL('packs/', BASE).pathname;
const PUBLIC_API_PATHS = new Set(['/api/schemas', new URL('api/schemas', BASE).pathname]);

function decodedPath(url) {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

function isApi(url) {
  const path = decodedPath(url);
  const scoped = decodeURIComponent(SCOPED_API_PATH);
  return path !== null && (path === '/api' || path.startsWith('/api/') ||
    path === scoped.slice(0, -1) || path.startsWith(scoped));
}

function isPack(url) {
  return url.pathname.startsWith('/packs/') || url.pathname.startsWith(SCOPED_PACK_PATH) ||
    url.pathname.startsWith(BUNDLED_PATH);
}

function isSensitivePack(url) {
  const path = decodedPath(url);
  if (path === null) return true;
  return ['/packs/', SCOPED_PACK_PATH, `${BUNDLED_PATH}packs/`].some((prefix) => {
    const custom = `${decodeURIComponent(prefix)}sprout.custom`;
    return path === custom || path.startsWith(`${custom}/`);
  });
}

function cacheable(request, response) {
  if (request.method !== 'GET' || request.headers.has('Authorization') || request.headers.has('Range') ||
      !response.ok || response.status === 206 || response.redirected || response.type === 'opaque') return false;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || (response.url && new URL(response.url).origin !== BASE.origin)) return false;
  if (/(?:^|,)\s*(?:no-store|private)(?:\s|=|,|$)/i.test(response.headers.get('Cache-Control') || '')) return false;
  const vary = (response.headers.get('Vary') || '').toLowerCase().split(',').map((part) => part.trim());
  if (vary.some((part) => ['*', 'authorization', 'cookie'].includes(part))) return false;
  const type = response.headers.get('Content-Type') || '';
  if (/text\/html/i.test(type) && url.href !== INDEX_URL) return false;
  if (url.pathname.endsWith('.json') || isApi(url)) return /(?:application\/json|\+json)(?:;|$)/i.test(type);
  return true;
}

async function readCached(name, key) {
  try {
    return await (await caches.open(name)).match(key);
  } catch {
    return undefined;
  }
}

async function remember(name, request, response) {
  if (!cacheable(request, response)) return;
  try {
    await (await caches.open(name)).put(request, response);
  } catch {
    // 配额或隐私模式禁用缓存时，仍把网络响应交还页面。
  }
}

function anonymous(request) {
  return new Request(request, { credentials: 'omit' });
}

async function cacheFirst(event, name, key = event.request) {
  const request = anonymous(typeof key === 'string' ? new Request(key) : key);
  const cached = await readCached(name, request);
  if (cached) return cached;
  const response = await fetch(request);
  event.waitUntil(remember(name, request, response.clone()));
  return response;
}

async function publicApiNetworkFirst(event) {
  const request = new Request(event.request, { credentials: 'omit', cache: 'no-store' });
  try {
    const response = await fetch(request);
    if (response.ok) event.waitUntil(remember(PUBLIC_API_CACHE, request, response.clone()));
    // 不把 401/403/404 等客户端错误替换成以前的成功响应。
    if (response.status >= 500) return (await readCached(PUBLIC_API_CACHE, request)) || response;
    return response;
  } catch (error) {
    const cached = await readCached(PUBLIC_API_CACHE, request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    for (let offset = 0; offset < PRECACHE_URLS.length; offset += 8) {
      await Promise.all(PRECACHE_URLS.slice(offset, offset + 8).map(async (url) => {
        if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname) || isApi(url) || isSensitivePack(url)) {
          throw new Error(`拒绝预缓存非应用公开资源：${url.pathname}`);
        }
        const request = new Request(url.href, { cache: 'reload', credentials: 'omit' });
        const response = await fetch(request);
        if (!cacheable(request, response)) throw new Error(`预缓存失败：${url.pathname} (${response.status})`);
        const name = isPack(url) ? PACK_CACHE : SHELL_CACHE;
        await (await caches.open(name)).put(request, response);
      }));
    }
    // 不 skipWaiting：旧页面关闭后再启用新版本，避免旧页面混用新资源。
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && !ACTIVE_CACHES.has(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !/^https?:$/.test(url.protocol)) return;

  // 不保存鉴权、配对、孩子、记录、设置等 API，连浏览器 HTTP 缓存也绕过。
  if (isApi(url)) {
    const publicRequest = PUBLIC_API_PATHS.has(url.pathname) && !url.search &&
      !request.headers.has('Authorization') && !request.headers.has('Range') && request.cache !== 'no-store';
    event.respondWith(publicRequest ? publicApiNetworkFirst(event) : fetch(request, { cache: 'no-store' }));
    return;
  }
  if (request.headers.has('Authorization') || request.headers.has('Range') || url.search ||
      request.cache === 'no-store' || isSensitivePack(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (isPack(url)) {
    event.respondWith(cacheFirst(event, PACK_CACHE));
    return;
  }
  // HashRouter 只回退应用根与 index.html；绝不把 /admin 或未知路径替换成播放端。
  if (request.mode === 'navigate' && (url.pathname === BASE.pathname || url.href === INDEX_URL)) {
    event.respondWith(cacheFirst(event, SHELL_CACHE, INDEX_URL));
    return;
  }
  if (SHELL_URLS.has(url.href)) event.respondWith(cacheFirst(event, SHELL_CACHE));
});
