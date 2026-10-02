import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, expect: baseExpect } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const expect = baseExpect.configure({ timeout: 30_000 });
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, 'test-artifacts');
const bundle = JSON.parse(await readFile(join(root, 'dev-fixtures/sprout.core/bundle.json'), 'utf8'));
const base = process.env.SPROUT_PLAYER_URL || 'http://127.0.0.1:5310/';
const server = new URL(base).origin;
const now = '2026-10-02T01:00:00.000Z';
const deviceToken = 'protocol-test-device-token';
const adminToken = 'protocol-test-preview-token';
const child = {
  id: 'protocol-child', name: '小芽', birthday: '2024-09-30', languageMode: 'zh-en', showPinyin: false,
  createdAt: now, updatedAt: now,
  screen: { sessionMaxMin: 10, dailyMaxMin: 20, windows: [], mode: 'co-view', distanceReminder: false },
  plan: { routeId: 'sprout.core.route', themeId: null, pinned: [], skipped: [], focusDomains: [] },
};
const screen = { usedSec: 0, dailyMaxSec: 1200, sessionMaxSec: 600, allowedNow: true, coView: 'required', mode: 'co-view' };
const pack = {
  ...bundle.manifest, enabled: true, source: 'builtin', baseUrl: '/bundled/packs/sprout.core/',
  lessonCount: bundle.lessons.length, conceptCount: bundle.lexicon.concepts.length,
  routeIds: bundle.routes.map((route) => route.id),
};
const summaries = bundle.lessons.map((lesson) => ({
  ...lesson, packId: 'sprout.core', hasPrintables: !!lesson.printables?.length,
  stepTypes: lesson.steps.map((step) => step.type),
  cover: { ...lesson.cover, imageUrl: `${server}/bundled/packs/sprout.core/${lesson.cover.image}` },
}));
const requests = [];
let bound = false;
let pairingReads = 0;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, timeout: 120_000, args: ['--renderer-process-limit=2'],
});
await mkdir(artifacts, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date(now) });
  await context.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); });
  await context.route(`${server}/api/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ method: request.method(), path });
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (path === '/api/health') return json({ ok: true, version: 'test', time: now });
    if (path === '/api/pair/start') return json({ pairingId: 'protocol-pair', code: '123456', expiresAt: '2026-10-02T01:10:00.000Z' });
    if (path === '/api/pair/protocol-pair') {
      pairingReads += 1;
      return json({ status: 'approved', ...(pairingReads === 1 ? { deviceToken, deviceId: 'protocol-device' } : {}) });
    }
    const authorization = request.headers().authorization;
    assert.ok(authorization === `Bearer ${deviceToken}` || authorization === `Bearer ${adminToken}`);
    if (path === '/api/device/bootstrap') return json({
      serverTime: now, child: bound ? child : null, children: [child], packs: [pack], plugins: [],
      device: { id: 'protocol-device', name: '测试播放端', kind: 'tablet', childId: bound ? child.id : null, createdAt: now, lastSeenAt: now },
      settings: { familyName: '测试家庭', ttsVoices: {} },
    });
    if (path === '/api/device/child' && request.method() === 'PUT') { assert.equal(request.postDataJSON().childId, child.id); bound = true; return json({ ok: true }); }
    if (path === '/api/packs') return json([pack]);
    if (path === '/api/plugins') return json([]);
    if (path === '/api/routes') return json(bundle.routes.map(({ id, title }) => ({ id, title, packId: 'sprout.core' })));
    if (path === '/api/routes/sprout.core.route') return json(bundle.routes[0]);
    if (path === '/api/lexicon') return json(bundle.lexicon.concepts.map((concept) => ({
      ...concept, packId: 'sprout.core', imageUrl: `/bundled/packs/sprout.core/${concept.image}`,
    })));
    if (path === '/api/lessons') return json(summaries);
    if (path.startsWith('/api/lessons/')) {
      const lesson = bundle.lessons.find(({ id }) => id === decodeURIComponent(path.slice('/api/lessons/'.length)));
      return json({ lesson, packId: 'sprout.core', baseUrl: '/bundled/packs/sprout.core/', issues: [] });
    }
    if (path.endsWith('/screen')) return json(screen);
    if (path.endsWith('/today')) return json({
      date: '2026-10-02', child: { id: child.id, name: child.name, ageMonths: 24, ageDays: 732 },
      route: { id: 'sprout.core.route', title: bundle.routes[0].title }, stage: null, theme: null,
      items: summaries.filter((lesson) => lesson.audience === 'child').map((lesson) => ({ lessonId: lesson.id, reason: 'theme', lesson })), screen,
    });
    if (path === '/api/sessions') return json({ error: { message: '预览不得记录' } }, 500);
    return json({ error: { message: '未设置测试接口' } }, 404);
  });
  await page.goto(base);
  await page.getByRole('button', { name: '连接家庭服务器', exact: true }).tap();
  await page.getByRole('textbox', { name: '完整服务器地址', exact: true }).fill(server);
  await page.getByRole('button', { name: '确认', exact: true }).tap();
  await expect(page.locator('.pair-code')).toHaveAttribute('aria-label', '配对码 123456');
  await page.clock.fastForward(2100);
  await expect(page.getByRole('heading', { name: '谁的小旅程？' })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('sprout.deviceToken')), deviceToken);
  await page.getByRole('button', { name: '小芽', exact: true }).tap();
  await expect(page.getByRole('heading', { name: '今天的小旅程' })).toBeVisible();
  assert.equal(pairingReads, 1);
  await page.screenshot({ path: join(artifacts, 'protocol-remote-home.png'), fullPage: true });

  await page.getByRole('button', { name: '家长菜单', exact: true }).tap();
  const first = (await page.locator('.gate-sequence').getAttribute('aria-label')).split('、')[0];
  await page.getByRole('dialog').getByRole('button', { name: first === '上' ? '下' : '上', exact: true }).tap();
  await expect(page.locator('.gate-status')).toHaveText('再试一组');
  for (const name of (await page.locator('.gate-sequence').getAttribute('aria-label')).split('、')) {
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).tap();
  }
  await expect(page.getByRole('heading', { name: '家长菜单', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '回到首页', exact: true }).tap();
  await page.getByRole('button', { name: '家长菜单', exact: true }).tap();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForLoadState('networkidle');

  const previewStart = requests.length;
  const previewUrl = `${base}#/preview?server=${encodeURIComponent(server)}&token=${adminToken}&mode=zh&age=6`;
  await context.route('**/protocol-frame-host.html', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0"><iframe id="preview" style="width:1024px;height:768px;border:0" src="${previewUrl}"></iframe></body></html>`,
  }));
  await page.goto(`${server}/protocol-frame-host.html`);
  const frame = page.frameLocator('#preview');
  await expect(frame.getByText('等待预览课程', { exact: true })).toBeVisible();
  const draft = { ...bundle.lessons[0], title: { zh: '未保存的草稿' }, steps: [{ type: 'example.uninstalled', props: {} }] };
  await page.evaluate(({ lesson, origin }) => document.querySelector('iframe').contentWindow.postMessage({ type: 'sprout:preview', lesson, packId: 'sprout.core' }, origin), { lesson: draft, origin: server });
  await expect(frame.getByRole('heading', { name: '未保存的草稿' })).toBeVisible();
  await frame.getByRole('button', { name: '开始', exact: true }).tap();
  await expect(frame.getByText('需要安装插件 example.uninstalled')).toBeVisible();
  await page.clock.fastForward(600_000);
  await expect(frame.getByText('需要安装插件 example.uninstalled')).toBeVisible();
  await expect(frame.getByRole('dialog')).toHaveCount(0);
  await frame.getByRole('button', { name: '跳过', exact: true }).tap();
  await expect(frame.getByRole('heading', { name: '你今天看得真认真！' })).toBeVisible();
  await page.screenshot({ path: join(artifacts, 'protocol-preview.png'), fullPage: true });
  const previewRequests = requests.slice(previewStart);
  assert.equal(previewRequests.filter(({ path }) => path === '/api/device/bootstrap').length, 0);
  assert.equal(requests.filter(({ path }) => path === '/api/sessions').length, 0);
  const savedToken = await frame.locator('body').evaluate(() => localStorage.getItem('sprout.deviceToken'));
  assert.equal(savedToken, deviceToken);
  assert.deepEqual(errors, []);
  const result = { pairing: 'approved-once', childSelected: bound, gateWrongRetry: true, gateIdleClose: true, unsavedPreview: true, previewUnlimited: true, previewSessionWrites: 0, errors };
  await writeFile(join(artifacts, 'protocol-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await context.close();
} finally {
  await browser.close();
}
