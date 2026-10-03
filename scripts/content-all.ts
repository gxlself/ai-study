import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isMain, runCli } from './lib/cli';
import { REPO_ROOT } from './lib/io';

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    pack: { type: 'string' }, force: { type: 'boolean' }, prune: { type: 'boolean' },
    strict: { type: 'boolean' }, 'voice-zh': { type: 'string' }, 'voice-en': { type: 'string' },
    rate: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('用法：pnpm content:all [--pack <dir>] [--force] [--prune] [--strict] [--voice-zh <name>] [--voice-en <name>] [--rate 165]');
    return;
  }
  const common = values.pack ? ['--pack', path.resolve(values.pack)] : [];
  const audio = ['voice-zh', 'voice-en', 'rate'].flatMap((key) => {
    const value = values[key as 'voice-zh' | 'voice-en' | 'rate'];
    return value ? [`--${key}`, value] : [];
  });
  const stages: [string, string[]][] = [
    ['merge-route', common],
    ['fetch-assets', [...common, ...values.force ? ['--force'] : []]],
    ['gen-audio', [...common, ...audio, ...values.prune ? ['--prune'] : []]],
    ['validate-content', [...common, ...values.strict ? ['--strict'] : []]],
    ['bundle-pack', common],
  ];
  for (const [script, scriptArgs] of stages) {
    console.log(`\n[content:all] ${script}`);
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', path.join(REPO_ROOT, `scripts/${script}.ts`), ...scriptArgs], {
        cwd: REPO_ROOT, stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('close', (status) => resolve(status ?? 1));
    });
    if (code !== 0) { process.exitCode = code; return; }
  }
}

if (isMain(import.meta.url)) runCli(() => main());
