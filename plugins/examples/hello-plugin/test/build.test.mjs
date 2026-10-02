import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

test('构建 ZIP 仅含清单和无外部导入的 ESM，默认导出可加载', async () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build.mjs'], { cwd, stdio: 'pipe' });
  const zip = unzipSync(await readFile(new URL('../dist/example.hello-1.0.0.zip', import.meta.url)));
  assert.deepEqual(Object.keys(zip).sort(), ['index.js', 'plugin.json']);
  assert.equal(JSON.parse(strFromU8(zip['plugin.json'])).entry, 'index.js');
  const module = await import(`data:text/javascript;base64,${Buffer.from(zip['index.js']).toString('base64')}`);
  assert.equal(module.default.type, 'example.hello-stars');
  assert.equal(typeof module.default.mount, 'function');
  assert.equal(typeof module.default.speeches, 'function');
});
