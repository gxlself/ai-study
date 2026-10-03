import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { isMain, PLAYER_ROOT, RESOURCE_ROOT } from './native-utils.mjs';

export async function generateAssets() {
  const logo = await readFile(join(RESOURCE_ROOT, 'sprout.svg'), 'utf8');
  const banner = await readFile(join(RESOURCE_ROOT, 'banner.svg'), 'utf8');
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`;
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}),
    args: ['--disable-background-networking', '--disable-component-update'],
  });
  const generated = join(RESOURCE_ROOT, 'generated');
  await mkdir(generated, { recursive: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    async function png(width, height, html, path, transparent = false) {
      await mkdir(join(path, '..'), { recursive: true });
      await page.setViewportSize({ width, height });
      await page.setContent(`<html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}img{display:block}</style></head><body>${html}</body></html>`);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map((image) => image.decode()));
      });
      await page.screenshot({ path, omitBackground: transparent });
    }
    const icon = `<div style="width:100%;height:100%;background:#fdf6ec;display:grid;place-items:center"><img src="${dataUrl}" style="width:88%;height:88%"></div>`;
    const foreground = `<div style="width:100%;height:100%;display:grid;place-items:center"><img src="${dataUrl}" style="width:68%;height:68%"></div>`;
    for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
      const target = join(PLAYER_ROOT, `android/app/src/main/res/mipmap-${density}`);
      const size = 48 * scale;
      await png(size, size, icon, join(target, 'ic_launcher.png'));
      await copyFile(join(target, 'ic_launcher.png'), join(target, 'ic_launcher_round.png'));
      await png(108 * scale, 108 * scale, foreground, join(target, 'ic_launcher_foreground.png'), true);
    }
    await png(320, 180, banner, join(generated, 'banner.png'));
    await mkdir(join(PLAYER_ROOT, 'android/app/src/main/res/drawable-xhdpi'), { recursive: true });
    await copyFile(join(generated, 'banner.png'), join(PLAYER_ROOT, 'android/app/src/main/res/drawable-xhdpi/banner.png'));
    const mark = `<img src="${dataUrl}" style="width:100%;height:100%">`;
    await png(288, 288, foreground, join(PLAYER_ROOT, 'android/app/src/main/res/drawable-nodpi/sprout_splash_icon.png'), true);
    await png(1024, 1024, icon, join(generated, 'app-icon-1024.png'));
    const assets = join(PLAYER_ROOT, 'ios/App/App/Assets.xcassets');
    await copyFile(join(generated, 'app-icon-1024.png'), join(assets, 'AppIcon.appiconset/AppIcon-512@2x.png'));
    await png(256, 256, mark, join(assets, 'SproutMark.imageset/sprout.png'), true);
    await png(512, 512, mark, join(assets, 'SproutMark.imageset/sprout@2x.png'), true);
    await png(768, 768, mark, join(assets, 'SproutMark.imageset/sprout@3x.png'), true);
    await writeFile(join(assets, 'SproutMark.imageset/Contents.json'), JSON.stringify({
      images: [1, 2, 3].map((scale) => ({
        idiom: 'universal', filename: scale === 1 ? 'sprout.png' : `sprout@${scale}x.png`, scale: `${scale}x`,
      })),
      info: { author: 'xcode', version: 1 },
    }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
  console.info('已生成 Android launcher/adaptive/banner 与 iOS AppIcon/启动屏小芽。');
}

if (isMain(import.meta.url)) {
  generateAssets().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
