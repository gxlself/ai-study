import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertNoSymlinkAncestors, assertPackFile, FIXTURE_ROOT, isMain, listFiles,
  PLAYER_ROOT, REPO_ROOT, statIfExists,
} from './files.mjs';

export async function copyBundled({
  contentDir = join(REPO_ROOT, 'content/packs/sprout-core'),
  fixtureDir = FIXTURE_ROOT,
  forceFixture = false,
  packsDir = join(PLAYER_ROOT, 'public/bundled/packs'),
  logger = console,
} = {}) {
  const useFixture = forceFixture || !(await statIfExists(join(contentDir, 'bundle.json')));
  const source = useFixture ? fixtureDir : contentDir;
  if (useFixture) {
    logger.warn(forceFixture
      ? '[copy-bundled] 警告：已显式选择开发夹具（非生产内容）；不得将本次构建当作正式内容发布。'
      : '[copy-bundled] 警告：正式 bundle.json 不存在，使用开发夹具（非生产内容）。');
  }
  await assertNoSymlinkAncestors(source);
  const bundleFile = join(source, 'bundle.json');
  const bundleStat = await lstat(bundleFile);
  if (!bundleStat.isFile() || bundleStat.isSymbolicLink()) throw new Error(`需要普通 bundle.json：${bundleFile}`);
  const bundle = JSON.parse(await readFile(bundleFile, 'utf8'));
  if (bundle?.schemaVersion !== 1 || bundle.manifest?.id !== 'sprout.core' ||
      !Array.isArray(bundle.lessons) || !Array.isArray(bundle.routes)) {
    throw new Error(`不是 sprout.core 的 PackBundle：${bundleFile}`);
  }
  const parts = ['bundle.json'];
  for (const name of ['assets', 'audio']) {
    const path = join(source, name);
    if (await statIfExists(path)) {
      await listFiles(path);
      parts.push(name);
    }
  }
  const references = [
    bundle.manifest.cover,
    ...(bundle.lexicon?.concepts ?? []).map((concept) => concept.image),
    ...Object.values(bundle.audio?.entries ?? {}),
  ].filter(Boolean);
  for (const path of references) await assertPackFile(source, path);

  const destination = join(packsDir, 'sprout.core');
  await assertNoSymlinkAncestors(destination);
  const previous = await statIfExists(destination);
  if (previous && !previous.isDirectory()) throw new Error(`目标不是目录：${destination}`);
  await mkdir(packsDir, { recursive: true });
  const temporary = await mkdtemp(join(packsDir, '.sprout.core-copy-'));
  const staged = join(temporary, 'next');
  const backup = join(temporary, 'previous');
  let movedPrevious = false;
  let installed = false;
  try {
    await mkdir(staged);
    for (const name of parts) {
      await cp(join(source, name), join(staged, name), { recursive: true, force: false, errorOnExist: true });
    }
    // 全部复制完成后才交换当前包；不清理 bundled 根目录或相邻包。
    if (previous) {
      await rename(destination, backup);
      movedPrevious = true;
    }
    try {
      await rename(staged, destination);
      installed = true;
    } catch (error) {
      if (movedPrevious) {
        await rename(backup, destination);
        movedPrevious = false;
      }
      throw error;
    }
  } finally {
    // 回滚也失败时保留备份，避免丢掉上一次可用包。
    if (installed || !movedPrevious) await rm(temporary, { recursive: true, force: true });
  }
  logger.info(`[copy-bundled] ${useFixture ? '开发夹具' : '正式内容包'} → ${destination}`);
  return { source, destination, useFixture };
}

if (isMain(import.meta.url)) {
  copyBundled({ forceFixture: process.env.SPROUT_BUNDLED_FIXTURE === '1' }).catch((error) => {
    console.error(`[copy-bundled] ${error.message}`);
    process.exitCode = 1;
  });
}
