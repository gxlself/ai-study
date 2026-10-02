import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, expect: baseExpect } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const expect = baseExpect.configure({ timeout: 30_000 });

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, 'test-artifacts');
const base = process.env.SPROUT_PLAYER_URL || 'http://127.0.0.1:5310/';
const fixtureRoot = join(root, 'dev-fixtures/sprout.core');
const bundle = JSON.parse(await readFile(join(fixtureRoot, 'bundle.json'), 'utf8'));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  timeout: 120_000,
  args: ['--renderer-process-limit=2'],
});
const results = [];
await mkdir(artifacts, { recursive: true });

async function screenshot(page, name) {
  await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
  const metrics = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
    brokenImages: [...document.images].filter((img) => img.getBoundingClientRect().width > 0 && (!img.complete || !img.naturalWidth)).map((img) => img.src),
  }));
  assert.equal(metrics.horizontalOverflow, false, `${name}: horizontal overflow`);
  assert.deepEqual(metrics.brokenImages, [], `${name}: broken images`);
  return metrics;
}

async function fixtureContext(viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(60_000);
  await context.route('**/bundled/packs/sprout.core/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/bundled/packs/sprout.core/')[1];
    if (!path || path.includes('..')) return route.abort();
    try {
      const body = await readFile(join(fixtureRoot, path));
      await route.fulfill({ body, contentType: extname(path) === '.svg' ? 'image/svg+xml' : 'application/json' });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Test viewport is fixed', 'NotAllowedError'));
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-02T01:00:00.000Z') });
    const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}

async function passGate(page, touch = false) {
  const sequence = await page.locator('.gate-sequence').getAttribute('aria-label');
  assert.ok(sequence);
  const names = { 上: 'ArrowUp', 下: 'ArrowDown', 左: 'ArrowLeft', 右: 'ArrowRight' };
  for (const part of sequence.split('、')) {
    if (touch) await page.getByRole('button', { name: part, exact: true }).tap();
    else await page.keyboard.press(names[part]);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function dpadTo(page, selector) {
  const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  for (let retry = 0; retry < 3; retry += 1) {
    const path = await page.evaluate((targetSelector) => {
      const elements = [...document.querySelectorAll('[data-focusable]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && r.height && !el.disabled && !el.closest('[hidden],[inert]') && getComputedStyle(el).visibility !== 'hidden';
      });
      const target = document.querySelector(targetSelector);
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
          seen.add(best); queue.push({ index: best, path });
        }
      }
      return null;
    }, selector);
    assert.ok(path, `No D-pad path to ${selector}`);
    for (const direction of path) await page.keyboard.press(keys[direction]);
    if (await page.locator(selector).evaluate((el) => document.activeElement === el)) return;
  }
  throw new Error(`D-pad focus did not reach ${selector}`);
}

async function completeWords(page, touch) {
  if (await page.locator('.missing-activity').isVisible()) {
    if (touch) await page.getByRole('button', { name: '跳过', exact: true }).tap();
    else await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '你今天看得真认真！' })).toBeVisible();
    return 'missing-activity-placeholder';
  }
  await expect(page.locator('.spa-word-cards')).toBeVisible({ timeout: 15_000 });
  if (touch) {
    const next = page.getByRole('button', { name: /下一张|下一页|Next/ }).first();
    await next.tap();
    const finish = page.getByRole('button', { name: /看完啦|All done/ }).first();
    if (await finish.count() === 0) await next.tap();
    await finish.tap();
  } else {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    if (!await page.getByRole('heading', { name: '你今天看得真认真！' }).isVisible()) {
      await page.keyboard.press('Enter');
    }
  }
  await expect(page.getByRole('heading', { name: '你今天看得真认真！' })).toBeVisible({ timeout: 15_000 });
  return 'builtin-word-cards';
}

try {
  for (const [label, viewport, touch] of [
    ['tv', { width: 1920, height: 1080 }, false],
    ['ipad', { width: 1024, height: 768 }, true],
    ['phone', { width: 390, height: 844 }, true],
  ]) {
    const { context, page, errors } = await fixtureContext(viewport, touch);
    await page.goto(base);
    await expect(page.getByRole('button', { name: '先离线体验' })).toBeVisible();
    await screenshot(page, `${label}-setup`);
    if (touch) await page.getByRole('button', { name: '先离线体验' }).tap();
    else { await dpadTo(page, '.setup-option.local'); await page.keyboard.press('Enter'); }
    if (touch) await page.getByRole('button', { name: '出生月减一' }).tap();
    else { await dpadTo(page, 'button[aria-label="出生月减一"]'); await page.keyboard.press('Enter'); }
    if (touch) await page.getByRole('button', { name: '开始小旅程' }).tap();
    else { await dpadTo(page, '.child-form .primary'); await page.keyboard.press('Enter'); }
    await expect(page.getByRole('heading', { name: '今天的小旅程' })).toBeVisible({ timeout: 15_000 });
    const homeMetrics = await screenshot(page, `${label}-home`);
    const card = page.locator('.journey-grid .lesson-card').filter({ hasText: bundle.lessons[0].title.zh });
    if (touch) await card.tap();
    else { await dpadTo(page, `.journey-grid [data-lesson-id="${bundle.lessons[0].id}"]`); await page.keyboard.press('Enter'); }
    await expect(page.getByRole('button', { name: '开始', exact: true })).toBeVisible();
    await screenshot(page, `${label}-intro`);
    if (touch) await page.getByRole('button', { name: '开始', exact: true }).tap();
    else { await dpadTo(page, '.start-lesson'); await page.keyboard.press('Enter'); }
    await expect(page.locator('.activity-stage')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, `${label}-activity`);
    const activity = await completeWords(page, touch);
    await expect(page.getByRole('button', { name: '回到首页', exact: true })).toBeEnabled();
    await screenshot(page, `${label}-end`);
    const record = await page.evaluate(() => JSON.parse(localStorage.getItem('sprout.local.state')).sessions[0]);
    assert.equal(record.completed, true);
    assert.equal(record.stepsCompleted, 1);
    assert.ok(record.clientId);
    assert.ok(record.events.length > 0);
    if (touch) await page.getByRole('button', { name: '回到首页', exact: true }).tap();
    else { await dpadTo(page, '.lesson-end > .primary'); await page.keyboard.press('Enter'); }
    await expect(page.getByRole('heading', { name: '再玩一次' })).toBeVisible();
    if (label === 'tv') {
      await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('sprout.local.state'));
        const child = state.children.find((item) => item.id === state.selectedChildId);
        child.screen.sessionMaxMin = 10;
        child.screen.dailyMaxMin = 20;
        localStorage.setItem('sprout.local.state', JSON.stringify(state));
      });
      await page.reload();
      await expect(page.getByRole('heading', { name: '今天的小旅程' })).toBeVisible({ timeout: 15_000 });
      await dpadTo(page, `.journey-grid [data-lesson-id="${bundle.lessons[0].id}"]`);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: '开始', exact: true })).toBeVisible();
      await dpadTo(page, '.start-lesson');
      await page.keyboard.press('Enter');
      await expect(page.locator('.spa-word-cards')).toBeVisible({ timeout: 15_000 });
      await page.clock.fastForward(181_000);
      await expect(page.getByRole('heading', { name: '还在一起看吗？' })).toBeVisible();
      await screenshot(page, 'tv-idle-pause');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('heading', { name: '还在一起看吗？' })).toHaveCount(0);
      await expect(page.locator('.spa-word-name')).toContainText('苹果');
      await page.keyboard.press('Escape');
      await passGate(page);
      await expect(page.getByRole('heading', { name: '今天的小旅程' })).toBeVisible();
    }
    if (touch) await page.getByRole('button', { name: '家长菜单', exact: true }).tap();
    else { await dpadTo(page, '.parent-button'); await page.keyboard.press('Enter'); }
    await screenshot(page, `${label}-gate`);
    await passGate(page, touch);
    await expect(page.getByRole('heading', { name: '家长菜单', exact: true })).toBeVisible();
    await screenshot(page, `${label}-parent`);
    await page.goto(`${base}#/`);
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('sprout.local.state'));
      const child = state.children.find((item) => item.id === state.selectedChildId);
      child.birthday = '2025-10-01';
      child.screen.mode = 'auto';
      child.screen.dailyMaxMin = 1;
      child.screen.windows = [{ start: '08:00', end: '18:30' }];
      state.sessions.forEach((session) => { session.durationSec = 120; });
      localStorage.setItem('sprout.local.state', JSON.stringify(state));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: '今天陪宝宝玩什么' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('可在后台打印卡片')).toBeVisible();
    await screenshot(page, `${label}-parent-home`);
    if (touch) await page.locator('[data-lesson-id="core.fixture.parent-guide"]').tap();
    else { await dpadTo(page, '[data-lesson-id="core.fixture.parent-guide"]'); await page.keyboard.press('Enter'); }
    if (touch) await page.getByRole('button', { name: '开始', exact: true }).tap();
    else { await dpadTo(page, '.start-lesson'); await page.keyboard.press('Enter'); }
    await expect(page.locator('.spa-guide--read')).toBeVisible();
    assert.equal(await page.getByText('坐远一点，保护眼睛').count(), 0);
    await screenshot(page, `${label}-guide-read`);
    if (touch) await page.getByRole('button', { name: '开始陪玩 5 分钟', exact: true }).tap();
    else await page.keyboard.press('Enter');
    await expect(page.locator('.spa-guide--play')).toBeVisible();
    await page.clock.fastForward(181_000);
    await expect(page.getByRole('heading', { name: '还在一起看吗？' })).toHaveCount(0);
    await screenshot(page, `${label}-guide-dim`);
    if (touch) {
      await page.getByRole('button', { name: '显示陪玩选项' }).tap();
      await page.getByRole('button', { name: '结束陪玩', exact: true }).tap();
      await page.getByRole('button', { name: '很喜欢', exact: true }).tap();
    } else {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('heading', { name: '放下屏幕，去陪宝宝玩吧' })).toBeVisible();
    await expect(page.getByText('简单一点', { exact: true })).toBeVisible();
    await expect(page.getByText('挑战一下', { exact: true })).toBeVisible();
    await screenshot(page, `${label}-parent-end`);
    const parentRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('sprout.local.state')).sessions[0]);
    assert.equal(parentRecord.audience, 'parent');
    assert.equal(parentRecord.completed, true);
    assert.equal(await page.locator('.celebrate').count(), 0);
    assert.deepEqual(errors, [], `${label}: page errors`);
    results.push({ label, ...homeMetrics, activity, completed: true, session: { audience: record.audience, completed: record.completed, stepsCompleted: record.stepsCompleted, durationSec: record.durationSec }, parentSession: { audience: parentRecord.audience, completed: parentRecord.completed }, errors });
    await context.close();
  }
  await writeFile(join(artifacts, 'browser-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
