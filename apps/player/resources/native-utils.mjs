import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RESOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
export const PLAYER_ROOT = resolve(RESOURCE_ROOT, '..');
export const REPO_ROOT = resolve(PLAYER_ROOT, '../..');

export function javaHome(env = process.env) {
  const candidates = [
    env.JAVA_HOME,
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
  ].filter(Boolean);
  for (const home of candidates) {
    const executable = join(home, 'bin/java');
    if (!existsSync(executable)) continue;
    const result = spawnSync(executable, ['-version'], { encoding: 'utf8' });
    const version = /version "(\d+)/.exec(result.stderr);
    if (result.status === 0 && version && Number(version[1]) >= 21) return home;
  }
  throw new Error('需要 Java 21+；请设置 JAVA_HOME，或安装带 JBR 21 的 Android Studio。');
}

export function run(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: PLAYER_ROOT, stdio: 'inherit', detached: process.platform !== 'win32',
      env: { ...process.env, pnpm_config_verify_deps_before_run: 'false', CI: '1' },
      ...options,
    });
    const forward = (signal) => {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const interrupt = () => forward('SIGINT');
    const terminate = () => forward('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    const cleanup = () => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
    };
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => {
      cleanup();
      if (code === 0) resolveResult();
      else reject(new Error(`${command} 失败（${signal ?? code}）`));
    });
  });
}

export function isMain(url) {
  return Boolean(process.argv[1]) && fileURLToPath(url) === resolve(process.argv[1]);
}
