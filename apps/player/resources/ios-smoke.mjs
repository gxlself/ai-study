import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { isMain, PLAYER_ROOT } from './native-utils.mjs';
import { normalizeIOSCapture } from './normalize-ios-capture.mjs';

const exec = promisify(execFile);
export async function iosSmoke(env = process.env) {
  const app = join(PLAYER_ROOT, 'ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app');
  if (!existsSync(app)) throw new Error('请先执行 ios:build。');
  const command = async (...args) => (await exec('xcrun', ['simctl', ...args], { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
  const inventory = JSON.parse(await command('list', '--json'));
  const type = inventory.devicetypes.find((item) => item.name === 'iPad (A16)') ??
    inventory.devicetypes.find((item) => item.name.startsWith('iPad '));
  const runtime = inventory.runtimes.filter((item) => item.isAvailable && item.name.startsWith('iOS '))
    .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }))[0];
  if (!type || !runtime) throw new Error('没有可用 iPad 类型或 iOS Simulator runtime。');
  const artifacts = join(PLAYER_ROOT, 'test-artifacts/ios');
  await mkdir(artifacts, { recursive: true });
  let udid;
  const report = { type: type.name, runtime: runtime.name, startedAt: new Date().toISOString() };
  try {
    udid = await command('create', 'Sprout T8 temporary iPad', type.identifier, runtime.identifier);
    report.udid = udid;
    console.info(`本任务临时 iPad：${udid}`);
    await command('boot', udid);
    await command('bootstatus', udid, '-b');
    await command('install', udid, app);
    report.launch = await command('launch', udid, 'com.sprout.growth');
    const delay = Number(env.SPROUT_IOS_CAPTURE_DELAY_SEC ?? 8);
    if (!Number.isFinite(delay) || delay < 8 || delay > 120) throw new Error('截图延迟须为 8–120 秒。');
    console.info(`App 已启动；请将本任务 Simulator 窗口横屏，${delay} 秒后采集。`);
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    const raw = join(artifacts, '01-ipad-launch-raw.png');
    await command('io', udid, 'screenshot', raw);
    const png = await readFile(raw);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    report.rawSize = [png.readUInt32BE(16), png.readUInt32BE(20)];
    report.rotation = Number(env.SPROUT_IOS_CAPTURE_ROTATE_DEG ?? 0);
    report.size = await normalizeIOSCapture(raw, join(artifacts, '01-ipad-launch.png'), report.rotation);
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = error.message;
    throw error;
  } finally {
    if (udid) {
      await command('shutdown', udid).catch(() => undefined);
      await command('delete', udid).catch(() => undefined);
    }
    report.endedAt = new Date().toISOString();
    await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.info('iPad 安装、启动和截图采集通过；本任务临时模拟器已关闭并删除。');
}

if (isMain(import.meta.url)) {
  iosSmoke().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
