import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { buildApp } from '../../../server/src/app.ts';

const playerDir = fileURLToPath(new URL('../../', import.meta.url));
const rootDir = resolve(playerDir, '../..');
const artifacts = join(playerDir, 'test-artifacts/t31');
const dataDir = await mkdtemp(join(tmpdir(), 'sprout-t31-'));
const checks = [];
const errors = [];
const now = new Date();
const dateString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = dateString(now);
const options = {
  viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce',
  locale: 'zh-CN', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
};
const app = await buildApp({ rootDir, dataDir, reloadIntervalMs: 0 });
let browser;
let currentPage;
let passed = false;

function track(page) {
  page.on('pageerror', (error) => errors.push(error.message));
}

async function birthday(page, value) {
  const input = page.getByLabel('生日', { exact: true });
  await input.fill(value);
  await input.press('Tab');
  await expect(input).toHaveValue(value);
}

async function screenshot(page, name) {
  await expect.poll(() => page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: join(artifacts, name), fullPage: false });
  const layout = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    banner: (() => {
      const element = document.querySelector('.plan-range-notice');
      const rect = element?.getBoundingClientRect();
      return rect ? {
        top: rect.top, bottom: rect.bottom, right: rect.right,
        clipped: element.scrollHeight > element.clientHeight + 1, text: element.textContent,
      } : null;
    })(),
  }));
  assert.equal(layout.horizontalOverflow, false);
  assert.ok(layout.banner && layout.banner.top >= 0 && layout.banner.bottom < layout.height);
  assert.equal(layout.banner.clipped, false);
  assert.ok(layout.banner.right < layout.width);
  checks.push({ screenshot: name, layout });
}

try {
  await mkdir(artifacts, { recursive: true });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext(options);
  const admin = await adminContext.newPage();
  currentPage = admin;
  track(admin);
  let setupRequests = 0;
  let childWrites = 0;
  admin.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/setup') setupRequests += 1;
    if (['POST', 'PUT'].includes(request.method()) && /^\/api\/children(?:\/[^/]+)?$/.test(new URL(request.url()).pathname)) childWrites += 1;
  });
  await admin.goto(`${address}/admin/`);
  await admin.getByLabel('家庭名', { exact: true }).fill('T31 验证家庭');
  await admin.getByLabel('管理员密码', { exact: true }).fill('t31-isolated-test-password');
  await admin.getByLabel('再次输入密码', { exact: true }).fill('t31-isolated-test-password');
  await admin.getByRole('button', { name: /下一步/ }).click();
  await expect(admin.getByLabel('生日', { exact: true })).toHaveValue('');
  await admin.getByLabel('孩子名字', { exact: true }).fill('芽芽');
  await birthday(admin, today);
  await expect(admin.locator('.ant-alert-warning')).toContainText('请确认宝宝生日（当前为 0 天）');
  await admin.getByRole('button', { name: '创建家庭', exact: true }).click();
  await expect(admin.getByRole('dialog')).toContainText('请确认宝宝生日');
  assert.equal(setupRequests, 0);
  await admin.getByRole('button', { name: '返回修改', exact: true }).click();
  assert.equal(setupRequests, 0);
  await admin.getByRole('button', { name: '创建家庭', exact: true }).click();
  await admin.getByRole('button', { name: '确认生日并保存', exact: true }).click();
  await expect(admin.getByRole('heading', { name: '今日概览', exact: true })).toBeVisible();
  await expect(admin.locator('.plan-range-notice')).toContainText('不需要屏幕');
  await expect(admin.locator('.family-lesson-item')).toHaveCount(2);
  await screenshot(admin, 'admin-0-months-1280x800.png');
  checks.push({ workflow: '首次向导生日留空、黄色提示、取消不提交、确认后保存', passed: true });

  const token = await admin.evaluate(() => sessionStorage.getItem('sprout.adminToken'));
  async function api(path, body, method = body === undefined ? 'GET' : 'POST', auth = token) {
    const response = await fetch(`${address}${path}`, {
      method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(response.ok, `${method} ${path}: ${response.status}`);
    return response.json();
  }
  const child = (await api('/api/children'))[0];
  await api('/api/settings', { ttsProvider: 'none' }, 'PUT');
  const pair = await api('/api/pair/start', { name: 'T31 电视', kind: 'browser' }, 'POST', '');
  await api('/api/pair/approve', { code: pair.code, childId: child.id });
  const paired = await api(`/api/pair/${pair.pairingId}`, undefined, 'GET', '');
  const playerContext = await browser.newContext(options);
  await playerContext.addInitScript(({ address, deviceToken }) => {
    localStorage.setItem('sprout.source', 'remote');
    localStorage.setItem('sprout.server', address);
    localStorage.setItem('sprout.deviceToken', deviceToken);
    localStorage.setItem('sprout.preferences', JSON.stringify({ volume: 0, parentHints: true, reducedMotion: true }));
  }, { address, deviceToken: paired.deviceToken });
  const player = await playerContext.newPage();
  currentPage = player;
  track(player);
  await player.goto(`${address}/#/`);
  await expect(player.locator('.home-greeting .plan-range-notice')).toContainText('宝宝还不到 6 个月');
  await expect(player.locator('.parent-journey .lesson-card')).toHaveCount(2);
  await expect(player.locator('.parent-mode-label')).toHaveText('家长模式');
  await screenshot(player, 'player-0-months-1280x800.png');
  await player.setViewportSize({ width: 390, height: 844 });
  await screenshot(player, 'player-0-months-mobile.png');
  await player.setViewportSize(options.viewport);
  const devicePlan = await api(`/api/children/${child.id}/today`, undefined, 'GET', paired.deviceToken);
  assert.equal(devicePlan.notice, 'before-first-stage');
  assert.ok(devicePlan.items.every((item) => item.lesson.audience === 'parent' && !item.offlineOnly));
  checks.push({ workflow: '真实配对设备取得 notice，0 月龄首页显示首阶段家长课程', passed: true });

  for (const months of [0, 3, 5, 6, 40]) {
    const born = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    const profile = await api('/api/children', { name: `T31 ${months} 月`, birthday: dateString(born), screen: { mode: 'co-view', windows: [] } });
    const plan = await api(`/api/children/${profile.id}/today`);
    assert.equal(plan.child.ageMonths, months);
    assert.equal(plan.notice, months < 6 ? 'before-first-stage' : months > 39 ? 'after-last-stage' : undefined);
    assert.ok(plan.items.length > 0);
    if (months < 6) {
      assert.equal(plan.screen.mode, 'parent-only');
      assert.equal(plan.theme.id, 's1-t1');
      assert.ok(plan.items.every((item) => item.lesson.audience === 'parent'));
    }
    if (months === 40) assert.equal(plan.stage.id, 's6');
    checks.push({ apiAgeMonths: months, notice: plan.notice ?? null, lessonIds: plan.items.map((item) => item.lessonId) });
  }

  await admin.goto(`${address}/admin/children`);
  currentPage = admin;
  await admin.getByRole('button', { name: /新建档案/ }).click();
  const drawer = admin.getByRole('dialog');
  await expect(drawer.getByLabel('生日', { exact: true })).toHaveValue('');
  await drawer.getByLabel('名字', { exact: true }).fill('T31 新建');
  const future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  await birthday(admin, dateString(future));
  await expect(drawer.locator('.ant-alert-warning').first()).toContainText('当前为 -1 天');
  await drawer.getByRole('button', { name: /保存档案/ }).click();
  await expect(drawer.getByText('生日不能晚于今天', { exact: true })).toBeVisible();
  assert.equal(childWrites, 0);
  await birthday(admin, today);
  await drawer.getByRole('button', { name: /保存档案/ }).click();
  await expect(admin.locator('.ant-modal-confirm')).toContainText('请确认宝宝生日');
  assert.equal(childWrites, 0);
  await admin.getByRole('button', { name: '确认生日并保存', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  assert.equal(childWrites, 1);
  const added = admin.locator('.family-child-item').filter({ has: admin.getByRole('heading', { name: 'T31 新建', exact: true }) });
  await added.getByRole('button', { name: /编辑/ }).click();
  await expect(admin.getByRole('dialog').locator('.ant-alert-warning').first()).toContainText('请确认宝宝生日');
  await admin.getByRole('button', { name: /保存档案/ }).click();
  await expect(admin.locator('.ant-modal-confirm')).toBeVisible();
  assert.equal(childWrites, 1);
  await admin.getByRole('button', { name: '返回修改', exact: true }).click();
  assert.equal(childWrites, 1);
  await admin.getByRole('dialog').getByRole('button', { name: /取\s*消/ }).click();
  checks.push({ workflow: '新建与编辑生日二次确认；未来日期黄色提示且禁止保存', passed: true });

  const allLessons = await api('/api/lessons');
  currentPage = player;
  await api(`/api/children/${child.id}`, { plan: { skipped: allLessons.map((lesson) => lesson.id) } }, 'PUT');
  await player.reload();
  await expect(player.locator('.today-empty')).toContainText('今天没有可用的家长指引');
  await player.getByRole('button', { name: '打开课程库', exact: true }).click();
  const sequence = (await player.locator('.gate-sequence').getAttribute('aria-label')).split('、');
  for (const direction of sequence) await player.locator('.gate-arrows').getByRole('button', { name: direction, exact: true }).click();
  await expect(player.locator('.parent-content > h2')).toHaveText('课程库');
  checks.push({ workflow: '空计划经家长门直接进入课程库', passed: true });

  assert.deepEqual(errors, []);
  await rm(join(artifacts, 'failure.png'), { force: true });
  passed = true;
} catch (error) {
  await currentPage?.screenshot({ path: join(artifacts, 'failure.png'), fullPage: false });
  checks.push({ failure: error.message });
  throw error;
} finally {
  await browser?.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ today, passed, checks, errors, resourcesClosed: true }, null, 2));
}
console.log(`T31 Playwright: ${checks.length} 项通过，截图位于 ${artifacts}`);
