import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { assertNoSymlinkAncestors, assertWithin, isMain, listFiles, PLAYER_ROOT } from './files.mjs';

const START = '/* SPROUT_PRECACHE_START */';
const END = '/* SPROUT_PRECACHE_END */';
const ASSET_EXTENSIONS = new Set([
  '.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.m4a', '.mp4', '.ogg', '.wav', '.aac', '.wasm', '.webmanifest',
]);

function isPrecacheFile(path) {
  if (path === 'index.html') return true;
  const parts = path.split('/');
  if (parts.some((part) => part.startsWith('.')) || path === 'sw.js') return false;
  if (parts.length > 1 && !['assets', 'bundled'].includes(parts[0])) return false;
  if (path.startsWith('bundled/packs/sprout.custom/')) return false;
  return ASSET_EXTENSIONS.has(extname(path).toLowerCase());
}

export async function writeSwManifest({
  distDir = join(PLAYER_ROOT, 'dist'),
  templatePath = join(PLAYER_ROOT, 'public/sw.js'),
  logger = console,
} = {}) {
  assertWithin(PLAYER_ROOT, distDir);
  await assertNoSymlinkAncestors(join(distDir, 'sw.js'));
  const files = (await listFiles(distDir)).filter(isPrecacheFile);
  if (!files.includes('index.html')) throw new Error('缺少 dist/index.html，请先运行 Vite build。');
  if (!files.includes('bundled/packs/sprout.core/bundle.json')) {
    throw new Error('缺少内置 bundle.json，请先运行 copy-bundled.mjs，再运行 Vite build。');
  }
  if (!files.some((path) => path.startsWith('assets/') && /\.(?:m?js)$/.test(path))) {
    throw new Error('缺少编译后的 JS 资源；不能将开发 HTML 当作可离线构建。');
  }
  const template = await readFile(templatePath, 'utf8');
  const start = template.indexOf(START);
  const end = template.indexOf(END);
  if (start < 0 || end < start || template.indexOf(START, start + START.length) !== -1 ||
      template.indexOf(END, end + END.length) !== -1) {
    throw new Error('sw.js 的预缓存占位区不完整或重复。');
  }
  const digest = createHash('sha256').update(template);
  for (const path of files) {
    const bytes = await readFile(join(distDir, path));
    digest.update(JSON.stringify([path, bytes.length])).update(bytes);
  }
  const build = {
    version: digest.digest('hex').slice(0, 20),
    files: files.map((path) => path.split('/').map(encodeURIComponent).join('/')),
  };
  const output = template.slice(0, start) + START + '\nconst BUILD = ' +
    JSON.stringify(build, null, 2) + ';\n' + template.slice(end);
  // 只写构建产物；public/sw.js 始终保留可审查的源码模板。
  await writeFile(join(distDir, 'sw.js'), output);
  logger.info(`[write-sw-manifest] ${files.length} 个同源文件，版本 ${build.version} → ${join(distDir, 'sw.js')}`);
  return build;
}

if (isMain(import.meta.url)) {
  writeSwManifest().catch((error) => {
    console.error(`[write-sw-manifest] ${error.message}`);
    process.exitCode = 1;
  });
}
