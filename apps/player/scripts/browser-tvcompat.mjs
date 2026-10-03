import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect as baseExpect } from '@playwright/test';
import { checkBuild, checkJavaScript } from './check-compat.mjs';

const expect = baseExpect.configure({ timeout: 15_000 });
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const artifacts = join(root, 'test-artifacts/tvcompat');
await checkBuild(dist);
const bundle = JSON.parse(await readFile(join(dist, 'bundled/packs/sprout.core/bundle.json'), 'utf8'));
const types = ['contrast', 'word-cards', 'peekaboo', 'bubbles', 'count', 'subitize', 'choose', 'sort', 'sequence', 'pattern', 'story', 'song', 'movement', 'calm', 'video', 'web', 'guide'];
const [first, second] = bundle.lexicon.concepts;
const concept = first.id;
const other = second.id;
const scene = { bg: 'grass', ground: 'grass', sprites: [{ concept, x: 50, y: 45, size: 42, anim: 'sway' }] };
const fallback = {
  contrast: { patterns: ['circle', 'stripes'], secondsPerPattern: 20 },
  'word-cards': { items: [concept, other], speak: 'none' },
  peekaboo: { items: [concept] },
  bubbles: { items: [concept], pops: 3 },
  count: { rounds: [{ item: concept, count: 3 }] },
  subitize: { rounds: [{ item: concept, count: 3 }], showSec: 10 },
  choose: { rounds: [{ prompt: { zh: '一起找一找' }, options: [concept, other], answer: concept }] },
  sort: { prompt: { zh: '放进一样的篮子' }, bins: [{ id: 'a', label: { zh: '这里' }, concept }, { id: 'b', label: { zh: '那里' }, concept: other }], items: [{ item: concept, bin: 'a' }, { item: other, bin: 'b' }] },
  sequence: { steps: [{ concept, caption: { zh: '先看看' } }, { concept: other, caption: { zh: '再看看' } }] },
  pattern: { rounds: [{ sequence: [concept, other, concept], options: [concept, other], answer: other }] },
  story: { title: { zh: '一起看图' }, cover: scene, pages: [{ scene, text: { zh: '看看身边的东西' } }] },
  song: { title: { zh: '一起轻轻唱' }, lines: [{ lang: 'zh', text: '一起轻轻唱', notes: 'C4/1 D4/1' }], scene },
  movement: { moves: [{ concept, name: { zh: '轻轻拍拍手' }, say: { zh: '轻轻拍拍手' }, seconds: 20 }] },
  calm: { cycles: 2, inhaleSec: 6, exhaleSec: 6 },
  video: { src: '/compat-media.mp4', poster: first.image, maxSec: 10 },
  guide: { goal: '一起陪宝宝玩', steps: [{ text: '找一件安全的大玩具，和宝宝一起看看。', concept }], playMin: 5 },
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4', '.mp4': 'video/mp4' };
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/compat-frame.html') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><html><body style="margin:0"><iframe src="/#/preview?age=30&mode=zh" style="display:block;width:100vw;height:100vh;border:0"></iframe></body></html>');
      return;
    }
    if (path === '/compat-web.html') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><html lang="zh"><body><p>一起看看</p></body></html>');
      return;
    }
    if (path === '/compat-media.mp4') {
      response.writeHead(200, { 'Content-Type': 'video/mp4' });
      response.end(await readFile(join(root, '../../packages/activities/dev/assets/quiet-shape.mp4')));
      return;
    }
    const file = resolve(dist, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
    if (!file.startsWith(dist + sep)) throw new Error('Invalid path');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
let browser;
const results = [];
await mkdir(artifacts, { recursive: true });

// 删除 API，而不是只改 UA；每个独立上下文都从生产入口冷启动。
function oldWebView() {
  if (location.protocol === 'about:' || location.pathname === '/compat-frame.html') return;
  const NativeDate = Date;
  const now = NativeDate.parse('2026-10-03T03:00:00Z');
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  for (const [object, names] of [
    [window, ['globalThis', 'structuredClone', 'queueMicrotask']],
    [Object, ['fromEntries', 'hasOwn']],
    [Array.prototype, ['at']],
    [String.prototype, ['at', 'replaceAll']],
    [Promise, ['allSettled']],
    [AbortSignal, ['any', 'timeout']],
    [crypto, ['randomUUID']],
  ]) for (const name of names) Object.defineProperty(object, name, { configurable: true, writable: true, value: undefined });
  const match = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const result = match(query);
    Object.defineProperty(result, 'addEventListener', { value: undefined });
    Object.defineProperty(result, 'removeEventListener', { value: undefined });
    return result;
  };
  Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
  window.__compatFullscreenCalls = 0;
  Element.prototype.requestFullscreen = () => { window.__compatFullscreenCalls++; };
  // 捕获 Zod 的动态生成代码，回到 Node 用同一兼容解析器检查。
  window.__compatFunctions = [];
  window.Function = new Proxy(Function, {
    construct(target, args) {
      window.__compatFunctions.push(`function generated(${args.slice(0, -1).join(',')}) {${args[args.length - 1] || ''}}`);
      return Reflect.construct(target, args);
    },
    apply(target, receiver, args) {
      window.__compatFunctions.push(`function generated(${args.slice(0, -1).join(',')}) {${args[args.length - 1] || ''}}`);
      return Reflect.apply(target, receiver, args);
    },
  });
  localStorage.setItem('sprout.preferences', JSON.stringify({ volume: 0, parentHints: true, reducedMotion: true }));
}

async function dpadTo(page, selector) {
  const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  for (let retry = 0; retry < 3; retry++) {
    const path = await page.evaluate((targetSelector) => {
      const target = document.querySelector(targetSelector);
      const elements = [...document.querySelectorAll('[data-focusable]')].filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && !el.disabled && !el.closest('[hidden],[inert]') && getComputedStyle(el).visibility !== 'hidden';
      });
      const from = elements.indexOf(document.activeElement);
      const to = elements.indexOf(target);
      if (from === to && to >= 0) return [];
      if (from < 0 || to < 0) return null;
      const centers = elements.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const queue = [{ index: from, path: [] }];
      const seen = new Set([from]);
      while (queue.length) {
        const item = queue.shift();
        for (const direction of ['up', 'down', 'left', 'right']) {
          const horizontal = direction === 'left' || direction === 'right';
          const sign = direction === 'left' || direction === 'up' ? -1 : 1;
          let best = -1;
          let score = Infinity;
          centers.forEach((p, index) => {
            const origin = centers[item.index];
            const main = (horizontal ? p.x - origin.x : p.y - origin.y) * sign;
            const offset = Math.abs(horizontal ? p.y - origin.y : p.x - origin.x);
            if (main > 0 && main + 2 * offset < score) { best = index; score = main + 2 * offset; }
          });
          if (best < 0 || seen.has(best)) continue;
          const path = [...item.path, direction];
          if (best === to) return path;
          seen.add(best);
          queue.push({ index: best, path });
        }
      }
      return null;
    }, selector);
    assert.ok(path, `No D-pad path to ${selector}`);
    for (const direction of path) await page.keyboard.press(keys[direction]);
    if (await page.locator(selector).evaluate((el) => document.activeElement === el)) return;
  }
  throw new Error(`D-pad failed: ${selector}`);
}

async function capture(page, label) {
  await expect.poll(() => page.evaluate(() => [...document.images].every((img) => img.complete))).toBe(true);
  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    brokenImages: [...document.images].filter((img) => img.getBoundingClientRect().width && !img.naturalWidth).map((img) => img.src),
    flexGaps: [...document.querySelectorAll('*')].filter((el) => {
      const style = getComputedStyle(el);
      return style.display.includes('flex') && [style.rowGap, style.columnGap].some((gap) => parseFloat(gap) > 0);
    }).map((el) => el.className),
  }));
  assert.equal(metrics.overflow, false, `${label}: horizontal overflow`);
  assert.deepEqual(metrics.brokenImages, [], `${label}: broken images`);
  assert.deepEqual(metrics.flexGaps, [], `${label}: native flex gap`);
  const owner = typeof page.screenshot === 'function' ? page : page.page();
  await owner.screenshot({ path: join(artifacts, `${label}.png`), fullPage: true });
  return metrics;
}

async function passGate(page, touch) {
  await expect(page.getByRole('dialog')).toBeVisible();
  const arrows = { 上: 'ArrowUp', 下: 'ArrowDown', 左: 'ArrowLeft', 右: 'ArrowRight' };
  const sequence = (await page.locator('.gate-sequence').getAttribute('aria-label')).split('、');
  for (const key of sequence) {
    if (touch) await page.getByRole('dialog').getByRole('button', { name: key, exact: true }).tap();
    else await page.keyboard.press(arrows[key]);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '0.0.0.0', resolve); });
  const port = server.address().port;
  const base = process.env.SPROUT_PLAYER_URL || `http://127.0.0.1:${port}/`;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--renderer-process-limit=1'],
  });
  for (const [label, viewport, touch] of [
    ['tv', { width: 1920, height: 1080 }, false],
    ['ipad', { width: 1024, height: 768 }, true],
    ['phone', { width: 390, height: 844 }, true],
    ['wide', { width: 2560, height: 1080 }, false],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
      await context.addInitScript(oldWebView);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await expect(page.locator('.setup-option.local')).toBeVisible();
      await capture(page, `${label}-setup`);
      if (touch) await page.locator('.setup-option.local').tap();
      else { await dpadTo(page, '.setup-option.local'); await page.keyboard.press('Enter'); }
      await expect(page.locator('.child-form')).toBeVisible();
      if (touch) await page.getByRole('button', { name: '出生月减一', exact: true }).tap();
      else { await dpadTo(page, 'button[aria-label="出生月减一"]'); await page.keyboard.press('Enter'); }
      if (touch) await page.locator('.child-form .primary').tap();
      else { await dpadTo(page, '.child-form .primary'); await page.keyboard.press('Enter'); }
      await expect(page.locator('.co-view-notice')).toBeVisible();
      if (touch) await page.locator('.co-view-notice button').tap();
      else await page.keyboard.press('Enter');
      await expect(page.locator('.journey-grid .lesson-card').first()).toBeVisible();
      await capture(page, `${label}-home`);
      const api = await page.evaluate(async () => {
        const original = { value: undefined, date: new Date(0), map: new Map([['a', { n: 1 }]]) };
        original.self = original;
        const copy = structuredClone(original);
        const settled = await Promise.allSettled([Promise.resolve(1), Promise.reject('expected')]);
        let microtask = false;
        queueMicrotask(() => { microtask = true; });
        await Promise.resolve();
        return {
          global: globalThis === window,
          clone: copy !== original && copy.self === copy && copy.date.getTime() === 0 && copy.map.get('a') !== original.map.get('a') && Object.hasOwn(copy, 'value'),
          entries: Object.fromEntries([['x', 1]]).x === 1,
          settled: settled[0].status === 'fulfilled' && settled[1].status === 'rejected',
          microtask,
          abortStaticsAbsent: typeof AbortSignal.any === 'undefined' && typeof AbortSignal.timeout === 'undefined',
          uuidAbsent: typeof crypto.randomUUID === 'undefined',
        };
      });
      assert.ok(Object.values(api).every(Boolean), `${label}: polyfills`);
      const child = await page.evaluate(() => JSON.parse(localStorage.getItem('sprout.local.state')).children[0]);
      assert.match(child.id, /^local-child-/);

      const childCard = page.locator('.journey-grid .lesson-card').first();
      if (touch) await childCard.tap();
      else {
        await dpadTo(page, `[data-lesson-id="${await childCard.getAttribute('data-lesson-id')}"]`);
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('.start-lesson')).toBeVisible();
      if (touch) await page.locator('.start-lesson').tap();
      else { await dpadTo(page, '.start-lesson'); await page.keyboard.press('Enter'); }
      await expect(page.locator('.activity-stage .spa-stage')).toBeVisible();
      await capture(page, `${label}-child-lesson`);
      if (viewport.width >= 1366) assert.equal(await page.evaluate(() => window.__compatFullscreenCalls), 1);
      if (touch) await page.getByRole('button', { name: '退出课程', exact: true }).tap();
      else await page.keyboard.press('Escape');
      await passGate(page, touch);
      await expect(page.locator('.journey-grid')).toBeVisible();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sprout.local.state')).sessions[0].audience), 'child');

      // 真实计划切换为仅家长模式，验证线下课程路径不依赖新 API。
      await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('sprout.local.state'));
        state.children[0].screen.mode = 'parent-only';
        localStorage.setItem('sprout.local.state', JSON.stringify(state));
      });
      await page.reload();
      await expect(page.locator('.parent-journey')).toBeVisible();
      const offlineCard = page.locator('.lesson-card').filter({ has: page.locator('.offline-badge') }).first();
      await expect(offlineCard).toBeVisible();
      const offlineSelector = `[data-lesson-id="${await offlineCard.getAttribute('data-lesson-id')}"]`;
      if (touch) await offlineCard.tap();
      else { await dpadTo(page, offlineSelector); await page.keyboard.press('Enter'); }
      await expect(page.locator('.offline-lesson')).toBeVisible();
      assert.equal(await page.locator('.activity-stage').count(), 0);
      await capture(page, `${label}-offline`);
      if (touch) await page.locator('.offline-lesson .primary').tap();
      else { await dpadTo(page, '.offline-lesson .primary'); await page.keyboard.press('Enter'); }
      await expect(page.locator('.parent-journey')).toBeVisible();
      const record = await page.evaluate(() => JSON.parse(localStorage.getItem('sprout.local.state')).sessions[0]);
      assert.equal(record.audience, 'parent');
      assert.equal(record.stepsTotal, 0);

      if (touch) await page.getByRole('button', { name: '家长菜单', exact: true }).tap();
      else await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeVisible();
      await capture(page, `${label}-gate`);
      await passGate(page, touch);
      await expect(page.getByRole('heading', { name: '家长菜单', exact: true })).toBeVisible();
      await capture(page, `${label}-parent`);
      for (const [index, selector] of [[2, '.library-grid'], [3, '.settings-section']]) {
        const tab = `.parent-tabs button:nth-child(${index})`;
        if (touch) await page.locator(tab).tap();
        else { await dpadTo(page, tab); await page.keyboard.press('Enter'); }
        await expect(page.locator(selector).first()).toBeVisible();
        await capture(page, `${label}-${index === 2 ? 'library' : 'settings'}`);
      }

      if (label === 'tv') {
        // 用真实配对页验证老 AbortSignal 下的连接与轮询，网络只由隔离测试上下文 mock。
        await context.route('**/api/health', (route) => route.fulfill({ json: { ok: true } }));
        await context.route('**/api/pair/start', (route) => route.fulfill({ json: { pairingId: 'compat-pair', code: '123456', expiresAt: '2026-10-03T03:10:00Z' } }));
        let polls = 0;
        await context.route('**/api/pair/compat-pair', (route) => { polls++; return route.fulfill({ json: { status: 'pending' } }); });
        await page.goto(`${base}#/setup?connect=1`);
        await expect(page.locator('.keypad-confirm')).toBeVisible();
        await dpadTo(page, '.keypad-confirm');
        await page.keyboard.press('Enter');
        await expect(page.locator('.pair-code')).toBeVisible();
        await expect.poll(() => polls).toBe(1);
        await capture(page, 'tv-pairing');
      }

      // iframe 使用真实预览宿主和 schema，逐一挂载全部内置活动。
      await page.goto(`${base}compat-frame.html`);
      const frame = page.frameLocator('iframe');
      await expect(frame.getByText('等待预览课程', { exact: true })).toBeVisible();
      const mounted = [];
      for (const type of types) {
        const existing = bundle.lessons.flatMap((lesson) => lesson.steps).find((step) => step.type === type);
        const props = type === 'web' ? { url: `http://localhost:${port}/compat-web.html`, maxSec: 30 }
          : type === 'video' ? { ...fallback.video, src: `${base}compat-media.mp4` }
          : existing?.props || fallback[type];
        const lesson = {
          ...bundle.lessons.find((item) => item.audience !== 'parent'),
          id: `compat.${type}`, title: { zh: `兼容验证 ${type}` }, ageRange: [24, 36], audience: 'child',
          steps: [{ type, props }],
        };
        await page.evaluate((lesson) => document.querySelector('iframe').contentWindow.postMessage({ type: 'sprout:preview', lesson, packId: 'sprout.core' }, location.origin), lesson);
        await expect(frame.getByRole('heading', { name: lesson.title.zh, exact: true })).toBeVisible();
        await frame.locator('.start-lesson').click();
        await expect(frame.locator('.activity-stage .spa-stage')).toBeVisible().catch(async (error) => {
          await page.screenshot({ path: join(artifacts, `${label}-${type}-failure.png`), fullPage: true });
          console.error(JSON.stringify({ label, type, errors, body: await frame.locator('body').innerText() }));
          throw error;
        });
        assert.equal(await frame.locator('.missing-activity').count(), 0);
        const stage = await frame.locator('.activity-stage').boundingBox();
        assert.ok(stage.width > 200 && stage.height > 150, `${label}/${type}: nonblank stage`);
        assert.ok(Math.abs(stage.width / stage.height - 16 / 9) < .001, `${label}/${type}: ratio`);
        const mainFrame = page.frames().find((entry) => entry.url().includes('#/preview'));
        await capture(mainFrame, `${label}-${type}`);
        if (type === 'story' || type === 'song') {
          const sprites = await frame.locator('.spa-scene-sprite').evaluateAll((elements) => elements.map((el) => {
            const r = el.getBoundingClientRect(); return { width: r.width, height: r.height };
          }));
          assert.ok(sprites.length > 0 && sprites.every((sprite) => sprite.width > 1 && Math.abs(sprite.width - sprite.height) < 2), `${label}/${type}: square sprites`);
        }
        mounted.push(type);
      }
      const generated = await frame.locator('body').evaluate(() => window.__compatFunctions);
      assert.ok(generated.length > 10, `${label}: Zod JIT parsers exercised`);
      for (const code of generated) checkJavaScript(code, `${label}-zod-generated.js`);
      assert.deepEqual(errors, [], `${label}: page errors`);
      results.push({ label, viewport, api, offlineAudience: record.audience, activities: mounted, generatedParsers: generated.length, errors });
      console.log(`${label}: 17 个活动、入口 polyfill、线下版、布局验证通过。`);
    } finally {
      await context.close();
    }
  }
  await writeFile(join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
