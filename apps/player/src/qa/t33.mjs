import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { buildApp } from '../../../server/src/app.ts';

const playerDir = fileURLToPath(new URL('../../', import.meta.url));
const rootDir = resolve(playerDir, '../..');
const artifacts = join(playerDir, 'test-artifacts/t33');
const dataDir = await mkdtemp(join(tmpdir(), 'sprout-t33-'));
const app = await buildApp({ rootDir, dataDir, reloadIntervalMs: 0 });
const checks = [];
const errors = [];
let browser;
let currentPage;
let passed = false;
const password = 't33-isolated-test-password';
const now = new Date();
const born = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
const birthday = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-${String(born.getDate()).padStart(2, '0')}`;
const options = { reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone };

function track(page) {
  currentPage = page;
  page.on('pageerror', (error) => errors.push(error.message));
}

async function screenshot(page, name) {
  await expect.poll(() => page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: horizontal overflow`);
  await page.screenshot({ path: join(artifacts, name), fullPage: false });
}

async function checkPrompt(page, address, name) {
  await expect(page.locator('.print-cards-address')).toHaveText(address);
  const layout = await page.locator('.print-cards-prompt').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const address = element.querySelector('.print-cards-address');
    const addressRect = address.getBoundingClientRect();
    const reading = element.closest('.intro-reading');
    return {
      top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      addressBottom: addressRect.bottom, addressFont: getComputedStyle(address).fontSize,
      readingBottom: reading?.getBoundingClientRect().bottom ?? innerHeight,
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      clipped: element.scrollWidth > element.clientWidth + 1 || address.scrollWidth > address.clientWidth + 1,
    };
  });
  assert.ok(layout.top >= 0 && layout.bottom <= layout.height && layout.addressBottom <= layout.readingBottom + 1, JSON.stringify(layout));
  assert.ok(layout.left >= 0 && layout.right <= layout.width);
  assert.equal(layout.clipped, false);
  await screenshot(page, name);
  checks.push({ screenshot: name, layout });
}

try {
  await mkdir(artifacts, { recursive: true });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = `http://127.0.0.1:${app.server.address().port}`;
  let adminToken;
  async function api(path, body, method = body === undefined ? 'GET' : 'POST', token = adminToken) {
    const response = await fetch(`${address}${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(response.ok, `${method} ${path}: ${response.status}`);
    return response.status === 204 ? undefined : response.json();
  }
  adminToken = (await api('/api/setup', { password, familyName: 'T33 验证家庭', child: { name: '芽芽', birthday, screen: { mode: 'parent-only', windows: [] } } })).token;
  await api('/api/settings', { ttsProvider: 'none' }, 'PUT');
  const child = (await api('/api/children'))[0];
  const catalog = await api('/api/lessons');
  const printableLessons = catalog.filter((lesson) => lesson.audience === 'parent' && lesson.hasPrintables && lesson.ageRange[0] <= 6 && lesson.ageRange[1] >= 6);
  assert.ok(printableLessons.length >= 2);
  const selected = printableLessons.find((lesson) => lesson.id === 'core.s1.contrast-shapes') ?? printableLessons[0];
  const second = printableLessons.find((lesson) => lesson.id !== selected.id);
  await api(`/api/children/${child.id}`, { plan: { pinned: [selected.id, second.id] } }, 'PUT');
  const plan = await api(`/api/children/${child.id}/today`);
  assert.equal(plan.child.ageMonths, 6);
  assert.equal(plan.screen.mode, 'parent-only');
  assert.ok(plan.items.filter((item) => item.lesson.hasPrintables).length >= 2);
  const pair = await api('/api/pair/start', { name: 'T33 电视', kind: 'browser' }, 'POST', '');
  await api('/api/pair/approve', { code: pair.code, childId: child.id });
  const paired = await api(`/api/pair/${pair.pairingId}`, undefined, 'GET', '');
  browser = await chromium.launch({ headless: true });

  for (const viewport of [
    { width: 1920, height: 1080, dpr: 1 },
    { width: 960, height: 540, dpr: 2 },
  ]) {
    const context = await browser.newContext({ ...options, viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
    await context.addInitScript(({ address, token }) => {
      localStorage.setItem('sprout.source', 'remote');
      localStorage.setItem('sprout.server', address);
      localStorage.setItem('sprout.deviceToken', token);
      localStorage.setItem('sprout.preferences', JSON.stringify({ volume: 0, parentHints: true, reducedMotion: true }));
      Element.prototype.requestFullscreen = async () => {};
    }, { address, token: paired.deviceToken });
    const page = await context.newPage();
    track(page);
    await page.goto(`${address}/#/`);
    await expect(page.locator('.parent-mode-label')).toHaveText('家长模式');
    const card = page.locator(`.lesson-card[data-lesson-id="${selected.id}"]`);
    await expect(card.locator('.printable-note')).toHaveText('有卡片可打印');
    await card.focus();
    await expect(card.locator('.lesson-print-address')).toBeVisible();
    const printAddress = `${address}/admin/print/lesson/${selected.id}`;
    await expect(card.locator('.lesson-print-address')).toHaveText(printAddress);
    const before = await card.locator('.lesson-print-address').evaluate((element) => element.offsetHeight);
    await page.locator('.parent-button').focus();
    await expect(card.locator('.lesson-print-address')).not.toBeVisible();
    const after = await card.locator('.lesson-print-address').evaluate((element) => element.offsetHeight);
    assert.equal(before, after);
    checks.push({ workflow: `首页卡片聚焦显示地址，失焦隐藏且无尺寸变化 ${viewport.width}`, passed: true });
    await card.click();
    await expect(page.locator('.phase-intro h1')).toHaveText(selected.title.zh);
    await expect(page.locator('.co-view')).toHaveText('只给家长看');
    await checkPrompt(page, printAddress, `player-intro-${viewport.width}x${viewport.height}-dpr${viewport.dpr}.png`);
    await page.locator('.start-lesson').click();
    await expect(page.locator('.spa-guide--read')).toBeVisible();
    await checkPrompt(page, printAddress, `player-guide-${viewport.width}x${viewport.height}-dpr${viewport.dpr}.png`);
    const prompt = await page.locator('.print-cards-prompt').boundingBox();
    const goal = await page.locator('.spa-guide-goal').boundingBox();
    const footer = await page.locator('.spa-guide-start').boundingBox();
    assert.ok(prompt.y + prompt.height <= goal.y + 1 && footer.y + footer.height <= viewport.height);
    await page.locator('.spa-guide-start').click();
    await expect(page.locator('.spa-guide--play')).toBeVisible();
    await expect(page.locator('.print-cards-prompt')).toHaveCount(0);
    await page.locator('.spa-guide-review').click();
    await expect(page.locator('.spa-guide--read')).toBeVisible();
    await expect(page.locator('.print-cards-address')).toHaveText(printAddress);
    assert.equal(await page.locator('.guide-dim').count(), 0);
    checks.push({ workflow: `guide 开始陪玩隐藏提示，再看步骤恢复 ${viewport.width}`, passed: true });
    await context.close();
  }

  const adminContext = await browser.newContext({ ...options, viewport: { width: 1440, height: 1000 } });
  await adminContext.addInitScript((token) => {
    if (/^https?:$/.test(location.protocol)) sessionStorage.setItem('sprout.adminToken', token);
  }, adminToken);
  const admin = await adminContext.newPage();
  track(admin);
  await admin.goto(`${address}/admin/`);
  const weekly = admin.getByRole('region', { name: '本周卡片' });
  await expect(weekly.locator('.family-printable-list li').first()).toBeVisible();
  await expect(weekly.getByRole('link', { name: '打印本主题卡片' })).toHaveAttribute('target', '_blank');
  await expect(weekly.getByRole('link', { name: '打印今天的卡片' })).toHaveAttribute('target', '_blank');
  await screenshot(admin, 'admin-weekly-cards-1440x1000.png');
  await weekly.screenshot({ path: join(artifacts, 'admin-weekly-cards-detail.png') });
  checks.push({ workflow: '6 月龄后台本周卡片含缩略图、名称及两个打印入口', cards: await weekly.locator('li').count(), passed: true });
  const themeHref = await weekly.getByRole('link', { name: '打印本主题卡片' }).getAttribute('href');
  const todayHref = await weekly.getByRole('link', { name: '打印今天的卡片' }).getAttribute('href');
  assert.ok(todayHref.includes('lessonId='));
  await admin.locator('.family-lesson-item').getByRole('button', { name: selected.title.zh, exact: true }).click();
  const drawerPrint = admin.locator('.ant-drawer-footer').getByRole('button', { name: /打印实体卡片$/ });
  await expect(drawerPrint).toBeVisible();
  const drawerButton = await drawerPrint.boundingBox();
  assert.ok(drawerButton.y >= 0 && drawerButton.y + drawerButton.height <= 1000);
  await admin.locator('.ant-drawer-close').click();
  checks.push({ workflow: '课程详情抽屉保留固定底部、首屏可见的打印实体卡片按钮', passed: true });

  const [printToday] = await Promise.all([
    adminContext.waitForEvent('page'),
    weekly.getByRole('link', { name: '打印今天的卡片' }).click(),
  ]);
  track(printToday);
  await printToday.waitForLoadState('domcontentloaded');
  await expect(printToday.getByRole('heading', { name: '打印今天的卡片', exact: true })).toBeVisible();
  await expect(printToday.getByRole('button', { name: /打印$/ })).toBeEnabled();
  const expectedSections = (await Promise.all(plan.items.filter((item) => item.lesson.hasPrintables)
    .map((item) => api(`/api/lessons/${item.lessonId}`)))).reduce((count, document) => count + document.lesson.printables.length, 0);
  assert.equal(await printToday.locator('.print-section').count(), expectedSections);
  const help = printToday.locator('.print-help').first();
  for (const text of ['A4', '实际大小', '厚纸或过塑', '剪圆角', '由成人拿取', '20–30 厘米', '慢慢移动', '每次几分钟']) await expect(help).toContainText(text);
  await screenshot(printToday, 'admin-print-today-1440x1000.png');
  await printToday.emulateMedia({ media: 'print' });
  await expect(help).not.toBeVisible();
  await expect(printToday.locator('.print-toolbar')).not.toBeVisible();
  await screenshot(printToday, 'admin-print-media-1440x1000.png');
  await printToday.emulateMedia({ media: 'screen' });
  checks.push({ workflow: '新标签页合并今日所有材料；使用建议仅屏幕显示，打印时隐藏', sections: expectedSections, passed: true });

  const theme = await adminContext.newPage();
  track(theme);
  await theme.goto(`${address}${themeHref}`);
  await expect(theme.getByRole('heading', { name: `打印主题：${plan.theme.title.zh}`, exact: true })).toBeVisible();
  await expect(theme.getByRole('button', { name: /打印$/ })).toBeEnabled();
  await screenshot(theme, 'admin-print-theme-1440x1000.png');
  await theme.setViewportSize({ width: 390, height: 844 });
  await screenshot(theme, 'admin-print-theme-mobile.png');
  await admin.setViewportSize({ width: 390, height: 844 });
  await weekly.scrollIntoViewIfNeeded();
  await screenshot(admin, 'admin-weekly-cards-mobile.png');
  checks.push({ workflow: '本主题打印及手机端布局无横向溢出，图像全部加载', passed: true });

  const phoneContext = await browser.newContext({ ...options, viewport: { width: 390, height: 844 } });
  const phone = await phoneContext.newPage();
  track(phone);
  await phone.goto(`${address}/admin/print/lesson/${selected.id}`);
  await phone.getByLabel('管理员密码', { exact: true }).fill(password);
  await phone.getByRole('button', { name: /登\s*录/ }).click();
  await expect(phone.getByRole('heading', { name: `打印：${selected.title.zh}`, exact: true })).toBeVisible();
  await expect(phone.getByRole('button', { name: /打印$/ })).toBeEnabled();
  assert.equal(new URL(phone.url()).pathname, `/admin/print/lesson/${selected.id}`);
  await screenshot(phone, 'admin-print-lesson-phone.png');
  checks.push({ workflow: '手机从完整打印地址进入，登录后保留课程打印页且可打印', passed: true });
  await phoneContext.close();

  const localContext = await browser.newContext({ ...options, viewport: { width: 960, height: 540 } });
  await localContext.addInitScript((child) => {
    localStorage.setItem('sprout.source', 'local');
    localStorage.setItem('sprout.local.state', JSON.stringify({
      version: 1, deviceId: 't33-local-device', createdAt: new Date().toISOString(),
      children: [child], selectedChildId: child.id, sessions: [],
    }));
    localStorage.setItem('sprout.preferences', JSON.stringify({ volume: 0, parentHints: true, reducedMotion: true }));
  }, child);
  const local = await localContext.newPage();
  track(local);
  await local.goto(`${address}/#/lesson/${selected.id}`);
  await expect(local.locator('.print-cards-prompt')).toContainText('连接家庭服务器后可在后台打印卡片');
  await expect(local.locator('.print-cards-address')).toHaveCount(0);
  await screenshot(local, 'player-offline-intro-960x540.png');
  checks.push({ workflow: '离线课程导语显示连接服务器提示，不显示伪地址', passed: true });
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
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ birthday, passed, checks, errors, resourcesClosed: true }, null, 2));
}
console.log(`T33 Playwright: ${checks.length} 项通过，截图位于 ${artifacts}`);
