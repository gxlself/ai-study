import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { zipSync } from 'fflate';
import { bundlePack } from './bundle-pack';
import { failure, isMain, printIssues, runCli } from './lib/cli';
import { safePath, walkFiles } from './lib/io';

export async function packZip(directory: string, outputDirectory = 'release'): Promise<string> {
  const root = path.resolve(directory);
  const result = await bundlePack(root);
  printIssues(result.issues);
  if (!result.bundle || failure(result.issues)) throw new Error('内容包存在错误，未生成 zip；请先修复 content:validate 的错误');
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const archive = path.join(output, `${result.bundle.manifest.id}-${result.bundle.manifest.version}.zip`);
  const outputInsidePack = output !== root && output.startsWith(`${root}${path.sep}`);
  const files: Record<string, Uint8Array> = Object.create(null);
  for (const file of await walkFiles(root)) {
    const absolute = await safePath(root, file);
    if (absolute === archive || (outputInsidePack && absolute.startsWith(`${output}${path.sep}`))) continue;
    if (file === 'audio/manifest.local.json' || file === 'audio/.tts-settings.local.json' ||
        file === 'audio/.tts-settings.json' ||
        file.startsWith('audio/tts/')) continue;
    files[file] = await readFile(absolute);
  }
  if (!files['pack.json'] || !files['bundle.json']) throw new Error('归档缺少 pack.json 或 bundle.json，未写出 zip');
  const temporary = `${archive}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, zipSync(files, { level: 6 }), { flag: 'wx' });
    await rename(temporary, archive);
  } finally { await rm(temporary, { force: true }); }
  console.log(`${archive}：${Object.keys(files).length} 个文件，根目录包含 pack.json`);
  return archive;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, options: { out: { type: 'string', default: 'release' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log('用法：pnpm content:zip <packDir> [--out release/]');
    return;
  }
  if (positionals.length !== 1) throw new Error('请提供且仅提供一个 packDir：pnpm content:zip <packDir> [--out release/]');
  await packZip(positionals[0], values.out);
}

if (isMain(import.meta.url)) runCli(() => main());
