import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const output = fileURLToPath(new URL('../test-artifacts/', import.meta.url));
await mkdir(output, { recursive: true });
const port = Number(process.env.SPROUT_CAPTURE_PORT || 5312);
const server = await createServer({
  configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  server: { port, strictPort: true },
});
let browser;
const records = [];
const failures = [];

try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
  });
  // 一个浏览器、一页，依次验证；不为每种活动并发启动浏览器。
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (event) => { if (event.type() === 'error') failures.push(event.text()); });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
  const types = await page.locator('.pg-sidebar nav small').allTextContents();
  assert.equal(types.length, 17);
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 1024, height: 768 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.locator('.pg-checkbox input').check();
    for (const type of types) {
      await page.locator('.pg-sidebar nav button').filter({
        has: page.locator('small', { hasText: new RegExp(`^${type}$`) }),
      }).click();
      await page.locator('.pg-stage .spa-stage').waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.pg-stage img')].every((image) => image.complete));
      if (type === 'web') {
        await page.frameLocator('.spa-web iframe').getByRole('button').waitFor();
      }
      await page.evaluate(() => document.fonts.ready);
      const info = await page.locator('.pg-stage').evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        const images = [...el.querySelectorAll('img')];
        const clipped = [...el.querySelectorAll('button, p, h2, h3')].filter((child) => {
          if (!child.getClientRects().length || child.closest('.spa-guide-reading')) return false;
          const b = child.getBoundingClientRect();
          return b.width > 0 && b.height > 0 &&
            (b.left < bounds.left - 3 || b.right > bounds.right + 3 || b.top < bounds.top - 3 || b.bottom > bounds.bottom + 3);
        }).map((child) => ({ class: child.className, text: child.textContent?.slice(0, 60) }));
        return {
          width: bounds.width, height: bounds.height, text: el.textContent,
          images: images.length, broken: images.filter((image) => image.naturalWidth === 0).map((image) => image.src),
          focusable: el.querySelectorAll('[data-focusable]').length,
          clipped,
        };
      });
      assert.ok(info.width > 100 && info.height > 100, `${type}: 舞台尺寸异常`);
      assert.deepEqual(info.broken, [], `${type}: 图片加载失败`);
      if (['word-cards', 'peekaboo', 'count', 'subitize', 'choose', 'sort', 'sequence', 'pattern', 'story', 'song', 'movement', 'guide'].includes(type)) {
        assert.ok(info.images > 0, `${type}: 主要素材没有渲染`);
      }
      assert.ok(info.focusable > 0, `${type}: 缺少焦点目标`);
      assert.notEqual(await page.locator('.pg-status').textContent(), '发生错误', `${type}: 预览异常`);
      const file = `${viewport.name}-${type}.png`;
      const screenshot = await page.locator('.pg-stage').screenshot({ path: `${output}${file}`, animations: 'disabled' });
      const colors = await page.evaluate(async (base64) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        const image = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 36;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 64, 36);
        const data = context.getImageData(0, 0, 64, 36).data;
        const unique = new Set();
        for (let i = 0; i < data.length; i += 4) unique.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        image.close();
        return unique.size;
      }, screenshot.toString('base64'));
      assert.ok(colors > 3, `${type}: 截图疑似空白`);
      records.push({ viewport: viewport.name, type, file, colors, ...info });
      console.log(`${viewport.name} ${type}: ${colors} colors, ${info.images} images`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.pg-sidebar nav button').filter({ has: page.locator('small', { hasText: /^song$/ }) }).click();
  await page.locator('.spa-song-controls .spa-action').first().click();
  await page.locator('.spa-song-note--current').waitFor();
  await page.locator('.spa-song-controls .spa-action').first().click();
  await page.locator('.pg-sidebar nav button').filter({ has: page.locator('small', { hasText: /^video$/ }) }).click();
  await page.locator('.spa-video-play').click();
  await page.waitForFunction(() => {
    const video = document.querySelector('.spa-video video');
    return video && !video.paused && video.currentTime > 0;
  });
  await page.locator('.pg-checkbox input').uncheck();
  await page.locator('.pg-sidebar nav button').filter({ has: page.locator('small', { hasText: /^contrast$/ }) }).click();
  await page.locator('.spa-contrast-pattern').waitFor();
  const movingBefore = await page.locator('.spa-contrast-pattern').first().evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(1100);
  const movingAfter = await page.locator('.spa-contrast-pattern').first().evaluate((el) => getComputedStyle(el).transform);
  assert.notEqual(movingBefore, movingAfter, '高对比卡缓慢漂移动画没有推进');
  await page.locator('.pg-sidebar nav button').filter({ has: page.locator('small', { hasText: /^guide$/ }) }).click();
  await page.locator('.spa-guide-start').click();
  await page.locator('.spa-guide--play').waitFor();
  assert.equal(await page.locator('.spa-guide').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(11, 11, 11)');
  await page.locator('.pg-stage').screenshot({ path: `${output}guide-dark.png`, animations: 'disabled' });
  await page.locator('.spa-guide-wake').click();
  await page.locator('.spa-guide-end').click();
  await page.locator('.pg-stage').screenshot({ path: `${output}guide-reaction.png`, animations: 'disabled' });
  await page.locator('.spa-guide-reactions button').first().click();
  assert.equal(await page.locator('.pg-status').textContent(), '已完成');
  assert.deepEqual(failures, [], '浏览器控制台错误');
} finally {
  try {
    await writeFile(`${output}capture.json`, JSON.stringify({ records, failures }, null, 2));
  } finally {
    await browser?.close();
    await server.close();
  }
}
