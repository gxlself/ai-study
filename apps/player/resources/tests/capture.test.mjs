import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeIOSCapture } from '../normalize-ios-capture.mjs';

test('方向校正保留原始像素文件，仅交换输出宽高', { skip: process.platform !== 'darwin' }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sprout-capture-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const raw = join(root, 'raw.png');
  const target = join(root, 'rotated.png');
  await copyFile(new URL('../generated/banner.png', import.meta.url), raw);
  const before = await readFile(raw);
  assert.deepEqual(await normalizeIOSCapture(raw, target, 90), [180, 320]);
  assert.deepEqual(await readFile(raw), before);
});

test('拒绝不属于正交方向的截图变换', async () => {
  await assert.rejects(normalizeIOSCapture('/unused', '/unused-target', 45), /仅支持/);
});
