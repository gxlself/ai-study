import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frame = fileURLToPath(new URL('../adb-frame.mjs', import.meta.url));
for (const [name, args] of [
  ['截图名称不能越过验收目录', ['--name', '../escape']],
  ['只允许遥控器验收按键', ['--name', 'guard', '--keys', '3']],
  ['拒绝非数字按键', ['--name', 'guard', '--keys', 'NaN']],
  ['等待时间必须有界', ['--name', 'guard', '--wait', '185001']],
]) {
  test(name, () => {
    const result = spawnSync(process.execPath, [frame, ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AssertionError/);
    assert.doesNotMatch(result.stderr, /Command failed|adb.*not found/);
  });
}
