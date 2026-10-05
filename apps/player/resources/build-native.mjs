import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isMain, javaHome, PLAYER_ROOT, REPO_ROOT, run } from './native-utils.mjs';
import { createKey } from './keygen.mjs';
import { syncNative } from './sync-native.mjs';
import { stageContent, installStagedContent } from './stage-content.mjs';

export async function buildNative(platform, variant = 'debug') {
  if (!['android', 'ios'].includes(platform) || !['debug', 'release', 'all'].includes(variant)) {
    throw new Error('用法：build-native.mjs android [debug|release|all] 或 ios');
  }
  if (process.env.SPROUT_BUNDLED_FIXTURE === '1') throw new Error('原生发布不能使用开发夹具。');
  if (process.env.SPROUT_LOCAL_AUDIO === '1') throw new Error('原生发布不能打入个人系统语音，请取消 SPROUT_LOCAL_AUDIO。');
  if (!existsSync(join(REPO_ROOT, 'content/packs/sprout-core/pack.json'))) throw new Error('请先由内容任务交付正式内容源包。');
  const staged = await stageContent();
  try {
    await run('pnpm', ['--filter', '@sprout/player', 'build']);
    await syncNative(platform);
    await installStagedContent(platform, staged);
  } finally {
    await staged.cleanup();
  }
  if (platform === 'ios') {
    const destination = process.env.SPROUT_IOS_DESTINATION || 'generic/platform=iOS Simulator';
    await run('xcodebuild', [
      '-quiet',
      '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
      '-sdk', 'iphonesimulator', '-configuration', 'Debug',
      '-destination', destination, '-derivedDataPath', 'ios/DerivedData',
      '-jobs', '1', 'CODE_SIGNING_ALLOWED=NO', 'ONLY_ACTIVE_ARCH=YES',
      `ARCHS=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`, 'build',
    ]);
    console.info('iOS Simulator 构建成功：ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app');
    return;
  }
  const home = javaHome();
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.HOME, 'Library/Android/sdk');
  const android = join(PLAYER_ROOT, 'android');
  if (!existsSync(join(android, 'local.properties'))) {
    await writeFile(join(android, 'local.properties'), `sdk.dir=${resolve(sdk).replaceAll('\\', '\\\\')}\n`);
  }
  if (variant !== 'debug') await createKey();
  const variants = variant === 'all' ? ['debug', 'release'] : [variant];
  const tasks = variants.map((name) => name === 'debug' ? 'assembleDebug' : 'assembleRelease');
  await run('./gradlew', ['--no-daemon', '--max-workers=1', ...tasks], {
    cwd: android,
    env: { ...process.env, JAVA_HOME: home, ANDROID_HOME: sdk },
  });
  const { version } = JSON.parse(await readFile(join(PLAYER_ROOT, 'package.json'), 'utf8'));
  const releaseRoot = resolve(process.env.SPROUT_RELEASE_DIR || join(REPO_ROOT, 'release'));
  await mkdir(releaseRoot, { recursive: true });
  for (const name of variants) {
    const filename = `sprout-player-${version}-${name}.apk`;
    const apk = join(releaseRoot, filename);
    await copyFile(join(android, `app/build/outputs/apk/${name}/app-${name}.apk`), apk);
    const hash = createHash('sha256').update(await readFile(apk)).digest('hex');
    await writeFile(`${apk}.sha256`, `${hash}  ${filename}\n`);
    console.info(`已生成 release/${filename}`);
  }
}

if (isMain(import.meta.url)) {
  buildNative(process.argv[2], process.argv[3]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
