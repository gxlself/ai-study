import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CORE_PACK = path.join(REPO_ROOT, 'content/packs/sprout-core');

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function packPath(root: string, relative: string): string {
  if (!relative || /[\\\u0000-\u001f]/.test(relative) || /^[a-z][a-z0-9+.-]*:/i.test(relative)
    || relative.startsWith('/') || relative.split('/').some((part) => !part || part === '..' || part === '.')
    || /%(?:2e|2f|5c|00)/i.test(relative)) {
    throw new Error(`不安全的包内路径：${relative}`);
  }
  return path.resolve(root, relative);
}

export async function safePath(root: string, relative: string): Promise<string> {
  const target = packPath(root, relative);
  let current = path.resolve(root);
  // 不跟随包内软链接，避免把包外文件读入 zip 或覆盖包外内容。
  for (const part of ['', ...relative.split('/')]) {
    if (part) current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`不允许软链接：${current}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return target;
}

export async function fileExists(root: string, relative: string): Promise<boolean> {
  const target = await safePath(root, relative);
  try {
    const stat = await lstat(target);
    return stat.isFile() && stat.size > 0;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function readJson(root: string, relative: string): Promise<unknown> {
  const target = await safePath(root, relative);
  return JSON.parse(await readFile(target, 'utf8'));
}

export async function writeJson(root: string, relative: string, value: unknown): Promise<void> {
  const target = await safePath(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function isCachePath(relative: string): boolean {
  return relative.split('/').some((part) => part.startsWith('.') || ['node_modules', 'release', 'coverage', 'tmp'].includes(part))
    || /(?:\.tmp|\.bak|\.log|\.aiff?|\.zip|\.tsbuildinfo)$/i.test(relative);
}

export async function walkFiles(root: string, relative = '', skipCaches = true): Promise<string[]> {
  const directory = relative ? await safePath(root, relative) : root;
  const files: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (skipCaches && isCachePath(name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`不允许软链接：${name}`);
    if (entry.isDirectory()) files.push(...await walkFiles(root, name, skipCaches));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}

export async function packDirectories(selected?: string): Promise<string[]> {
  if (selected) return [path.resolve(selected)];
  const root = path.join(REPO_ROOT, 'content/packs');
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort();
}
