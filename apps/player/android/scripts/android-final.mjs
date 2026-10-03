import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { javaHome } from '../../resources/native-utils.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const artifacts = join(root, 'apps/player/test-artifacts/android-final');
const sdk = process.env.ANDROID_HOME || join(process.env.HOME, 'Library/Android/sdk');
const adb = join(sdk, 'platform-tools/adb');
const adbPort = process.env.SPROUT_ADB_PORT || '5049';
const emulatorPort = process.env.SPROUT_EMULATOR_PORT || '5582';
const serial = `emulator-${emulatorPort}`;
const app = 'com.sprout.growth';
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { startedAt: new Date().toISOString(), serial, adbPort, variant: 'release', actions: [], checks: [], errors: [] };
let temporary;
let emulator;
let log;
let closed = false;
let adbStarted = false;
const command = async (...args) => (await exec(adb, ['-P', adbPort, '-s', serial, ...args], {
  timeout: 35_000, maxBuffer: 16 * 1024 * 1024,
})).stdout.trim();

async function tree() {
  await command('shell', 'uiautomator', 'dump', '/sdcard/sprout-t26.xml');
  const xml = await command('shell', 'cat', '/sdcard/sprout-t26.xml');
  const window = new JSDOM(xml, { contentType: 'text/xml' }).window;
  const document = window.document;
  const nodes = [...document.querySelectorAll('node')].map((element) => {
    const bounds = element.getAttribute('bounds').match(/\d+/g)?.map(Number) || [0, 0, 0, 0];
    return {
      text: element.getAttribute('text'), label: element.getAttribute('content-desc'),
      focused: element.getAttribute('focused') === 'true',
      focusable: element.getAttribute('focusable') === 'true',
      enabled: element.getAttribute('enabled') === 'true', bounds,
      class: element.getAttribute('class'),
    };
  });
  window.close();
  return { xml, nodes };
}

async function press(keys) {
  for (const key of keys) {
    await command('shell', 'input', 'keyevent', String(key));
    await delay(250);
  }
}

async function focus(label) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { nodes } = await tree();
    const targets = nodes.filter((node) => node.enabled && node.focusable && `${node.label} ${node.text}`.includes(label));
    const current = nodes.find((node) => node.focused && node.class !== 'android.webkit.WebView');
    if ((!targets.length || !current) && attempt < 2) { await delay(300); continue; }
    assert.ok(targets.length && current, `找不到焦点或目标：${label}`);
    if (targets.includes(current)) return;
    // 系统无障碍树将屏外按钮裁成零矩形；用真实下键滚入视口，不伪造 DOM 焦点。
    if (targets.every((node) => node.bounds.every((value) => value === 0))) {
      await press([20]); continue;
    }
    const candidates = nodes.filter((node) => node.enabled && node.focusable && node.class !== 'android.webkit.WebView' &&
      node.bounds[2] > node.bounds[0] && node.bounds[3] > node.bounds[1]);
    const center = (node) => [(node.bounds[0] + node.bounds[2]) / 2, (node.bounds[1] + node.bounds[3]) / 2];
    const queue = [[current, []]];
    const seen = new Set();
    let route;
    while (queue.length) {
      const [from, path] = queue.shift();
      if (seen.has(from)) continue;
      seen.add(from);
      if (targets.includes(from)) { route = path; break; }
      for (const [key, axis, sign] of [[19, 1, -1], [20, 1, 1], [21, 0, -1], [22, 0, 1]]) {
        let next;
        let score = Infinity;
        for (const candidate of candidates) {
          const primary = (center(candidate)[axis] - center(from)[axis]) * sign;
          const secondary = Math.abs(center(candidate)[1 - axis] - center(from)[1 - axis]);
          if (primary > 0 && primary + secondary * 2 < score) {
            next = candidate; score = primary + secondary * 2;
          }
        }
        if (next) queue.push([next, [...path, key]]);
      }
    }
    assert.ok(route?.length, `方向键不可达：${label}`);
    await press([route[0]]);
  }
  throw new Error(`焦点导航超时：${label}`);
}

async function capture(name) {
  assert.match(name, /^[a-zA-Z0-9_-]+$/);
  const { stdout } = await exec(adb, ['-P', adbPort, '-s', serial, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(stdout.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await writeFile(join(artifacts, `${name}.png`), stdout);
  const snapshot = process.env.SPROUT_NATIVE_UIA === '1' ? await tree().catch((error) => {
    report.errors.push({ action: { capture: name }, error: error.message, at: new Date().toISOString() });
    return null;
  }) : null;
  if (snapshot) await writeFile(join(artifacts, `${name}.xml`), snapshot.xml);
  console.info(JSON.stringify({ capture: name, size: [stdout.readUInt32BE(16), stdout.readUInt32BE(20)],
    nodes: snapshot?.nodes.filter((node) => node.text || node.label || node.focused) }));
}

async function action(input) {
  report.actions.push({ ...input, at: new Date().toISOString() });
  if (input.reset) {
    await command('shell', 'am', 'force-stop', app);
    assert.equal(await command('shell', 'pm', 'clear', app), 'Success');
    await command('shell', 'am', 'start', '-n', `${app}/.MainActivity`);
    await delay(3500);
  }
  if (input.focus) await focus(input.focus);
  if (input.keys) await press(input.keys);
  if (input.gate) {
    const { nodes } = await tree();
    const sequence = nodes.map((node) => node.text || node.label).find((label) => /^[上下左右]、[上下左右]、[上下左右]$/.test(label));
    assert.ok(sequence, '未读取到家长门方向序列');
    await press(sequence.split('、').map((key) => ({ 上: 19, 下: 20, 左: 21, 右: 22 })[key]));
  }
  if (input.wait) await delay(input.wait);
  if (input.assertText) {
    const { nodes } = await tree();
    assert.ok(nodes.some((node) => `${node.text} ${node.label}`.includes(input.assertText)), `页面缺少：${input.assertText}`);
    report.checks.push({ name: input.note || input.assertText, passed: true });
  }
  if (input.capture) await capture(input.capture);
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}

async function cleanup() {
  if (closed) return;
  closed = true;
  if (adbStarted) {
    await command('shell', 'am', 'force-stop', app).catch(() => undefined);
    await command('emu', 'kill').catch(() => undefined);
  }
  if (emulator && emulator.exitCode === null) {
    await delay(1500);
    if (emulator.exitCode === null) emulator.kill('SIGTERM');
  }
  if (adbStarted) await exec(adb, ['-P', adbPort, 'kill-server']).catch(() => undefined);
  if (log) await log.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  report.endedAt = new Date().toISOString();
  report.resourcesClosed = true;
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void cleanup().finally(() => process.exit(130));
});
async function requireFreePort(value) {
  const port = Number(value);
  assert.ok(Number.isInteger(port) && port >= 1024 && port < 65535);
  await new Promise((done, reject) => {
    const socket = createServer();
    socket.once('error', () => reject(new Error(`端口 ${port} 已占用，请指定本任务独立端口。`)));
    socket.listen(port, '127.0.0.1', () => socket.close(done));
  });
}
try {
  await mkdir(artifacts, { recursive: true });
  for (const port of [adbPort, emulatorPort, Number(emulatorPort) + 1]) await requireFreePort(port);
  temporary = await mkdtemp(join(tmpdir(), 'sprout-t26-tv-'));
  const avdHome = join(temporary, 'avd');
  await mkdir(avdHome);
  const env = { ...process.env, ANDROID_AVD_HOME: avdHome, ANDROID_ADB_SERVER_PORT: adbPort, JAVA_HOME: javaHome() };
  const creation = exec(join(sdk, 'cmdline-tools/latest/bin/avdmanager'), [
    'create', 'avd', '--name', 'SproutT26TV', '--package', 'system-images;android-34;android-tv;arm64-v8a',
    '--device', 'tv_1080p', '--path', join(avdHome, 'SproutT26TV.avd'),
  ], { env, timeout: 30_000 });
  creation.child.stdin.end('no\n');
  await creation;
  await exec(adb, ['-P', adbPort, 'start-server']);
  adbStarted = true;
  log = await open(join(artifacts, 'emulator.log'), 'w');
  emulator = spawn(join(sdk, 'emulator/emulator'), [
    '-avd', 'SproutT26TV', '-port', emulatorPort, '-no-window', '-no-audio', '-no-snapshot',
    '-no-boot-anim', '-memory', '1536', '-cores', '1', '-gpu', 'swiftshader_indirect',
  ], { env, stdio: ['ignore', log.fd, log.fd] });
  report.emulatorPid = emulator.pid;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await command('shell', 'getprop', 'sys.boot_completed').catch(() => '') === '1') break;
    assert.ok(emulator.exitCode === null, 'TV 模拟器启动失败');
    await delay(1000);
  }
  assert.equal(await command('shell', 'getprop', 'sys.boot_completed'), '1');
  await command('shell', 'settings', 'put', 'global', 'device_provisioned', '1');
  await command('shell', 'settings', 'put', 'secure', 'user_setup_complete', '1');
  await delay(8000);
  await command('shell', 'settings', 'put', 'global', 'auto_time_zone', '0');
  report.timezoneSetup = await command('shell', 'cmd', 'alarm', 'set-timezone', 'Asia/Seoul').catch((error) => error.message);
  report.deviceTime = await command('shell', 'date', '+%Y-%m-%dT%H:%M:%S%z');
  const { version } = JSON.parse(await readFile(join(root, 'apps/player/package.json'), 'utf8'));
  const apk = join(root, 'release', `sprout-player-${version}-release.apk`);
  report.apkSha256 = createHash('sha256').update(await readFile(apk)).digest('hex');
  report.install = await command('install', '-r', apk);
  await command('shell', 'svc', 'wifi', 'disable');
  report.mobileDataSetup = await command('shell', 'svc', 'data', 'disable').catch(() => 'TV 镜像无蜂窝服务');
  await command('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable').catch(() => undefined);
  const connectivity = await command('shell', 'dumpsys', 'connectivity');
  await writeFile(join(artifacts, 'connectivity.txt'), connectivity);
  report.networkDisabled = !/Active default network: \d+/.test(connectivity);
  report.wifiDisabled = true;
  report.noHouseholdServer = true;
  await action({ reset: true, capture: '00-release-offline-setup' });
  console.info('READY: JSON 行输入；quit 关闭并删除本任务模拟器。');
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const input = JSON.parse(line);
    if (input.quit) { report.ok = input.passed === true && report.checks.every((check) => check.passed); break; }
    try { await action(input); }
    catch (error) { report.errors.push({ action: input, error: error.message, at: new Date().toISOString() }); console.error(error.message); }
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
