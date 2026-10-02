import { lstat, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLAYER_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REPO_ROOT = resolve(PLAYER_ROOT, '../..');
export const FIXTURE_ROOT = join(PLAYER_ROOT, 'dev-fixtures/sprout.core');

export const isMain = (url) =>
  Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === url;

export async function statIfExists(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function assertWithin(root, path) {
  const part = relative(resolve(root), resolve(path));
  if (!part || part === '..' || part.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(part)) {
    throw new Error(`路径必须位于目录内：${path}`);
  }
}

export async function assertNoSymlinkAncestors(path) {
  let cursor = resolve(path);
  for (;;) {
    const stat = await statIfExists(cursor);
    if (stat?.isSymbolicLink()) throw new Error(`拒绝通过符号链接读写：${cursor}`);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

export async function listFiles(root) {
  await assertNoSymlinkAncestors(root);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error(`需要目录：${root}`);
  const files = [];
  async function walk(path, prefix) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`不复制符号链接：${join(root, name)}`);
      if (entry.isDirectory()) await walk(join(path, entry.name), name);
      else if (entry.isFile()) files.push(name);
      else throw new Error(`不支持的文件类型：${join(root, name)}`);
    }
  }
  await walk(root, '');
  return files.sort();
}

export async function assertPackFile(root, path) {
  if (typeof path !== 'string' || !/^(assets|audio)\//.test(path) || path.includes('\\') ||
      path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`资源必须位于包内 assets/ 或 audio/：${String(path)}`);
  }
  const file = join(root, path);
  await assertNoSymlinkAncestors(file);
  if (!(await lstat(file)).isFile()) throw new Error(`资源不是普通文件：${file}`);
  return file;
}
