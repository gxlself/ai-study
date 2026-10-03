import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const artifacts = resolve(root, 'test-artifacts/t22-security');
const fixture = JSON.parse(await readFile(resolve(dist, 'bundled/packs/sprout.core/bundle.json'), 'utf8'));
const template = fixture.lessons.find((lesson) => (lesson.audience ?? 'child') === 'child');
const credentials = { preview: 'qa-only-preview-token', device: 'qa-only-device-token' };
const report = { checks: [], errors: [], resourcesClosed: false };
const requests = [];
let home;
let remote;
let browser;

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
};
const lesson = (kind, title = `安全验收 ${kind}`) => ({
  ...template, id: `security.${kind}`, title: { zh: title }, ageRange: [18, 36], audience: 'child',
  steps: kind === 'sort' ? [{
    type: 'sort', props: {
      prompt: { zh: '把苹果放进水果篮' },
      bins: [
        { id: 'fruit', label: { zh: '水果' }, color: `url(${remote}/tracking.png)` },
        { id: 'toys', label: { zh: '玩具' }, color: '#5da9e9' },
      ],
      items: [{ item: 'apple', bin: 'fruit' }, { item: 'ball', bin: 'toys' }],
    },
  }] : kind === 'video' ? [{
    type: 'video', props: { src: `${remote}/tracking.mp4`, poster: `${remote}/tracking.png`, captions: `${remote}/tracking.vtt` },
  }] : kind === 'web' || kind === 'redirect' ? [{
    type: 'web', props: { url: `${remote}/${kind === 'web' ? 'web.html' : 'redirect'}`, title: { zh: '一起看看' } },
  }] : [{ type: 'qa.trusted', props: {} }],
});

const serve = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/host.html') {
      const src = `${home}/#/preview/security.remote?previewToken=${credentials.preview}&server=${encodeURIComponent(home)}`;
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<!doctype html><html><body style="margin:0"><iframe id="preview" src="${src}" style="width:100vw;height:100vh;border:0"></iframe></body></html>`);
      return;
    }
    const file = resolve(dist, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(dist + sep) || !(await stat(file)).isFile()) throw new Error('missing');
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
const external = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  requests.push({ path, method: request.method, external: true });
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/entry.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(`window.__t22Trusted = true; export default {
      type: 'qa.trusted', version: '1.0.0', name: {zh:'测试活动'},
      mount(el, ctx) { const button = document.createElement('button'); button.textContent = '完成活动';
        button.dataset.focusable = ''; button.onclick = () => ctx.complete(); el.append(button);
        return {unmount(){button.remove();}}; }
    };`);
  } else if (path === '/web.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:24px;font:28px sans-serif;background:#e6f4d7">
      <h1>一起轻轻拍拍手</h1><button id="done" style="font:inherit;padding:16px">完成网页活动</button>
      <script>document.querySelector('#done').onclick = () => { const p = new URL(location.href).searchParams;
        parent.postMessage({type:'sprout:complete',nonce:p.get('sproutNonce')},p.get('sproutParentOrigin')); };</script>
    </body></html>`);
  } else if (path === '/untrusted-host.html') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><iframe id="preview" src="${home}/#/preview/security.remote?previewToken=${credentials.preview}&server=${encodeURIComponent(home)}" style="width:100vw;height:100vh"></iframe>`);
  } else if (path === '/redirect') {
    response.writeHead(302, { Location: `${home}/` }); response.end();
  } else {
    response.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : 'text/plain' });
    response.end('window.__t22Unregistered = true;');
  }
});
const listen = (server) => new Promise((done) => server.listen(0, '127.0.0.1', done));
const close = (server) => new Promise((done) => { server.closeAllConnections(); server.close(done); });

async function context(viewport) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await ctx.addInitScript((values) => {
    try {
      localStorage.setItem('sprout.source', 'remote');
      localStorage.setItem('sprout.deviceToken', values.device);
      localStorage.setItem('sprout.server', location.origin);
    } catch { /* opaque sandbox 本来就不能使用家庭存储。 */ }
    try {
      navigator.serviceWorker.register = () => Promise.reject(new Error('验收关闭 Service Worker'));
    } catch { /* opaque sandbox 不允许访问 Service Worker。 */ }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('验收固定尺寸', 'NotAllowedError'));
  }, credentials);
  await ctx.route(`${home}/api/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, method: request.method(), external: false });
    assert.equal(request.method(), 'GET');
    assert.equal(request.headers().authorization, `Bearer ${credentials.preview}`);
    const json = (body) => route.fulfill({ json: body });
    if (path === '/api/plugins') return json([{
      id: 'qa.plugin', version: '1.0.0', name: { zh: '测试插件' }, source: 'remote', enabled: true,
      entryUrl: `${remote}/entry.js`, activities: [{ type: 'qa.trusted', name: { zh: '测试活动' } }], permissions: [],
    }]);
    if (path === '/api/packs') return json([{
      id: 'sprout.core', enabled: true, baseUrl: '/bundled/packs/sprout.core/',
    }]);
    if (path === '/api/lexicon') return json(fixture.lexicon.concepts.map((item) => ({
      ...item, packId: 'sprout.core', imageUrl: `/bundled/packs/sprout.core/${item.image}`,
    })));
    if (path.startsWith('/api/lessons/security.')) {
      const kind = path.split('.').at(-1);
      return json({ lesson: lesson(kind), packId: 'sprout.core', baseUrl: '/bundled/packs/sprout.core/' });
    }
    throw new Error(`预览越过内容读取白名单：${path}`);
  });
  return ctx;
}

async function openPreview(ctx, kind, prefix = 'preview') {
  const page = await ctx.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(`${home}/#/${prefix}/security.${kind}?previewToken=${credentials.preview}&server=${encodeURIComponent(home)}`);
  await expect(page.getByRole('heading', { name: `安全验收 ${kind}`, exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => location.hash.includes('Token')), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('sprout.deviceToken')), credentials.device);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('sprout.remote:'))), false);
  assert.equal(await page.evaluate(() => Object.values(localStorage).includes('qa-only-preview-token')), false);
  return page;
}

await mkdir(artifacts, { recursive: true });
try {
  await listen(serve); await listen(external);
  home = `http://127.0.0.1:${serve.address().port}`;
  remote = `http://127.0.0.1:${external.address().port}`;
  browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--renderer-process-limit=2'],
  });
  const ctx = await context({ width: 1920, height: 1080 });
  try {
    const page = await openPreview(ctx, 'remote');
    assert.equal(await page.evaluate(() => window.__t22Trusted), true);
    const denied = await page.evaluate(async (url) => {
      try { await import(url); return false; } catch { return true; }
    }, `${remote}/unregistered.js`);
    assert.equal(denied, true);
    assert.equal(requests.some((entry) => entry.path === '/unregistered.js'), false);
    report.checks.push({ name: '登记插件可加载，未登记跨源脚本被 CSP 拦截', passed: true });
    for (const prefix of ['Preview', '%70review']) {
      const alias = await openPreview(ctx, 'remote', prefix);
      await alias.close();
    }
    report.checks.push({ name: '大小写与编码预览别名不读取设备凭据或调用设备接口', passed: true });
    const before = requests.length;
    const hostile = await ctx.newPage();
    await hostile.goto(`${home}/#/preview/security.remote?previewToken=untrusted-token&server=${encodeURIComponent(remote)}`);
    await expect(hostile.getByText('预览服务器未在此播放端配置，请从可信后台重新打开。', { exact: true })).toBeVisible();
    assert.equal(requests.length, before);
    assert.equal(await hostile.evaluate(() => window.__t22Trusted), undefined);
    await hostile.close();
    report.checks.push({ name: 'URL 不得授予外部服务器信任，伪造插件登记在请求前被拒绝', passed: true });
    await page.goto(`${home}/#/preview/security.remote?token=old-admin-token`);
    await expect(page.getByText('不再接受管理员预览凭据，请从后台重新打开预览。')).toBeVisible();
    assert.equal(await page.evaluate(() => location.hash.includes('old-admin-token')), false);
    report.checks.push({ name: '旧管理员 URL 凭据被拒绝并移除', passed: true });
    await page.goto(`${home}/host.html`);
    const frame = page.frameLocator('#preview');
    await expect(frame.getByRole('heading', { name: '安全验收 remote' })).toBeVisible();
    const badDraft = lesson('remote', '不可信消息');
    await page.evaluate((draft) => {
      const child = document.querySelector('iframe').contentWindow;
      child.dispatchEvent(new MessageEvent('message', { data: { type: 'sprout:preview', lesson: draft }, origin: 'https://attacker.test', source: window }));
      child.dispatchEvent(new MessageEvent('message', { data: { type: 'sprout:preview', lesson: draft }, origin: location.origin, source: child }));
    }, badDraft);
    await expect(frame.getByRole('heading', { name: '安全验收 remote' })).toBeVisible();
    await page.evaluate((draft) => document.querySelector('iframe').contentWindow.postMessage({
      type: 'sprout:preview', lesson: draft, packId: 'sprout.core',
    }, location.origin), lesson('remote', '可信后台草稿'));
    await expect(frame.getByRole('heading', { name: '可信后台草稿' })).toBeVisible();
    report.checks.push({ name: '预览严格校验后台 origin 与父窗口，可信草稿可更新', passed: true });
    const untrustedHost = `${remote}/untrusted-host.html`;
    await page.goto(untrustedHost);
    const untrustedFrame = page.frameLocator('#preview');
    try {
      await expect(untrustedFrame.getByRole('heading', { name: '安全验收 remote' })).toBeVisible();
    } catch (error) {
      console.log(JSON.stringify(await Promise.all(page.frames().map(async (frame) => ({
        origin: new URL(frame.url()).origin,
        body: await frame.locator('body').innerText().catch(() => ''),
      }))), null, 2));
      throw error;
    }
    await page.evaluate(({ draft, origin }) => document.querySelector('iframe').contentWindow.postMessage({
      type: 'sprout:preview', lesson: draft, packId: 'sprout.core',
    }, origin), { draft: badDraft, origin: home });
    await expect(untrustedFrame.getByRole('heading', { name: '安全验收 remote' })).toBeVisible();
    report.checks.push({ name: '不可信 referrer/嵌入父来源不能注入草稿', passed: true });
  } finally { await ctx.close(); }

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    const ctx = await context(viewport);
    try {
      const page = await openPreview(ctx, 'sort');
      await page.getByRole('button', { name: '开始', exact: true }).click();
      await expect(page.locator('.spa-sort-bin')).toHaveCount(2);
      assert.equal(await page.locator('.spa-sort-bin').first().evaluate((element) => element.style.getPropertyValue('--spa-bin-color')), 'var(--sp-accent-2)');
      await expect.poll(() => page.locator('.spa-sort-item img').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      await page.screenshot({ path: resolve(artifacts, `sort-${viewport.width}.png`), fullPage: true });
      await page.close();
      const video = await openPreview(ctx, 'video');
      await video.getByRole('button', { name: '开始', exact: true }).click();
      await expect(video.getByText('视频暂时无法播放', { exact: true })).toBeVisible();
      assert.equal(await video.locator('video').count(), 0);
      await video.screenshot({ path: resolve(artifacts, `video-${viewport.width}.png`), fullPage: true });
      await video.close();
      report.checks.push({ name: `视频外站与 CSS URL 拒绝，${viewport.width}x${viewport.height} 有非空安全降级`, passed: true });
    } finally { await ctx.close(); }
  }
  const webContext = await context({ width: 1024, height: 768 });
  try {
    const page = await openPreview(webContext, 'web');
    await page.getByRole('button', { name: '开始', exact: true }).click();
    await expect(page.locator('.spa-web iframe')).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(page.locator('.spa-web iframe')).toHaveAttribute('referrerpolicy', 'no-referrer');
    const web = page.frameLocator('.spa-web iframe');
    try {
      await expect(web.getByRole('button', { name: '完成网页活动' })).toBeVisible();
    } catch (error) {
      console.log(JSON.stringify({
        frames: await Promise.all(page.frames().map(async (frame) => ({
          path: new URL(frame.url()).pathname, body: await frame.locator('body').innerText().catch(() => ''),
        }))),
        requests: requests.filter((entry) => entry.external),
      }, null, 2));
      throw error;
    }
    const parentReadable = await web.locator('body').evaluate(() => {
      try { return !!parent.localStorage; } catch { return false; }
    });
    assert.equal(parentReadable, false);
    await page.screenshot({ path: resolve(artifacts, 'web-sandbox-1024.png'), fullPage: true });
    await web.getByRole('button', { name: '完成网页活动' }).click();
    await expect(page.locator('.lesson-end')).toBeVisible();
    report.checks.push({ name: '真实 opaque sandbox 不可读宿主存储，带 nonce 消息正常完成', passed: true });
    await page.close();
    const redirect = await openPreview(webContext, 'redirect');
    await redirect.getByRole('button', { name: '开始', exact: true }).click();
    await expect(redirect.getByText('页面暂时无法打开', { exact: true })).toBeVisible();
    assert.equal(await redirect.locator('.spa-web iframe').count(), 0);
    report.checks.push({ name: '网页重定向到宿主被拒绝', passed: true });
  } finally { await webContext.close(); }
  assert.equal(requests.some((entry) => entry.path.startsWith('/tracking.')), false);
  assert.equal(requests.some((entry) => entry.path === '/api/sessions' || entry.path === '/api/device/bootstrap'), false);
  assert.deepEqual(report.errors, []);
} finally {
  if (browser) await browser.close();
  await close(serve); await close(external);
  report.resourcesClosed = true;
  await writeFile(resolve(artifacts, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
