import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const coreRoot = fileURLToPath(new URL('../../sprout-core/', import.meta.url));
const output = path.join(root, '.qa');
const playwright = await import(process.env.SPROUT_PLAYWRIGHT_MODULE || 'playwright');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await json(path.join(root, 'pack.json'));
const lexicon = await json(path.join(root, 'lexicon.json'));
const core = await json(path.join(coreRoot, 'lexicon.json'));
const concepts = new Map([
  ...core.concepts.map((concept) => [concept.id, { ...concept, root: coreRoot }]),
  ...lexicon.concepts.map((concept) => [concept.id, { ...concept, root }]),
]);
const images = new Map();
const addImage = (owner, file) => images.set(`${owner}:${file}`, { file, root: owner });
addImage(root, manifest.cover);
lexicon.concepts.forEach((concept) => addImage(root, concept.image));

function visit(value, reference = false) {
  if (typeof value === 'string' && reference && concepts.has(value)) {
    const concept = concepts.get(value);
    addImage(concept.root, concept.image);
  } else if (Array.isArray(value)) {
    value.forEach((item) => visit(item, reference));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      visit(item, ['concept', 'items', 'options', 'answer', 'item', 'sequence'].includes(key));
    }
  }
}

async function visitLessons(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visitLessons(file);
    else if (entry.name.endsWith('.json')) visit(await json(file));
  }
}
await visitLessons(path.join(root, manifest.lessonsDir));
await mkdir(output, { recursive: true });

const sources = [];
for (const image of images.values()) {
  sources.push({
    label: image.file,
    source: `data:image/svg+xml;base64,${(await readFile(path.join(image.root, image.file))).toString('base64')}`,
  });
}

const browser = await playwright.chromium.launch({
  headless: true,
  ...(process.env.SPROUT_BROWSER_PATH ? { executablePath: process.env.SPROUT_BROWSER_PATH } : {}),
  args: ['--disable-background-networking'],
});
const results = { images: [], audio: [], browserClosed: false };
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  await page.route('**/*', (route) => route.abort());
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><style>body{margin:16px;background:#dff1fb;color:#3b3226;font:14px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}figure{margin:0;min-width:0}img{display:block;width:100%;aspect-ratio:1;object-fit:contain}figcaption{overflow-wrap:anywhere;margin-top:8px}</style><main></main></html>');
    await page.evaluate((sources) => {
      const main = document.querySelector('main');
      for (const source of sources) {
        const figure = document.createElement('figure');
        const image = new Image();
        image.src = source.source;
        image.alt = source.label;
        const caption = document.createElement('figcaption');
        caption.textContent = source.label;
        figure.append(image, caption);
        main.append(figure);
      }
    }, sources);
    const pixels = await page.evaluate(async () => {
      const results = [];
      for (const image of document.images) {
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, 128, 128);
        const pixels = context.getImageData(0, 0, 128, 128).data;
        let opaque = 0;
        const colors = new Set();
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 64) {
            opaque++;
            colors.add(`${pixels[index] >> 5},${pixels[index + 1] >> 5},${pixels[index + 2] >> 5}`);
          }
        }
        const box = image.getBoundingClientRect();
        results.push({
          file: image.alt,
          opaque,
          colors: colors.size,
          framed: box.left >= 0 && box.right <= window.innerWidth && box.width > 0 && box.height > 0,
        });
      }
      return results;
    });
    for (const image of pixels) {
      assert.ok(image.opaque > 128, `${image.file} 空白`);
      assert.ok(image.colors >= 2, `${image.file} 缺少可辨图形`);
      assert.ok(image.framed, `${image.file} 超出视口`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(output, `images-${viewport.width}.png`), fullPage: true });
    results.images.push({ viewport, count: pixels.length, pixels });
  }

  const audio = await json(path.join(root, 'audio/manifest.json'));
  await page.evaluate(() => { window.sproutAudioCheck = new AudioContext(); });
  try {
    for (const [key, file] of Object.entries(audio.entries)) {
      const bytes = await readFile(path.join(root, file));
      const result = await page.evaluate(async (encoded) => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const buffer = await window.sproutAudioCheck.decodeAudioData(bytes.buffer);
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
        }
        return { duration: buffer.duration, channels: buffer.numberOfChannels, peak };
      }, bytes.toString('base64'));
      assert.ok(result.duration > 0 && result.duration < 60, `${key} 时长异常`);
      assert.ok(result.channels > 0 && result.peak > 0.001, `${key} 无有效声音`);
      results.audio.push({ key, file, ...result });
    }
  } finally {
    await page.evaluate(async () => {
      await window.sproutAudioCheck.close();
      delete window.sproutAudioCheck;
    });
  }
  await page.close();
} finally {
  await browser.close();
  results.browserClosed = !browser.isConnected();
  await writeFile(path.join(output, 'media-check.json'), `${JSON.stringify(results, null, 2)}\n`);
}
assert.equal(results.browserClosed, true);
console.log(`图片：${sources.length} 张，两个视口均渲染非空且无横向溢出。`);
console.log(`音频：${results.audio.length} 条均可解码且包含非静音样本；未向扬声器播放。`);
console.log('临时浏览器与 AudioContext 已关闭；没有启动服务。');
