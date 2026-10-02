import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = resolve(root, 'test-artifacts');
const externalUrl = process.env.SPROUT_ADMIN_URL;
const port = Number(process.env.SPROUT_ADMIN_PORT ?? 5411);
const base = externalUrl ?? `http://127.0.0.1:${port}/admin`;
let server;
let browser;
const errors = [];
const screenshots = [];
const logs = [];
const playModule = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(playModule ? pathToFileURL(playModule).href : 'playwright').catch(() => {
  throw new Error('需要 Playwright。可用 PLAYWRIGHT_MODULE=/绝对路径/playwright/index.mjs 指向已安装的工具，不必改工作区依赖。');
});

async function ready() {
  for (let index = 0; index < 240; index++) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) throw new Error(`开发服务器未启动：${logs.join('')}`);
    try { const response = await fetch(`${base}/`); if (response.ok) return; } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error('开发服务器启动超时');
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true });
  screenshots.push(name);
  const overflow = await page.evaluate(() => ({
    width: innerWidth, actual: document.documentElement.scrollWidth,
    failedImages: [...document.images].filter((image) => image.currentSrc && image.complete && image.naturalWidth === 0).map((image) => image.currentSrc),
  }));
  if (overflow.actual > overflow.width + 2) errors.push(`${name}: 页面横向溢出 ${overflow.actual}/${overflow.width}`);
  if (overflow.failedImages.length) errors.push(`${name}: 图片加载失败 ${overflow.failedImages.length}`);
}

async function login(page, setup = false) {
  await page.goto(`${base}/?mock=1${setup ? '&setup=1' : ''}`);
  await page.getByRole('heading', { name: setup ? '开启一家人的成长旅程' : '欢迎回家' }).waitFor();
  if (setup) {
    await page.getByLabel('家庭名', { exact: true }).fill('冒烟验收家庭');
    await page.getByLabel('管理员密码', { exact: true }).fill('sprout-demo');
    await page.getByLabel('再次输入密码', { exact: true }).fill('sprout-demo');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByLabel('孩子名字', { exact: true }).fill('冒烟宝宝');
    await page.getByLabel('生日', { exact: true }).fill('2025-04-02');
    await page.getByLabel('生日', { exact: true }).press('Enter');
  } else {
    await page.getByLabel('管理员密码', { exact: true }).fill('sprout-demo');
    await page.getByRole('button', { name: /登\s*录/ }).click();
  }
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
}

try {
  await mkdir(artifacts, { recursive: true });
  if (!externalUrl) {
    server = spawn('pnpm', ['--filter', '@sprout/admin', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
      cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false' },
    });
    server.stdout.on('data', (data) => logs.push(String(data)));
    server.stderr.on('data', (data) => logs.push(String(data)));
  }
  await ready();
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const page = await desktop.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const pages = [
    ['', 'dashboard'], ['children', 'children'], ['route', 'route'], ['lessons', 'lessons'],
    ['lessons/new', 'editor'], ['lexicon', 'lexicon'], ['milestones', 'milestones'],
    ['sessions', 'sessions'], ['packs', 'packs'], ['plugins', 'plugins'],
    ['devices', 'devices'], ['settings', 'settings'],
    ['print/lesson/core.s3.animal-friends', 'print-lesson'],
    ['print/theme/s4.discover', 'print-theme'],
    ['print/lesson/custom.contrast-print', 'print-contrast'],
  ];
  for (const [route, name] of pages) {
    await page.goto(`${base}/${route}?mock=1`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(550);
    if (await page.getByText('这个页面暂时无法打开', { exact: true }).count()) errors.push(`${name}: 错误边界被触发`);
    await shot(page, `desktop-${name}`);
    if (name.startsWith('print-')) {
      if (await page.locator('.app-sidebar').count()) errors.push(`${name}: 打印页带了后台框架`);
      await page.getByRole('button', { name: /打\s*印/ }).waitFor();
      await page.emulateMedia({ media: 'print' });
      const printState = await page.evaluate(() => ({
        toolbar: getComputedStyle(document.querySelector('.print-toolbar')).display,
        cardCounts: [...document.querySelectorAll('.print-card-page')].map((sheet) => sheet.querySelectorAll('.print-card').length),
        contrastCount: document.querySelectorAll('.print-contrast-page svg').length,
      }));
      if (printState.toolbar !== 'none') errors.push(`${name}: 打印时工具栏未隐藏`);
      if (name === 'print-contrast' && printState.contrastCount !== 2) errors.push('高对比打印未生成每图独占一页');
      await page.screenshot({ path: resolve(artifacts, `print-media-${name}.png`), fullPage: true });
      await writeFile(resolve(artifacts, `${name}-layout.json`), JSON.stringify(printState, null, 2));
      await page.emulateMedia({ media: 'screen' });
    }
  }
  await page.goto(`${base}/children?mock=1`);
  await page.locator('.family-child-item').first().getByRole('button', { name: /编\s*辑/ }).click();
  await page.getByLabel('孩子侧屏幕模式', { exact: true }).click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '开启亲子共看' }).click();
  await page.getByText('18–23 个月的亲子共看提醒', { exact: true }).waitFor();
  await shot(page, 'desktop-child-screen-mode');
  const birthday = new Date();
  birthday.setFullYear(birthday.getFullYear() - 1);
  await page.getByLabel('生日', { exact: true }).fill(`${birthday.getFullYear()}-${String(birthday.getMonth() + 1).padStart(2, '0')}-${String(birthday.getDate()).padStart(2, '0')}`);
  await page.getByLabel('生日', { exact: true }).press('Enter');
  await page.getByLabel('孩子侧屏幕模式', { exact: true }).click();
  const disabledOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '开启亲子共看' });
  if (!(await disabledOption.getAttribute('class'))?.includes('disabled')) errors.push('18 个月以下的孩子可开启共看');
  await page.getByLabel('孩子侧屏幕模式', { exact: true }).press('Escape');
  await page.locator('.ant-drawer-close').click();

  await page.goto(`${base}/lessons/new?mock=1`);
  await page.getByRole('heading', { name: '新建课程', exact: true }).waitFor();
  await page.getByLabel('选择活动类型', { exact: true }).click();
  const parentOptions = await page.locator('.ant-select-dropdown:visible .ant-select-item-option').allTextContents();
  const disallowedParentOptions = ['图像词卡', '躲猫猫', '戳泡泡', '找一找', '数一数', '绘本故事']
    .filter((name) => parentOptions.some((text) => text.includes(name)));
  if (disallowedParentOptions.length || !parentOptions.some((text) => text.includes('亲子活动指引')) || !parentOptions.some((text) => text.includes('儿歌'))) {
    errors.push('家长指引课的活动列表不只包含 guide/song');
  }
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '亲子活动指引' }).click();
  await page.locator('.content-add-step').getByRole('button', { name: /添加步骤/ }).click();
  for (const [path, text] of [
    ['title.zh', '冒烟验收家长课'], ['objectives.0.zh', '面对面陪玩'], ['parentGuide.intro', '准备实体卡，放下手机后陪玩。'],
    ['steps.0.props.goal', '和宝宝一起观察小熊。'], ['steps.0.props.steps.0.text', '放好实体卡，等待宝宝回应。'],
    ['offline.0.title', '一起看卡片'], ['offline.0.steps.0', '面对面和宝宝一起看卡片。'],
  ]) {
    await page.locator(`[data-content-path="${path}"]`).locator('input, textarea').first().fill(text);
  }
  await page.getByRole('button', { name: /添加打印材料/ }).click();
  await page.getByLabel('打印材料 1 标题', { exact: true }).fill('陪玩实体卡');
  await page.getByLabel('打印材料 1 词条', { exact: true }).click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '小熊' }).click();
  await page.getByLabel('打印材料 1 词条', { exact: true }).press('Escape');
  await page.getByRole('button', { name: /保存课程/ }).click();
  await page.getByRole('heading', { name: '编辑课程', exact: true }).waitFor();
  await shot(page, 'desktop-editor-guide-saved');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const mobilePage = await mobile.newPage();
  mobilePage.setDefaultTimeout(120000);
  mobilePage.setDefaultNavigationTimeout(120000);
  mobilePage.on('pageerror', (error) => errors.push(error.message));
  await login(mobilePage);
  for (const [route, name] of pages) {
    await mobilePage.goto(`${base}/${route}?mock=1`);
    await mobilePage.getByRole('heading', { level: 1 }).waitFor();
    await mobilePage.waitForTimeout(450);
    await shot(mobilePage, `mobile-${name}`);
  }
  await mobilePage.goto(`${base}/?mock=1`);
  await mobilePage.getByRole('button', { name: '打开导航', exact: true }).click();
  await mobilePage.getByRole('navigation', { name: '移动主导航' }).waitFor();
  await shot(mobilePage, 'mobile-navigation');
  await mobile.close();

  const setup = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const setupPage = await setup.newPage();
  setupPage.setDefaultTimeout(120000);
  setupPage.setDefaultNavigationTimeout(120000);
  setupPage.on('pageerror', (error) => errors.push(error.message));
  await login(setupPage, true);
  await shot(setupPage, 'mobile-setup-complete');
  await setup.close();
  await writeFile(resolve(artifacts, 'smoke-results.json'), JSON.stringify({ base, screenshots, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`通过：${screenshots.length} 张桌面/手机截图；首次设置、登录、全部页面、移动导航；无运行时异常、图片缺失或页面横向溢出。`);
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    process.kill(-server.pid, 'SIGTERM');
    await Promise.race([once(server, 'exit'), new Promise((done) => setTimeout(done, 5000))]);
    if (server.exitCode === null) {
      try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    }
  }
}
