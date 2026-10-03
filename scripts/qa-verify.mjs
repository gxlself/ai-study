import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'qa-artifacts');
await mkdir(path.join(artifacts, 'logs'), { recursive: true });
const jobs = [
  ['typecheck', 'pnpm', ['-r', '--workspace-concurrency=1', 'typecheck']],
  ['pipeline-typecheck', 'pnpm', ['content:typecheck']],
  ['tests', 'pnpm', ['-r', '--workspace-concurrency=1', 'test']],
  ['pipeline-tests', 'pnpm', ['content:test']],
  ['service-worker', process.execPath, ['--test', '--test-concurrency=1', 'apps/player/scripts/tests/service-worker.node.mjs']],
  ['strict-validate', 'pnpm', ['content:validate', '--pack', 'content/packs/sprout-core', '--strict']],
  ['build', 'pnpm', ['build']],
];
const result = { startedAt: new Date().toISOString(), jobs: [], completed: false };
const save = () => writeFile(path.join(artifacts, 'verification-results.json'), `${JSON.stringify(result, null, 2)}\n`);
try {
  await save();
  for (const [name, command, args] of jobs) {
    const row = { name, command: `${command === process.execPath ? 'node' : command} ${args.join(' ')}`, exitCode: null };
    result.jobs.push(row);
    await save();
    const log = createWriteStream(path.join(artifacts, `logs/${name}.log`));
    let child, childError, logError;
    const logClosed = new Promise((resolve) => log.once('close', resolve));
    log.once('error', (error) => {
      logError = error;
      child?.kill();
    });
    console.log(`[T9] ${row.command}`);
    try {
      row.exitCode = await new Promise((resolve) => {
        child = spawn(command, args, {
          cwd: root, env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.once('error', (error) => { childError = error; });
        child.once('close', (code, signal) => {
          if (signal) row.signal = signal;
          resolve(code);
        });
        child.stdout.pipe(log, { end: false });
        child.stderr.pipe(log, { end: false });
      });
    } catch (error) {
      childError = error;
    } finally {
      log.end();
      await logClosed;
      if (childError || logError) row.error = (childError || logError).message;
    }
    await save();
    if (row.exitCode !== 0 || row.error || row.signal) throw new Error(`${name} 失败，请查看 qa-artifacts/logs/${name}.log${row.error ? `：${row.error}` : ''}`);
  }
  result.completed = true;
} catch (error) {
  result.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await save();
}
