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

for (const file of ['../adb-frame.mjs', '../android-final.mjs', '../../../ios/scripts/ios-final.mjs']) {
  test(`运行标签不能越过验收目录：${file}`, () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), '--name', 'guard'], {
      encoding: 'utf8', timeout: 5000, env: { ...process.env, SPROUT_NATIVE_FINAL_RUN: '../escape' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AssertionError/);
    assert.doesNotMatch(result.stderr, /Command failed|adb.*not found/);
  });
}

test('iOS 续接拒绝无效 UDID，不能操作未核对设备', () => {
  const file = fileURLToPath(new URL('../../../ios/scripts/ios-final.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, SPROUT_NATIVE_FINAL_RUN: '', SPROUT_IOS_FINAL_UDID: 'booted' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /AssertionError/);
  assert.doesNotMatch(result.stderr, /Command failed/);
});
