import { parseArgs } from 'node:util';
import type { PackBundle } from '@sprout/schema';
import { failure, isMain, printIssues, runCli } from './lib/cli';
import { packDirectories, writeJson } from './lib/io';
import { inspectPack } from './lib/validate-pack';

export async function bundlePack(directory: string): Promise<{ bundle: PackBundle | null; issues: Awaited<ReturnType<typeof inspectPack>>['issues'] }> {
  const inspected = await inspectPack(directory);
  if (!inspected.manifest) return { bundle: null, issues: inspected.issues };
  if ([inspected.manifest.lexicon, ...inspected.manifest.routes, inspected.manifest.cover].includes('bundle.json')) {
    return { bundle: null, issues: [...inspected.issues, {
      path: 'pack.json', message: 'bundle.json 是生成文件，不能作为词库、路线或封面源文件；未覆盖原文件', level: 'error',
    }] };
  }
  const bundle: PackBundle = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    manifest: inspected.manifest,
    lexicon: inspected.lexicon,
    routes: inspected.routes.map((item) => item.route),
    lessons: inspected.validLessons,
    audio: inspected.audio,
  };
  await writeJson(directory, 'bundle.json', bundle);
  return { bundle, issues: inspected.issues };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: { pack: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('用法：pnpm content:bundle [--pack <dir>]');
    return;
  }
  for (const directory of await packDirectories(values.pack)) {
    const result = await bundlePack(directory);
    printIssues(result.issues);
    if (result.bundle) console.log(`${directory}/bundle.json：已写入 ${result.bundle.lessons.length} 节通过校验的课程（已补全默认值）`);
    if (failure(result.issues)) process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) runCli(() => main());
