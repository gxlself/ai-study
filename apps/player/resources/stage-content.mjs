import { cp, mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { checkContent } from '../../../deploy/check-content.mjs';
import { REPO_ROOT, RESOURCE_ROOT, PLAYER_ROOT, run } from './native-utils.mjs';

export async function stageContent() {
  const temporary = await mkdtemp(join(RESOURCE_ROOT, '.native-cache-'));
  const pack = join(temporary, 'sprout-core');
  try {
    // 原生任务只重建自己的副本，不改 T5/T7 正在维护的源包和根 bundle。
    await cp(join(REPO_ROOT, 'content/packs/sprout-core'), pack, { recursive: true });
    await run('pnpm', ['exec', 'tsx', 'scripts/bundle-pack.ts', '--pack', pack], { cwd: REPO_ROOT });
    const summary = await checkContent(pack);
    if (!summary.audio) console.warn('预生成音频尚未交付；无系统 TTS 的设备只能显示文字。');
    return { pack, summary, cleanup: () => rm(temporary, { recursive: true, force: true }) };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function installStagedContent(platform, staged) {
  const publicRoot = platform === 'android'
    ? 'android/app/src/main/assets/public'
    : 'ios/App/App/public';
  const destination = join(PLAYER_ROOT, publicRoot, 'bundled/packs/sprout.core');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const name of ['bundle.json', 'assets', 'audio']) {
    if (existsSync(join(staged.pack, name))) await cp(join(staged.pack, name), join(destination, name), { recursive: true });
  }
  const installed = JSON.parse(await readFile(join(destination, 'bundle.json'), 'utf8'));
  if (installed.lessons.length !== staged.summary.lessons || !installed.routes.length) throw new Error('原生内置包复制不完整。');
  await mkdir(join(REPO_ROOT, 'release'), { recursive: true });
  await writeFile(join(REPO_ROOT, `release/${platform}-content.json`), JSON.stringify(staged.summary, null, 2) + '\n');
  console.info(`原生内置包：${staged.summary.lessons} 课 / ${staged.summary.concepts} 词 / ${staged.summary.audio} 条音频。`);
}
