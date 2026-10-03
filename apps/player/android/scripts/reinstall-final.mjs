import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const serial = process.env.SPROUT_ANDROID_SERIAL || 'emulator-5582';
assert.match(serial, /^emulator-\d+$/);
const adb = join(process.env.ANDROID_HOME || join(process.env.HOME, 'Library/Android/sdk'), 'platform-tools/adb');
const args = ['-P', process.env.SPROUT_ADB_PORT || '5049', '-s', serial];
const exec = promisify(execFile);
const command = async (...parts) => (await exec(adb, [...args, ...parts], { timeout: 240000 })).stdout.trim();
const { version } = JSON.parse(await readFile(join(root, 'apps/player/package.json'), 'utf8'));
const apk = join(root, 'release', `sprout-player-${version}-release.apk`);
const sha256 = createHash('sha256').update(await readFile(apk)).digest('hex');
assert.equal(await command('get-state'), 'device');
await command('shell', 'am', 'force-stop', 'com.sprout.growth');
const install = await command('install', '-r', apk);
assert.match(install, /Success/);
const installedPath = (await command('shell', 'pm', 'path', 'com.sprout.growth')).replace(/^package:/, '');
assert.match(installedPath, /^\/data\/app\/.+\/base\.apk$/);
const { stdout } = await exec(adb, [...args, 'exec-out', 'cat', installedPath], {
  encoding: 'buffer', timeout: 240000, maxBuffer: 64 * 1024 * 1024,
});
const installedSha256 = createHash('sha256').update(stdout).digest('hex');
assert.equal(installedSha256, sha256, '设备内 APK 与最终 release 不一致。');
const report = { installedAt: new Date().toISOString(), serial, variant: 'release', sha256, installedSha256, install, ok: true };
await writeFile(join(root, 'apps/player/test-artifacts/android-final/reinstall.json'), JSON.stringify(report, null, 2) + '\n');
console.info(JSON.stringify(report));
