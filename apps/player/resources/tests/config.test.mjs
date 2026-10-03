import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { PLAYER_ROOT } from '../native-utils.mjs';

const xml = async (path) => new JSDOM(await readFile(join(PLAYER_ROOT, path), 'utf8'), { contentType: 'text/xml' }).window.document;
const android = 'http://schemas.android.com/apk/res/android';
const attribute = (element, key) => element.getAttributeNS(android, key);

test('电视与触屏设备共用横屏 Launcher，允许家庭 HTTP，不请求常驻唤醒权限', async () => {
  const doc = await xml('android/app/src/main/AndroidManifest.xml');
  const features = [...doc.getElementsByTagName('uses-feature')];
  for (const name of ['android.software.leanback', 'android.hardware.touchscreen']) {
    const item = features.find((element) => attribute(element, 'name') === name);
    assert.equal(attribute(item, 'required'), 'false');
  }
  const activity = doc.getElementsByTagName('activity')[0];
  assert.equal(attribute(activity, 'screenOrientation'), 'sensorLandscape');
  const categories = [...activity.getElementsByTagName('category')].map((element) => attribute(element, 'name'));
  assert.ok(categories.includes('android.intent.category.LAUNCHER'));
  assert.ok(categories.includes('android.intent.category.LEANBACK_LAUNCHER'));
  const application = doc.getElementsByTagName('application')[0];
  assert.equal(attribute(application, 'banner'), '@drawable/banner');
  assert.equal(attribute(application, 'usesCleartextTraffic'), 'true');
  assert.equal(attribute(application, 'networkSecurityConfig'), '@xml/network_security_config');
  assert.equal(attribute(application, 'allowBackup'), 'false');
  assert.deepEqual([...doc.getElementsByTagName('uses-permission')].map((element) => attribute(element, 'name')), ['android.permission.INTERNET']);
});

test('提交的图标与横幅为真实、正确尺寸 PNG，Android 每种密度完整', async () => {
  async function dimensions(path) {
    const data = await readFile(join(PLAYER_ROOT, path));
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  assert.deepEqual(await dimensions('resources/generated/banner.png'), [320, 180]);
  assert.deepEqual(await dimensions('resources/generated/app-icon-1024.png'), [1024, 1024]);
  for (const [density, factor] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    assert.deepEqual(await dimensions(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`), [48 * factor, 48 * factor]);
    assert.deepEqual(await dimensions(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`), [108 * factor, 108 * factor]);
  }
});

test('iPad 横屏、状态栏、家庭局域网权限和双设备族已配置', { skip: process.platform !== 'darwin' }, () => {
  const result = spawnSync('plutil', ['-convert', 'json', '-o', '-', join(PLAYER_ROOT, 'ios/App/App/Info.plist')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(result.stdout);
  assert.deepEqual(info.UIDeviceFamily, [1, 2]);
  for (const key of ['UISupportedInterfaceOrientations', 'UISupportedInterfaceOrientations~ipad']) {
    assert.deepEqual(info[key], ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']);
  }
  assert.equal(info.UIStatusBarHidden, true);
  assert.equal(info.UIRequiresFullScreen, true);
  assert.equal(info.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
  assert.equal(info.NSAppTransportSecurity.NSAllowsArbitraryLoadsInWebContent, true);
  assert.equal(info.NSLocalNetworkUsageDescription, '用于连接家里的芽芽成长服务器');
});
