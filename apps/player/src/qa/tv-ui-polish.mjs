import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const player = fileURLToPath(new URL('../../', import.meta.url));
const repository = resolve(player, '../..');
const artifacts = join(player, 'test-artifacts/polish');
const phase = process.argv[2] || 'after';
assert.ok(['before', 'after'].includes(phase), '参数为 before 或 after');
await mkdir(artifacts, { recursive: true });
const snapshot = join(artifacts, 'bundle.json');
if (phase === 'before') {
  await writeFile(snapshot, await readFile(join(repository, 'content/packs/sprout-core/bundle.json')));
}
const bundleText = await readFile(snapshot, 'utf8');
const bundle = JSON.parse(bundleText);
const dist = join(player, 'dist');
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(dist + sep) || !(await stat(file)).isFile()) throw new Error('文件不存在');
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
];
const scenarios = [
  { id: 'core.s1.contrast-shapes', kind: 'guide' },
  { id: 'core.s2.real-bubbles', kind: 'guide' },
  { id: 'core.s4.calm-down', kind: 'guide' },
  { id: 'core.s6.animal-pattern', kind: 'offline' },
  { id: 'core.s5.weather', kind: 'end' },
];
const report = {
  phase, bundleSha256: createHash('sha256').update(bundleText).digest('hex'),
  checks: [], resourcesClosed: false,
};
let browser;
const reportFile = join(artifacts, `${phase}-results.json`);

async function installLocal(context, lesson, offline, content = bundleText, reducedMotion = true) {
  const now = new Date();
  const born = new Date(now.getFullYear(), now.getMonth() - lesson.ageRange[0], 1);
  const birthday = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-01`;
  await context.addInitScript(({ birthday, offline, reducedMotion }) => {
    const timestamp = new Date().toISOString();
    const child = {
      id: 'polish-child', name: '芽芽', birthday, languageMode: 'zh-en', showPinyin: false,
      screen: {
        sessionMaxMin: null, dailyMaxMin: null, windows: [{ start: '00:00', end: '23:59' }],
        mode: offline ? 'parent-only' : 'co-view', distanceReminder: false,
      },
      plan: { routeId: 'sprout.core.route', themeId: null, pinned: [], skipped: [], focusDomains: [] },
      createdAt: timestamp, updatedAt: timestamp,
    };
    localStorage.setItem('sprout.source', 'local');
    localStorage.setItem('sprout.local.state', JSON.stringify({
      version: 1, deviceId: 'polish-device', createdAt: timestamp,
      children: [child], selectedChildId: child.id, sessions: [],
    }));
    localStorage.setItem('sprout.preferences', JSON.stringify({ volume: 0, parentHints: true, reducedMotion }));
    localStorage.setItem('sprout.co-view-notice.polish-child', '1');
    Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('固定验收尺寸', 'NotAllowedError'));
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    HTMLMediaElement.prototype.play = function () {
      queueMicrotask(() => this.dispatchEvent(new Event('ended')));
      return Promise.resolve();
    };
  }, { birthday, offline, reducedMotion });
  await context.route('**/bundled/packs/sprout.core/bundle.json', (route) =>
    route.fulfill({ body: content, contentType: 'application/json' }));
}

async function geometry(page) {
  return page.evaluate(() => {
    const rectangle = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const reading = document.querySelector('.spa-reading-area') ||
      document.querySelector('.spa-guide-reading,.offline-lesson main,.lesson-end');
    const button = document.querySelector('.spa-guide-start,.offline-lesson .primary,.lesson-end .primary');
    const toolbar = document.querySelector('.lesson-topbar,.offline-lesson > header,.lesson-end-heading');
    const focus = document.querySelector('.sp-focused');
    const columns = document.querySelector('.spa-guide-columns,.offline-columns');
    const body = document.querySelector('.spa-guide-step-body > p,.offline-playbook li');
    const english = document.querySelector('.spa-guide-say [lang="en"],.offline-playbook [lang="en"]');
    const brokenImages = [...document.images].filter((image) => image.getBoundingClientRect().width && !image.naturalWidth)
      .map((image) => image.getAttribute('src'));
    const textOverflow = [...document.querySelectorAll('h1,h2,h3,p,button,dt,dd,figcaption')].filter((element) =>
      element.clientWidth && element.scrollWidth > element.clientWidth + 2).map((element) => ({
      selector: element.className, text: element.textContent.slice(0, 80),
    }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      button: rectangle(button), toolbar: rectangle(toolbar), reading: rectangle(reading),
      contentHeight: reading?.scrollHeight, availableHeight: reading?.clientHeight,
      columns: columns ? getComputedStyle(columns).gridTemplateColumns.split(' ').length : 1,
      focus: focus ? {
        tag: focus.tagName, className: focus.className, box: rectangle(focus),
        transform: getComputedStyle(focus).transform, shadow: getComputedStyle(focus).boxShadow,
      } : null,
      brokenImages, textOverflow,
      hasMoreHint: !!document.querySelector('.spa-reading-more:not([hidden])'),
      bodyFont: body ? parseFloat(getComputedStyle(body).fontSize) : null,
      englishFont: english ? parseFloat(getComputedStyle(english).fontSize) : null,
    };
  });
}

async function screenshot(page, name) {
  await expect.poll(() => page.evaluate(() => [...document.images].every((image) => image.complete))).toBe(true);
  const file = join(artifacts, phase, `${name}.png`);
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
  return geometry(page);
}

function verifyLayout(metrics, scenario, viewport) {
  assert.equal(metrics.horizontalOverflow, false, `${scenario.id}: 横向溢出`);
  assert.ok(metrics.documentHeight <= viewport.height + 2, `${scenario.id}: 页面滚动`);
  assert.ok(metrics.button && metrics.button.top >= 0 && metrics.button.bottom <= viewport.height - Math.min(viewport.width, viewport.height) * .025,
    `${scenario.id}: 主按钮不在底部安全区`);
  assert.ok(metrics.reading.bottom <= metrics.button.top + 2, `${scenario.id}: 内容与主按钮重叠`);
  if (scenario.kind === 'guide') {
    assert.ok(metrics.reading.top > metrics.toolbar.bottom, `${scenario.id}: 内容与顶栏重叠`);
  }
  assert.deepEqual(metrics.brokenImages, [], `${scenario.id}: 图片失效`);
  assert.deepEqual(metrics.textOverflow, [], `${scenario.id}: 文字截断`);
  assert.equal(metrics.columns, viewport.width >= 1280 ? 2 : 1, `${scenario.id}: 栏数`);
  if (viewport.width >= 1280) {
    assert.ok(metrics.bodyFont >= viewport.height * .026 - .1, `${scenario.id}: 家长正文过小`);
    assert.ok(metrics.englishFont < metrics.bodyFont, `${scenario.id}: 英文短句字号`);
    assert.ok(metrics.contentHeight <= metrics.availableHeight + 2, `${scenario.id}: 常见课程未在一屏放下`);
  }
}

async function verifyLongGuide(base, viewport) {
  const lesson = structuredClone(bundle.lessons.find((entry) => entry.id === 'core.s1.contrast-shapes'));
  lesson.id = 'polish.long-guide';
  const props = lesson.steps[0].props;
  props.steps = Array.from({ length: 8 }, (_, index) => {
    const step = props.steps[index % props.steps.length];
    return { ...step, text: `${step.text} ${step.text}`.slice(0, 80) };
  });
  props.safety = `${props.safety} `.repeat(5);
  const content = JSON.stringify({ ...bundle, lessons: [...bundle.lessons, lesson] });
  const context = await browser.newContext({ viewport, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  try {
    await context.addInitScript(() => {
      for (const [object, names] of [
        [window, ['globalThis', 'structuredClone', 'queueMicrotask', 'ResizeObserver']],
        [Object, ['fromEntries', 'hasOwn']],
        [Array.prototype, ['at']],
        [String.prototype, ['replaceAll']],
        [Promise, ['allSettled']],
        [AbortSignal, ['any', 'timeout']],
        [crypto, ['randomUUID']],
      ]) for (const name of names) Object.defineProperty(object, name, { configurable: true, writable: true, value: undefined });
    });
    await installLocal(context, lesson, false, content, false);
    const page = await context.newPage();
    await page.goto(`${base}/#/lesson/${lesson.id}`);
    await page.locator('.start-lesson').click();
    const area = page.locator('.spa-reading-area');
    await expect(area).toBeVisible();
    await expect(page.locator('.spa-reading-more')).toBeVisible();
    await area.focus();
    const focus = await area.evaluate((element) => ({
      transform: getComputedStyle(element).transform, shadow: getComputedStyle(element).boxShadow,
    }));
    assert.equal(focus.transform, 'none');
    assert.ok(focus.shadow.includes('inset'), '阅读区焦点必须是内描边');
    const transitions = [];
    await page.exposeFunction('polishScroll', (top) => transitions.push(top));
    await area.evaluate((element) => element.addEventListener('scroll', () => window.polishScroll(element.scrollTop)));
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => area.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    assert.ok(new Set(transitions).size > 2, '未减少动画时，方向键须平滑滚动');
    for (let turn = 0; turn < 10 && await page.locator('.spa-reading-more:visible').count(); turn++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);
    }
    await expect(page.locator('.spa-reading-more')).toBeHidden();
    const metrics = await screenshot(page, `${viewport.width}x${viewport.height}-long-guide-scrolled`);
    assert.ok(metrics.button.bottom <= viewport.height, '超长指引的按钮不可移出屏幕');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.spa-reading-more')).toBeVisible();
    await page.locator('.spa-guide-start').click();
    await expect(page.locator('.spa-guide--play')).toBeVisible();
    await expect(page.locator('.lesson-topbar')).toBeHidden();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.locator('.spa-guide--reaction')).toBeVisible();
    assert.equal(await page.locator('.spa-guide-reactions button').count(), 3);
    return {
      viewport, fixture: '8 步超长指引（仅测试上下文）',
      legacyApiFallback: true, resizeObserverFallback: true,
      smoothScrollEvents: transitions.length, focus, metrics,
    };
  } finally {
    await context.close();
  }
}

try {
  let port = Number(process.env.SPROUT_POLISH_PORT || 5410);
  for (;;) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      port += 100;
    }
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--renderer-process-limit=1'],
  });
  const base = `http://127.0.0.1:${port}`;
  const captureViewports = phase === 'after' ? [...viewports, { width: 390, height: 844 }] : viewports;
  for (const viewport of captureViewports) {
    for (const scenario of scenarios) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width === 1024, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        const lesson = bundle.lessons.find((entry) => entry.id === scenario.id);
        assert.ok(lesson, `${scenario.id}: 正式内容包中不存在`);
        await installLocal(context, lesson, scenario.kind === 'offline');
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${base}/#/lesson/${scenario.id}`);
        if (scenario.kind === 'offline') {
          await expect(page.locator('.offline-lesson')).toBeVisible();
        } else {
          await expect(page.locator('.start-lesson')).toBeVisible();
          await page.locator('.start-lesson').click();
          await expect(page.locator('.activity-stage .spa-stage')).toBeVisible();
          if (scenario.kind === 'end') {
            for (let turn = 0; turn < 20 && await page.locator('.spa-word-cards').count(); turn++) {
              if (await page.locator('.spa-word-finish').count()) {
                await page.locator('.spa-word-finish').click();
                break;
              }
              await page.keyboard.press('ArrowRight');
            }
            await expect(page.locator('.lesson-end')).toBeVisible();
          }
        }
        await page.keyboard.press('ArrowLeft');
        const name = `${viewport.width}x${viewport.height}-${scenario.id}-${scenario.kind}`;
        const metrics = await screenshot(page, name);
        const row = { ...scenario, viewport, metrics, errors };
        report.checks.push(row);
        if (phase === 'after') {
          try { verifyLayout(metrics, scenario, viewport); }
          catch (error) { row.failure = error.message; }
          assert.deepEqual(errors, [], `${scenario.id}: 浏览器错误`);
          if (metrics.contentHeight > metrics.availableHeight + 2) {
            const reading = page.locator('.spa-reading-area');
            await page.keyboard.press('ArrowDown');
            await expect.poll(() => reading.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
            await page.keyboard.press('ArrowUp');
            await expect.poll(() => reading.evaluate((element) => element.scrollTop)).toBe(0);
            row.scrollVerified = true;
          }
        }
        console.log(`${phase} ${name}: 内容 ${metrics.contentHeight}/${metrics.availableHeight}，按钮 bottom=${metrics.button?.bottom}`);
      } finally {
        await context.close();
      }
    }
  }
  if (phase === 'after') {
    report.longGuides = [];
    for (const viewport of viewports) report.longGuides.push(await verifyLongGuide(base, viewport));
  }
  assert.deepEqual(report.checks.filter((row) => row.failure).map((row) => `${row.viewport.width} ${row.failure}`), [], '布局验收');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  report.resourcesClosed = true;
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
}
