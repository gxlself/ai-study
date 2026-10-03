import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createHash } from 'node:crypto';
import { normalizeIOSCapture } from '../../resources/normalize-ios-capture.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = process.env.SPROUT_NATIVE_FINAL_RUN || '';
assert.match(run, /^[a-zA-Z0-9_-]*$/);
const artifacts = join(root, 'apps/player/ios/test-artifacts/final', run);
const app = join(root, 'apps/player/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app');
const resumeUdid = process.env.SPROUT_IOS_FINAL_UDID;
if (resumeUdid) assert.match(resumeUdid, /^[0-9A-F-]{36}$/);
const report = resumeUdid
  ? JSON.parse(await readFile(join(artifacts, 'report.json'), 'utf8'))
  : { startedAt: new Date().toISOString(), run, appId: 'com.sprout.growth', checks: [], captures: [] };
const command = async (...args) => (await exec('xcrun', ['simctl', ...args], {
  timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
})).stdout.trim();
let udid;
let closed = false;
async function cleanup() {
  if (closed) return;
  closed = true;
  if (udid) {
    await command('terminate', udid, report.appId).catch(() => undefined);
    await command('shutdown', udid).catch(() => undefined);
    await command('delete', udid).catch(() => undefined);
  }
  report.resourcesClosed = true;
  report.endedAt = new Date().toISOString();
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void cleanup().finally(() => process.exit(130));
});
try {
  await mkdir(artifacts, { recursive: true });
  const inventory = JSON.parse(await command('list', '--json'));
  if (resumeUdid) {
    assert.equal(report.udid, resumeUdid, '只能续接当前证据目录记录的设备。');
    assert.equal(report.appId, 'com.sprout.growth');
    const device = Object.values(inventory.devices).flat().find((item) => item.udid === resumeUdid);
    assert.equal(device?.name, 'Sprout T26 final temporary iPad');
    assert.equal(device.state, 'Booted', '续接设备必须已启动。');
    udid = resumeUdid;
    const installed = await command('get_app_container', udid, report.appId, 'app');
    const metadata = JSON.parse(await readFile(join(root, 'release/t26-native-final/metadata.json'), 'utf8'));
    for (const [path, digest] of Object.entries(metadata.webAssets)) {
      const bytes = await readFile(join(installed, 'public', path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, `已安装 iOS 网页资源不一致：${path}`);
    }
    const bundle = await readFile(join(installed, 'public/bundled/packs/sprout.core/bundle.json'));
    assert.equal(createHash('sha256').update(bundle).digest('hex'), metadata.content.ios.bundleSha256);
    report.resumedAt ??= [];
    report.resumedAt.push(new Date().toISOString());
    report.installedAssetsVerified = true;
  } else {
    const type = inventory.devicetypes.find((device) => device.name === 'iPad (A16)');
    const runtime = inventory.runtimes.filter((item) => item.isAvailable && item.name.startsWith('iOS '))
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
    assert.ok(type && runtime);
    report.type = type.name;
    report.runtime = runtime.name;
    udid = await command('create', 'Sprout T26 final temporary iPad', type.identifier, runtime.identifier);
    report.udid = udid;
    await command('boot', udid);
    await command('bootstatus', udid, '-b');
    await command('ui', udid, 'appearance', 'light');
    await command('install', udid, app);
    report.launch = await command('launch', udid, report.appId);
  }
  await exec('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid]);
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.info(`READY: ${udid}；请仅操作本任务 Simulator 窗口。`);
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const input = JSON.parse(line);
    if (input.quit) { report.ok = input.passed === true && report.checks.every((check) => check.passed); break; }
    if (input.check) report.checks.push({ name: input.check, passed: input.passed === true, at: new Date().toISOString() });
    if (input.capture) {
      assert.match(input.capture, /^[a-zA-Z0-9_-]+$/);
      const raw = join(artifacts, `${input.capture}-raw.png`);
      await command('io', udid, 'screenshot', raw);
      const size = await normalizeIOSCapture(raw, join(artifacts, `${input.capture}.png`), input.rotation ?? 0);
      const png = await readFile(raw);
      report.captures.push({ name: input.capture, rawSize: [png.readUInt32BE(16), png.readUInt32BE(20)], size, rotation: input.rotation ?? 0 });
      console.info(JSON.stringify(report.captures.at(-1)));
    }
    await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  lines.close();
  process.stdin.pause();
} catch (error) {
  report.ok = false;
  report.error = error.message;
  process.exitCode = 1;
  console.error(error);
} finally {
  await cleanup();
}
