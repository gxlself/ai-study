import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pack = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(path.join(repo, 'apps/player/package.json'));
const { chromium } = require('@playwright/test');
const sources = JSON.parse(await readFile(path.join(pack, 'assets/sources.json'), 'utf8'));
const assets = await Promise.all(Object.keys(sources.items).map(async (file) => ({
  file, svg: await readFile(path.join(pack, file), 'utf8'),
})));
const output = path.join(pack, '.qa/screenshots');
await mkdir(output, { recursive: true });
let browser;
const results = [];

try {
  browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.setContent(`<!doctype html><html lang="zh"><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;padding:20px;background:#e7f0eb;color:#3b3226;font:16px system-ui}
        main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
        figure{margin:0;min-width:0}img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#fffaf2}
        figcaption{padding-top:8px;overflow-wrap:anywhere;line-height:1.5}
        @media(max-width:600px){main{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
      </style><main>${assets.map(({ file, svg }) =>
        `<figure><img alt="${file}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"><figcaption>${path.basename(file)}</figcaption></figure>`,
      ).join('')}</main></html>`);
      await page.locator('img').evaluateAll(async (images) => {
        await Promise.all(images.map((image) => image.decode()));
      });
      const pixels = await page.locator('img').evaluateAll((images) => images.map((image) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 128, 128);
        const data = context.getImageData(0, 0, 128, 128).data;
        let opaque = 0;
        for (let index = 3; index < data.length; index += 4) if (data[index] > 64) opaque++;
        return { file: image.alt, loaded: image.complete && image.naturalWidth > 0, opaque };
      }));
      pixels.forEach((image) => {
        assert.equal(image.loaded, true, image.file);
        assert.ok(image.opaque > 700, `空白素材：${image.file}`);
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, `${viewport.width}x${viewport.height}.png`), fullPage: true });
      results.push({ viewport, pixels, pageErrors: errors });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
}
await writeFile(path.join(output, 'report.json'), `${JSON.stringify({ results, browserClosed: true }, null, 2)}\n`);
console.log(JSON.stringify({ viewports: results.map((result) => result.viewport), assets: assets.length, browserClosed: true }, null, 2));
