import { readFile, stat, realpath } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function checkContent(pack = join(root, 'content/packs/sprout-core'), requireAudio = false) {
  pack = resolve(pack);
  const canonicalRoot = await realpath(pack);
  const bundle = JSON.parse(await readFile(join(pack, 'bundle.json'), 'utf8'));
  if (bundle.schemaVersion !== 1 || bundle.manifest?.id !== 'sprout.core' ||
      !Array.isArray(bundle.lessons) || !bundle.lessons.length || !bundle.routes?.length ||
      bundle.lessons.some((lesson) => lesson.id?.startsWith('core.fixture.'))) {
    throw new Error('缺少正式 sprout.core 离线内容；不能发布开发夹具。');
  }
  const entries = Object.values(bundle.audio?.entries ?? {});
  const paths = [
    bundle.manifest.cover,
    ...(bundle.lexicon?.concepts ?? []).map((concept) => concept.image),
    ...entries,
  ].filter(Boolean);
  for (const path of paths) {
    if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\') ||
        path.split('/').includes('..') || /^[a-z]+:/i.test(path)) {
      throw new Error('内容资源必须是包内相对路径。');
    }
    const target = resolve(pack, path);
    const canonicalPath = relative(canonicalRoot, await realpath(target));
    const info = await stat(target);
    if (relative(pack, target).startsWith('..') || canonicalPath === '..' ||
        canonicalPath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
        isAbsolute(canonicalPath) || !info.isFile() || !info.size) {
      throw new Error(`资源缺失或为空：${path}`);
    }
  }
  if (requireAudio && !entries.length) throw new Error('预生成朗读音频尚未交付，不能保证无 TTS 电视的离线发声。');
  return { lessons: bundle.lessons.length, concepts: bundle.lexicon?.concepts.length ?? 0, audio: entries.length, builtAt: bundle.builtAt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkContent(undefined, process.argv.includes('--require-audio')).then((result) => {
    console.info(`[Sprout] 正式 bundle：${result.lessons} 课 / ${result.concepts} 词 / ${result.audio} 条音频；构建于 ${result.builtAt}`);
    if (!result.audio) console.warn('[Sprout] 警告：预生成音频缺失；无 Web Speech/TTS 的电视只能显示文字，Linux 不会自动生成 macOS 音频。');
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
