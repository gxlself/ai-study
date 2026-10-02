import { parseArgs } from 'node:util';
import { failure, isMain, runCli } from './lib/cli';
import { packDirectories } from './lib/io';
import { inspectPack, printInspection } from './lib/validate-pack';

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    pack: { type: 'string' }, strict: { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('用法：pnpm content:validate [--pack <dir>] [--strict]');
    return;
  }
  const directories = await packDirectories(values.pack);
  if (!directories.length) throw new Error('content/packs 中没有内容包');
  for (const directory of directories) {
    const result = await inspectPack(directory);
    printInspection(result);
    if (failure(result.issues, values.strict)) process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) runCli(() => main());
