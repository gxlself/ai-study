import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { PluginManifest } from '@sprout/schema';

// 复用工作区预装工具，不安装依赖，也不修改根 package.json 或锁文件。
const tools = createRequire(new URL('../../../../packages/activities/package.json', import.meta.url));
// tsx 会把本例的 vite 类型映射当作解析结果；从包清单读取真实 ESM 入口。
const vitePackageUrl = pathToFileURL(tools.resolve('vite/package.json'));
const vitePackage = JSON.parse(await readFile(vitePackageUrl, 'utf8'));
const { build } = await import(new URL(vitePackage.exports['.'], vitePackageUrl).href);
const manifest = PluginManifest.parse(JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8')));
const builds = await build({
  configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  build: { write: false },
});
const outputs = (Array.isArray(builds) ? builds : [builds]).flatMap((item) => item.output ?? []);
if (outputs.length !== 1 || outputs[0].type !== 'chunk' || outputs[0].fileName !== 'index.js') {
  throw new Error('插件必须仅产出一个 index.js，不允许额外 chunk 或 CSS');
}
const entry = outputs[0];
if (entry.imports.length || entry.dynamicImports.length || !entry.exports.includes('default')) {
  throw new Error('插件必须有默认导出且不能依赖外部模块');
}
const dist = new URL('../dist/', import.meta.url);
await mkdir(dist, { recursive: true });
const json = `${JSON.stringify(manifest, null, 2)}\n`;
const files = { 'plugin.json': strToU8(json), 'index.js': strToU8(entry.code) };
const mtime = new Date('2026-01-01T00:00:00Z');
const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { mtime }]])), { level: 9 });
if (Object.keys(unzipSync(zip)).sort().join(',') !== 'index.js,plugin.json') throw new Error('ZIP 文件列表不正确');
await Promise.all([
  writeFile(new URL('index.js', dist), entry.code),
  writeFile(new URL('plugin.json', dist), json),
  writeFile(new URL(`${manifest.id}-${manifest.version}.zip`, dist), zip),
]);
console.log(`已构建 dist/${manifest.id}-${manifest.version}.zip (${zip.length} bytes)`);
