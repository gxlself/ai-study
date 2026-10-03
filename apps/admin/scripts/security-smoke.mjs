import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = resolve(root, 'test-artifacts/t21');
const port = Number(process.env.SPROUT_ADMIN_PORT ?? 5511);
const base = `http://127.0.0.1:${port}/admin`;
const origin = new URL(base).origin;
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright').catch(() => {
  throw new Error('请设置 PLAYWRIGHT_MODULE 指向本机已安装的 playwright/index.mjs。');
});
let server;
let browser;
let activePage;
let activeDb;
const logs = [];
const errors = [];
const screenshots = [];
const checks = [];

function birthday(months) {
  const now = new Date();
  const born = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-${String(born.getDate()).padStart(2, '0')}`;
}

function fixtures() {
  const now = new Date().toISOString();
  const child = (id, name, months) => ({
    id, name, birthday: birthday(months), languageMode: 'zh-en', showPinyin: false,
    screen: { sessionMaxMin: null, dailyMaxMin: null, windows: [{ start: '08:00', end: '18:30' }], distanceReminder: true },
    plan: { routeId: 'sprout.core.route', themeId: null, pinned: [], skipped: [], focusDomains: [] },
    createdAt: now, updatedAt: now,
  });
  const manifest = {
    schemaVersion: 1, id: 'example.puzzle', version: '1.1.0', name: { zh: '测试拼图插件' }, sdk: '^1.0.0',
    entry: 'index.js', permissions: ['network', 'storage'],
    activities: [{ type: 'example.puzzle', name: { zh: '拼图' } }],
  };
  const lesson = {
    schemaVersion: 1, id: 'custom.age-test', title: { zh: '一起慢慢呼吸' }, ageRange: [24, 36],
    domains: ['social'], durationMin: 2, coView: 'required', audience: 'child',
    objectives: [{ zh: '一起体验安静时刻' }], parentGuide: { intro: '靠在一起，自然呼吸。' },
    offline: [{ title: '一起抱一抱', steps: ['关屏幕后轻轻抱一抱。'] }],
    steps: [{ type: 'calm', props: { visual: 'flower', cycles: 3, inhaleSec: 3, exhaleSec: 4 } }],
  };
  return {
    manifest, lesson, initialized: true, children: [child('child-a', '芽芽', 18), child('child-b', '小满', 28)],
    plugins: [{
      ...manifest, version: '1.0.0', source: 'remote', enabled: false,
      entryUrl: 'https://plugins.example/index.js', manifestUrl: 'https://plugins.example/plugin.json',
    }],
    devices: [{
      id: 'device-tv', name: '客厅电视', kind: 'tv', childId: 'child-a', allowedChildIds: ['child-a'],
      createdAt: now, lastSeenAt: now,
    }],
    previewFailures: 0, failPairScope: false, mismatchInstall: false, events: [], requests: [],
  };
}

async function wire(page, db) {
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**:5310/**', async (route) => {
    db.events.push('iframe');
    await route.fulfill({ contentType: 'text/html', body:
      `<html lang="zh"><body><p>只读预览契约桩</p><script>parent.postMessage({type:'sprout:preview:ready'},${JSON.stringify(origin)})</script></body></html>` });
  });
  await page.route('https://plugins.example/plugin.json', async (route) => {
    assert.equal(route.request().headers().authorization, undefined);
    await route.fulfill({ json: db.manifest, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : {};
    db.requests.push({ path, method, body, authorization: request.headers().authorization });
    const reply = (json, status = 200) => route.fulfill({ json, status });
    if (path === '/api/setup/status') return reply({ initialized: db.initialized });
    if (path === '/api/auth/login' || path === '/api/setup') {
      db.initialized = true;
      return reply({ token: 'test-only-admin-token', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    }
    if (path === '/api/auth/me') return reply({ role: 'admin' });
    if (path === '/api/auth/logout') return reply({ ok: true });
    if (path === '/api/preview/token') {
      db.events.push('preview-token');
      assert.equal(request.headers().authorization, 'Bearer test-only-admin-token');
      if (db.previewFailures-- > 0) return reply({ error: { code: 'TEST', message: '预览令牌暂不可用' } }, 503);
      return reply({ token: 'test-only-preview-token', expiresAt: new Date(Date.now() + 600000).toISOString() });
    }
    if (path === '/api/children') return reply(db.children);
    if (/^\/api\/children\/[^/]+$/.test(path)) {
      const child = db.children.find((item) => item.id === path.split('/').at(-1));
      if (method === 'PUT') Object.assign(child, { ...body, plan: { ...child.plan, ...body.plan } });
      return reply(child);
    }
    if (path.endsWith('/today')) return reply({
      date: new Date().toISOString().slice(0, 10),
      child: { id: 'child-a', name: '芽芽', ageMonths: 18, ageDays: 550 },
      route: { id: 'sprout.core.route', title: { zh: '测试路线' } }, stage: null, theme: null, items: [],
      screen: { usedSec: 0, dailyMaxSec: 600, sessionMaxSec: 480, allowedNow: true, coView: 'required', mode: 'parent-only' },
    });
    if (path.endsWith('/stats')) return reply({ days: [], domains: {}, totalSec: 0, streakDays: 0 });
    if (path.endsWith('/milestones')) return reply({ items: [], observations: [], disclaimer: '测试观察' });
    if (path === '/api/settings') return reply({ familyName: '安全回归家庭', ttsProvider: 'none', ttsVoices: {}, serverUrlHint: origin });
    if (path === '/api/plugins') return reply(db.plugins);
    if (path === '/api/plugins/install' || path === '/api/plugins/remote') {
      const plugin = {
        ...db.manifest, source: path.endsWith('/remote') ? 'remote' : 'installed', enabled: true,
        entryUrl: path.endsWith('/remote') ? 'https://plugins.example/index.js' : '/plugins/example.puzzle/index.js',
        ...(path.endsWith('/remote') ? { manifestUrl: 'https://plugins.example/plugin.json' } : {}),
        permissions: db.mismatchInstall ? ['camera'] : db.manifest.permissions,
      };
      db.plugins = [plugin];
      return reply(plugin, 201);
    }
    if (path.startsWith('/api/plugins/') && method === 'PUT') {
      const plugin = db.plugins.find((item) => item.id === path.split('/').at(-1));
      Object.assign(plugin, body);
      return reply(plugin);
    }
    if (path === '/api/devices') return reply(db.devices);
    if (path === '/api/pair/approve') {
      const device = {
        id: 'device-new', name: body.name, kind: 'tv', childId: body.childId,
        allowedChildIds: body.childId ? [body.childId] : [], createdAt: new Date().toISOString(), lastSeenAt: null,
      };
      db.devices.push(device);
      return reply(device, 201);
    }
    if (path.startsWith('/api/devices/') && method === 'PUT') {
      if (path.endsWith('/device-new') && db.failPairScope) {
        db.failPairScope = false;
        return reply({ error: { code: 'TEST', message: '设备范围保存暂不可用' } }, 503);
      }
      const device = db.devices.find((item) => item.id === path.split('/').at(-1));
      Object.assign(device, body);
      return reply(device);
    }
    if (path === '/api/lessons') return reply([{ ...db.lesson, packId: 'sprout.custom', stepTypes: ['calm'] }]);
    if (path.startsWith('/api/lessons/')) return reply({
      lesson: db.lesson, packId: 'sprout.custom', baseUrl: '/packs/sprout.custom/', issues: [],
    });
    if (path === '/api/routes') return reply([]);
    if (path.startsWith('/api/routes/')) return reply({
      schemaVersion: 1, id: 'sprout.core.route', title: { zh: '测试路线' }, stages: [],
    });
    if (path === '/api/health') return reply({ ok: true, version: 'test' });
    return reply([]);
  });
}

async function screenshot(page, name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
  const widths = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
  assert.ok(widths[1] <= widths[0] + 2, `${name} 页面横向溢出：${widths}`);
  screenshots.push(name);
}

async function login(page, remember = false) {
  await page.goto(`${base}/`);
  await page.getByLabel('管理员密码', { exact: true }).fill('test-password');
  if (remember) await page.getByRole('checkbox', { name: '在此设备保持登录' }).check();
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
}

async function storage(page) {
  return page.evaluate(() => ({
    session: sessionStorage.getItem('sprout.adminToken'),
    local: localStorage.getItem('sprout.adminToken'),
    remember: localStorage.getItem('sprout.adminToken.remember'),
  }));
}

async function deviceChecks(page, db, label) {
  await page.goto(`${base}/devices`);
  await page.getByRole('button', { name: '编辑设备 客厅电视', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('checkbox', { name: '芽芽', exact: true }).isChecked(), true);
  assert.equal(await dialog.getByRole('checkbox', { name: '小满', exact: true }).isChecked(), false);
  await dialog.getByRole('checkbox', { name: '芽芽', exact: true }).uncheck();
  await dialog.getByText('绑定孩子不在允许范围内', { exact: true }).waitFor();
  const before = db.requests.filter((item) => item.method === 'PUT').length;
  await dialog.getByRole('button', { name: /保\s*存/, exact: true }).click();
  assert.equal(db.requests.filter((item) => item.method === 'PUT').length, before);
  await dialog.getByRole('checkbox', { name: '芽芽', exact: true }).check();
  await dialog.getByRole('checkbox', { name: '小满', exact: true }).check();
  await screenshot(page, `${label}-device-permissions`);
  await dialog.getByRole('button', { name: /保\s*存/, exact: true }).click();
  await page.getByRole('button', { name: '确认保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(db.devices[0].allowedChildIds, ['child-a', 'child-b']);
  await page.getByRole('button', { name: '编辑设备 客厅电视', exact: true }).click();
  await dialog.getByRole('checkbox', { name: '允许全部孩子（含以后添加的档案）' }).check();
  await dialog.getByRole('button', { name: /保\s*存/, exact: true }).click();
  await page.getByRole('button', { name: '确认保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(db.devices[0].allowedChildIds, null);
  await page.getByRole('button', { name: '编辑设备 客厅电视', exact: true }).click();
  await dialog.getByRole('checkbox', { name: '允许全部孩子（含以后添加的档案）' }).uncheck();
  await dialog.getByRole('checkbox', { name: '芽芽', exact: true }).uncheck();
  await dialog.getByLabel('绑定孩子').click();
  await page.locator('.ant-select-dropdown:visible').getByText('暂不绑定孩子', { exact: true }).click();
  await dialog.getByRole('button', { name: /保\s*存/, exact: true }).click();
  await page.getByRole('button', { name: '确认保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(db.devices[0].allowedChildIds, []);
  assert.equal(db.devices[0].childId, null);
  checks.push(`${label} 设备按孩子授权、绑定范围校验、全部 null 与空范围 []`);
}

async function pluginChecks(page, db, label) {
  await page.goto(`${base}/plugins`);
  await page.getByRole('switch', { name: '启用插件 测试拼图插件' }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: '信任并启用' });
  assert.equal(await confirm.isDisabled(), true);
  await dialog.getByText('https://plugins.example/index.js', { exact: true }).waitFor();
  await dialog.getByText('网络访问', { exact: true }).waitFor();
  await dialog.getByRole('checkbox', { name: '我已核对来源和权限，信任此插件' }).check();
  await screenshot(page, `${label}-plugin-trust`);
  if (label === 'desktop') {
    db.plugins[0].permissions = ['network', 'storage', 'camera'];
    await confirm.click();
    await dialog.getByText('插件来源或权限已变化，请重新核对并勾选确认。', { exact: true }).waitFor();
    assert.equal(db.requests.filter((item) => item.path === '/api/plugins/example.puzzle' && item.method === 'PUT').length, 0);
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    assert.equal(await confirm.isDisabled(), true);
    await screenshot(page, 'desktop-plugin-permissions-changed');
    await dialog.getByRole('checkbox').check();
    checks.push('启用前声明变化会阻断提交并要求重新勾选');
  }
  await confirm.click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(db.plugins[0].enabled, true);
  checks.push(`${label} 插件来源/权限展示与勾选确认`);
}

try {
  await mkdir(artifacts, { recursive: true });
  server = spawn('pnpm', ['--filter', '@sprout/admin', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' },
  });
  server.stdout.on('data', (data) => logs.push(String(data)));
  server.stderr.on('data', (data) => logs.push(String(data)));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`临时后台启动失败：${logs.join('')}`);
    try { ready = (await fetch(`${base}/`)).ok; } catch {}
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, '临时后台启动超时');
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, locale: 'zh-CN', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    const db = fixtures();
    activePage = page;
    activeDb = db;
    await wire(page, db);
    await page.goto(`${base}/`);
    assert.equal(await page.getByRole('checkbox', { name: '在此设备保持登录' }).isChecked(), false);
    await screenshot(page, `${label}-session-login`);
    await login(page);
    assert.deepEqual(await storage(page), { session: 'test-only-admin-token', local: null, remember: null });
    await page.reload();
    await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
    await pluginChecks(page, db, label);
    await deviceChecks(page, db, label);
    if (label === 'desktop') {
      await page.goto(`${base}/plugins`);
      await page.getByRole('button', { name: /添加插件/ }).first().click();
      await page.locator('input[type=file]').setInputFiles({
        name: 'puzzle.zip', mimeType: 'application/zip',
        buffer: Buffer.from(zipSync({ 'plugin.json': strToU8(JSON.stringify(db.manifest)), 'index.js': strToU8('export default [];') })),
      });
      await page.getByRole('button', { name: /查看权限/ }).click();
      const trust = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /信任并安装/ }) });
      assert.equal(await trust.getByRole('button', { name: /信任并安装/ }).isDisabled(), true);
      assert.equal(db.requests.filter((item) => item.path === '/api/plugins/install').length, 0);
      await trust.getByText(`${origin}/plugins/example.puzzle/index.js`, { exact: true }).waitFor();
      await screenshot(page, 'desktop-zip-permissions');
      await trust.getByRole('checkbox').check();
      await trust.getByRole('button', { name: /信任并安装/ }).click();
      await trust.waitFor({ state: 'hidden' });
      assert.equal(db.requests.filter((item) => item.path === '/api/plugins/install').length, 1);
      checks.push('ZIP 安装前核对真实清单；未勾选不提交安装');

      db.manifest = { ...db.manifest, version: '1.2.0' };
      await page.getByRole('button', { name: /添加插件/ }).first().click();
      await page.getByRole('tab', { name: '远程地址' }).click();
      await page.getByLabel('plugin.json 地址', { exact: true }).fill('https://plugins.example/plugin.json');
      await page.getByRole('button', { name: /查看权限/ }).click();
      await trust.getByText('https://plugins.example/plugin.json', { exact: true }).waitFor();
      await screenshot(page, 'desktop-remote-permissions');
      await trust.getByRole('checkbox').check();
      db.mismatchInstall = true;
      await trust.getByRole('button', { name: /信任并安装/ }).click();
      await trust.getByText('服务端返回的权限或入口与刚才确认的清单不同，插件已停用，请刷新后重新核对。', { exact: true }).waitFor();
      assert.equal(db.plugins[0].enabled, false);
      await trust.getByRole('button', { name: /取\s*消/, exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: /取\s*消/, exact: true }).click();
      checks.push('远程清单请求不携带管理员凭据；服务端清单变化后自动停用');

      await page.goto(`${base}/devices`);
      await page.getByRole('button', { name: /添加设备/ }).first().click();
      let dialog = page.getByRole('dialog');
      await dialog.getByLabel('6 位配对码').fill('123456');
      await dialog.getByLabel('设备名称').fill('测试新电视');
      db.failPairScope = true;
      await dialog.getByRole('button', { name: /配对设备/ }).click();
      await page.getByRole('button', { name: '确认配对', exact: true }).click();
      await dialog.getByText('设备范围保存暂不可用', { exact: true }).waitFor();
      await screenshot(page, 'desktop-pair-scope-retry');
      await dialog.getByRole('button', { name: /保\s*存/, exact: true }).click();
      await page.getByRole('button', { name: '确认配对', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(db.requests.filter((item) => item.path === '/api/pair/approve').length, 1);
      checks.push('配对已成功而范围保存失败时，重试不重复配对');

      await page.goto(`${base}/lessons`);
      await page.getByRole('button', { name: '查看课程：一起慢慢呼吸', exact: true }).click();
      await page.getByText('置顶课程月龄提醒', { exact: true }).waitFor();
      await screenshot(page, 'desktop-pin-age-warning');
      await page.getByRole('button', { name: /置顶给孩子/ }).click();
      await page.getByRole('button', { name: /取消置顶/ }).waitFor();
      assert.ok(db.children[0].plan.pinned.includes(db.lesson.id));
      db.previewFailures = Infinity;
      await page.getByRole('button', { name: /预览课程/ }).click();
      const previewDialog = page.getByRole('dialog');
      await previewDialog.getByText('预览令牌暂不可用', { exact: true }).waitFor();
      assert.equal(await page.locator('iframe').count(), 0);
      db.previewFailures = 0;
      await previewDialog.getByRole('button', { name: /重\s*试/ }).click();
      await page.locator('iframe').waitFor();
      const src = await page.locator('iframe').getAttribute('src');
      const query = new URLSearchParams(new URL(src).hash.split('?')[1]);
      assert.equal(query.get('previewToken'), 'test-only-preview-token');
      assert.equal(query.has('token'), false);
      assert.equal(src.includes('test-only-admin-token'), false);
      assert.ok(db.events.indexOf('preview-token') < db.events.indexOf('iframe'));
      await screenshot(page, 'desktop-readonly-preview');
      checks.push('预览先签发短期令牌；签发失败不加载 iframe；无管理员 URL token');

      await page.goto(`${base}/children`);
      await page.locator('.family-child-item').first().getByRole('button', { name: /编\s*辑/ }).click();
      await page.getByText('置顶课程月龄提醒', { exact: true }).waitFor();
      await screenshot(page, 'desktop-child-pinned-warning');
      checks.push('孩子档案与课程详情两个置顶入口都提示月龄不符');
    }
    await context.close();
  }
  const persistent = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const page = await persistent.newPage();
  activePage = page;
  await wire(page, fixtures());
  await login(page, true);
  assert.deepEqual(await storage(page), { session: null, local: 'test-only-admin-token', remember: '1' });
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: /^退\s*出$/ }).click();
  await page.getByLabel('管理员密码', { exact: true }).waitFor();
  assert.deepEqual(await storage(page), { session: null, local: null, remember: null });
  await persistent.close();
  checks.push('明确勾选才持久登录；退出清除全部凭据');
  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, 'results.json'), JSON.stringify({ checks, screenshots, errors }, null, 2));
  console.log(`通过：${checks.length} 项后台安全交互验收，${screenshots.length} 张桌面/手机截图；API 与播放端使用契约桩。`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: resolve(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
    await writeFile(resolve(artifacts, 'failure.json'), JSON.stringify({
      message: error.message, url: activePage.url(), errors,
      text: await activePage.locator('body').innerText().catch(() => ''),
      storage: await storage(activePage).catch(() => null), requests: activeDb?.requests,
    }, null, 2));
  }
  throw error;
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    process.kill(-server.pid, 'SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise((done) => setTimeout(done, 3000))]);
    if (server.exitCode === null) {
      try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    }
  }
}
