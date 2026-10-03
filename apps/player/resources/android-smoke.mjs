import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMain, PLAYER_ROOT } from './native-utils.mjs';

const exec = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const application = 'com.sprout.growth';

export async function androidSmoke(env = process.env) {
  const serial = env.SPROUT_ANDROID_SERIAL;
  if (!serial || env.SPROUT_ANDROID_ALLOW_CLEAR !== '1') {
    throw new Error('请指定 SPROUT_ANDROID_SERIAL 和 SPROUT_ANDROID_ALLOW_CLEAR=1；脚本只允许清空授权测试设备上的 Sprout。');
  }
  const adb = env.ADB || join(env.ANDROID_HOME || join(env.HOME, 'Library/Android/sdk'), 'platform-tools/adb');
  const adbArgs = [...(env.SPROUT_ADB_PORT ? ['-P', env.SPROUT_ADB_PORT] : []), '-s', serial];
  const command = async (...args) => (await exec(adb, [...adbArgs, ...args], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
  const artifacts = join(PLAYER_ROOT, 'test-artifacts/android');
  await mkdir(artifacts, { recursive: true });
  let port;
  let browser;
  const report = { serial, appId: application, steps: [], screenshots: [], startedAt: new Date().toISOString() };
  async function screenshot(name) {
    const { stdout } = await exec(adb, [...adbArgs, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', timeout: 20_000, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(stdout.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await writeFile(join(artifacts, `${name}.png`), stdout);
    report.screenshots.push(`${name}.png`);
  }
  try {
    assert.equal(await command('get-state'), 'device');
    await command('shell', 'pm', 'clear', application);
    await command('shell', 'am', 'start', '-n', `${application}/.MainActivity`);
    let pid;
    for (let attempts = 0; attempts < 30; attempts++) {
      pid = await command('shell', 'pidof', application).catch(() => '');
      if (pid) break;
      await delay(500);
    }
    assert.match(pid, /^\d+$/);
    port = await command('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);
    let targets;
    for (let attempts = 0; attempts < 30; attempts++) {
      targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => []);
      if (targets.length) break;
      await delay(500);
    }
    assert.ok(targets.length, '需要启用调试的 debug APK WebView。');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    const page = browser.contexts().flatMap((context) => context.pages())[0];
    assert.ok(page);
    await page.locator('.setup-welcome').waitFor({ timeout: 30_000 });
    assert.ok(await page.evaluate(() => window.Capacitor.PluginHeaders.some((plugin) => plugin.name === 'SproutScreen')));
    await screenshot('01-offline-setup');

    async function press(code) {
      await command('shell', 'input', 'keyevent', String(code));
      await delay(180);
    }

    async function focus(selector) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const snapshot = await page.evaluate((targetSelector) => {
          const current = document.querySelector('.sp-focused');
          if (!current) return null;
          const scope = current.closest('.parent-gate, .activity-stage, .page');
          const elements = [...scope.querySelectorAll('[data-focusable]')].filter((element) => {
            if (element.matches(':disabled,[data-focusable="false"]') || element.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]')) return false;
            const rect = element.getBoundingClientRect();
            for (let node = element; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            }
            return rect.width > 0 && rect.height > 0;
          });
          return {
            current: elements.indexOf(current),
            targets: elements.flatMap((element, index) => element.matches(targetSelector) ? [index] : []),
            positions: elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }),
          };
        }, selector);
        assert.ok(snapshot && snapshot.current >= 0 && snapshot.targets.length, `找不到可达焦点：${selector}`);
        if (snapshot.targets.includes(snapshot.current)) return;
        const moves = [['up', 19, 0, -1], ['down', 20, 0, 1], ['left', 21, -1, 0], ['right', 22, 1, 0]];
        const queue = [[snapshot.current, []]];
        const seen = new Set();
        let route;
        while (queue.length) {
          const [index, path] = queue.shift();
          if (seen.has(index)) continue;
          seen.add(index);
          if (snapshot.targets.includes(index)) { route = path; break; }
          const from = snapshot.positions[index];
          for (const [_name, key, dx, dy] of moves) {
            let next = -1;
            let score = Infinity;
            snapshot.positions.forEach((to, candidate) => {
              const primary = dx ? (to.x - from.x) * dx : (to.y - from.y) * dy;
              const secondary = dx ? Math.abs(to.y - from.y) : Math.abs(to.x - from.x);
              if (candidate !== index && primary > 0 && primary + 2 * secondary < score) {
                next = candidate; score = primary + 2 * secondary;
              }
            });
            if (next >= 0) queue.push([next, [...path, key]]);
          }
        }
        assert.ok(route?.length, `方向键无法到达：${selector}`);
        await press(route[0]);
      }
      throw new Error(`焦点导航超时：${selector}`);
    }

    await focus('.setup-option.local');
    await press(23);
    await page.locator('.child-form').waitFor();
    await focus('[aria-label="出生年减一"]');
    await press(23);
    await focus('.child-form > button.primary');
    await press(23);
    await page.locator('.home').waitFor({ timeout: 30_000 });
    if (await page.locator('.co-view-notice').count()) {
      await focus('.co-view-notice button');
      await press(23);
    }
    assert.ok(await page.locator('.journey .lesson-card').count(), '正式内容没有当前年龄的共看课程，不能用模拟课补验收。');
    report.steps.push('通过真实 DPAD_CENTER 选择离线体验、建档并进入共看首页');
    await screenshot('02-home');
    await focus('.journey .lesson-card');
    await press(23);
    await page.locator('.lesson-page.phase-intro').waitFor();
    await screenshot('03-lesson-intro');
    await focus('.start-lesson');
    await press(23);
    await page.locator('.lesson-page.phase-playing').waitFor({ timeout: 30_000 });
    await screenshot('04-lesson-playing');
    report.steps.push('通过 DPAD 导航和 OK 打开真实内置课程');
    await press(4);
    await page.locator('.parent-gate').waitFor();
    await screenshot('05-parent-gate');
    report.steps.push('Android 返回键经 Capacitor App 进入家长门');
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = error.message;
    await screenshot('failure').catch(() => undefined);
    throw error;
  } finally {
    report.endedAt = new Date().toISOString();
    await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser?.close().catch(() => undefined);
    if (port) await command('forward', '--remove', `tcp:${port}`).catch(() => undefined);
    await command('shell', 'am', 'force-stop', application).catch(() => undefined);
  }
  console.info('Android 离线 / DPAD / 课程 / 返回家长门验收通过。');
}

if (isMain(import.meta.url)) {
  androidSmoke().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
