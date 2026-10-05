import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { PLAYER_ROOT } from './files.mjs';

const dist = join(PLAYER_ROOT, 'dist-demo');
const prefix = '/ai-study/demo/';
const shots = process.env.SPROUT_DEMO_SHOTS || join(PLAYER_ROOT, 'test-artifacts/demo');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
await mkdir(shots, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (pathname === '/ai-study/') {
      response.writeHead(200, { 'Content-Type': types['.html'] });
      response.end(`<!doctype html><html><head><title>Demo iframe QA</title></head><body style="margin:0"><iframe title="Sprout demo" style="border:0;width:100%;height:100vh" src="${prefix}"></iframe></body></html>`);
      return;
    }
    if (!pathname.startsWith(prefix)) throw new Error('outside demo');
    const file = resolve(dist, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(`${dist}${sep}`) || !(await stat(file)).isFile()) throw new Error('not a file');
    if (!(await realpath(file)).startsWith(`${await realpath(dist)}${sep}`)) throw new Error('outside demo');
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  for (const [label, viewport, iframe, lang, speech] of [
    ['desktop', { width: 1280, height: 720 }, false, 'zh-CN', true],
    ['iframe', { width: 960, height: 540 }, true, 'en-US', false],
    ['mobile', { width: 390, height: 844 }, false, 'zh-CN', false],
  ]) {
    const context = await browser.newContext({ viewport, locale: lang, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
    const errors = [], failures = [], external = [];
    await context.addInitScript((enabled) => {
      window.__sproutSpeechCalls = [];
      if (!enabled) {
        Object.defineProperty(window, 'speechSynthesis', { value: undefined });
      } else {
        // headless 无扬声器；保留 Web Speech 调用协议并验证无清单时确实到达回退层。
        Object.defineProperty(window, 'speechSynthesis', { value: {
          getVoices: () => [], cancel() {}, pause() {}, resume() {},
          speak(utterance) {
            window.__sproutSpeechCalls.push(utterance.text);
            queueMicrotask(() => utterance.onend?.());
          },
        } });
      }
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('QA keeps viewport fixed'));
    }, speech);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${message.text()} @ ${message.location().url}`);
    });
    context.on('response', (response) => { if (response.status() >= 400) failures.push(response.url()); });
    context.on('request', (request) => {
      if (new URL(request.url()).origin !== origin) external.push(request.url());
    });
    try {
      await page.goto(`${origin}${iframe ? '/ai-study/' : prefix}`, { waitUntil: 'networkidle' });
    let frame = iframe ? page.frames().find((item) => item.url().startsWith(`${origin}${prefix}`)) : page.mainFrame();
      assert.ok(frame, `${label}: missing demo frame`);
      await expect(frame.locator('.child-form')).toBeVisible();
      await expect(frame.locator('.demo-badge')).toContainText(lang === 'zh-CN' ? '演示版' : 'Demo');
      assert.equal(await frame.getByText('连接家庭服务器', { exact: true }).count(), 0);
      await page.screenshot({ path: join(shots, `${label}-setup.png`), fullPage: true });
      // 选择 24+ 月龄，但不改产品的默认时间窗口；测试档案是独立浏览器数据。
      await frame.locator('button[aria-label="出生月减一"]').click();
      if (iframe) {
        await frame.locator('.child-form .primary').focus();
        await page.keyboard.press('Enter');
      } else await frame.locator('.child-form .primary').click();
      await expect(frame.locator('.home, .rest')).toBeVisible();
      if (await frame.locator('.rest').count()) {
        await frame.evaluate(() => {
          const state = JSON.parse(localStorage.getItem('sprout.local.state'));
          const child = state.children.find((item) => item.id === state.selectedChildId);
          child.screen.windows = [];
          child.screen.mode = 'co-view';
          child.screen.dailyMaxMin = 60;
          child.screen.sessionMaxMin = 20;
          localStorage.setItem('sprout.local.state', JSON.stringify(state));
        });
        await page.goto(iframe ? `${origin}/ai-study/` : `${origin}${prefix}#/`, { waitUntil: 'networkidle' });
        frame = iframe ? page.frames().find((item) => item.url().startsWith(`${origin}${prefix}`)) : page.mainFrame();
      }
      if (await frame.locator('.rest').count()) {
        const homeButton = frame.getByRole('button', { name: '回到首页', exact: true });
        if (await homeButton.count()) await homeButton.click();
      }
      await expect(frame.locator('.home')).toBeVisible();
      const notice = frame.getByRole('button', { name: '已了解', exact: true });
      if (await notice.count()) await notice.click();
      await page.screenshot({ path: join(shots, `${label}-home.png`), fullPage: true });
      const card = frame.locator('[data-lesson-id="core.s5.weather"]').first();
      if (await card.count()) await card.click();
      else if (iframe) await frame.goto(`${origin}${prefix}#/lesson/core.s5.weather`);
      else await page.goto(`${origin}${prefix}#/lesson/core.s5.weather`, { waitUntil: 'networkidle' });
      await frame.getByRole('button', { name: '开始', exact: true }).click();
      await expect(frame.locator('.spa-word-cards')).toBeVisible();
      await page.screenshot({ path: join(shots, `${label}-lesson.png`), fullPage: true });
      for (let i = 0; i < 6; i++) {
        if (iframe) {
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(100);
        } else await frame.getByRole('button', { name: '下一张', exact: true }).click();
      }
      await expect(frame.locator('.spa-word-finish')).toBeVisible();
      if (iframe) await page.keyboard.press('Enter');
      else await frame.locator('.spa-word-finish').click();
      await expect(frame.locator('.lesson-end')).toBeVisible();
      await expect(frame.locator('.lesson-end .primary')).toBeEnabled();
      await page.screenshot({ path: join(shots, `${label}-end.png`), fullPage: true });
      const state = await frame.evaluate(() => ({
        completed: JSON.parse(localStorage.getItem('sprout.local.state')).sessions[0]?.completed,
        speechCalls: window.__sproutSpeechCalls.length,
        broken: [...document.images].filter((image) => !image.complete || !image.naturalWidth).map((image) => image.src),
        overflow: document.documentElement.scrollWidth > innerWidth + 2,
      }));
      assert.equal(state.completed, true);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.broken, []);
      if (speech) assert.ok(state.speechCalls > 0, 'Web Speech fallback was not called');
      const registration = await frame.evaluate(async () => {
        const ready = await navigator.serviceWorker.ready;
        return { scope: ready.scope, caches: await caches.keys() };
      });
      assert.equal(registration.scope, `${origin}${prefix}`);
      assert.ok(registration.caches.every((name) => name.startsWith('sprout-player:%2Fai-study%2Fdemo%2F:')));
      assert.deepEqual(errors, [], `${label} console/page errors: ${JSON.stringify(errors)}`);
      assert.deepEqual(failures, [], `${label} HTTP failures: ${JSON.stringify(failures)}`);
      assert.deepEqual(external, [], `${label} external requests: ${JSON.stringify(external)}`);
      results.push({ label, viewport, ...state, ...registration, errors, failures, external });
    } finally { await context.close(); }
  }
  await writeFile(join(shots, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Demo QA passed: ${results.length} desktop/mobile/iframe flows; no HTTP, console, asset or external-request errors.`);
  console.log(`Screenshots: ${shots}`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
