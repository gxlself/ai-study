import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ValidationIssue } from '@sprout/schema';
import { z } from 'zod';

export class RegistryError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly issues?: ValidationIssue[],
  ) { super(message); this.name = 'RegistryError'; }
}

export function guard<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError(500, 'STORAGE_ERROR', '无法读取或保存内容文件');
  }
}

export function validationError(issues: ValidationIssue[], message = '内容未通过校验'): never {
  throw new RegistryError(400, 'VALIDATION_ERROR', message, issues);
}

export function issuesOf(error: Pick<z.ZodError, 'issues'>, prefix = ''): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join('.'),
    message: issue.message, level: 'error',
  }));
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}

export function parse<T>(schema: z.core.$ZodType<T>, input: unknown, path = ''): T {
  const result = z.safeParse(schema, input);
  if (!result.success) validationError(issuesOf(result.error, path));
  return result.data;
}

export function safeRelativePath(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 1024 ||
      /[\\:%\x00-\x1f\x7f<>|?*#]/.test(value) || value.startsWith('/')) {
    throw new RegistryError(400, 'UNSAFE_PATH', '路径必须是安全的包内相对路径');
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) {
    throw new RegistryError(400, 'UNSAFE_PATH', '路径包含不允许的目录或文件名');
  }
  return value;
}

/** 根目录由配置指定；包内每一级都禁止符号链接，包括尚不存在的目标。 */
export function safePath(directory: string, relative: string): string {
  const path = safeRelativePath(relative);
  const root = resolve(directory);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) {
    throw new RegistryError(400, 'UNSAFE_PATH', '内容根目录不能是符号链接');
  }
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new RegistryError(400, 'UNSAFE_PATH', '不允许访问符号链接');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return current;
}

/** HTTP 路由可传原始或已解码路径；返回现有普通文件，缺失时返回 undefined。 */
export function resolveStaticPath(directory: string, requestPath: string): string | undefined {
  return guard(() => {
    let decoded: string;
    try { decoded = decodeURIComponent(requestPath); } catch {
      throw new RegistryError(400, 'UNSAFE_PATH', '路径编码无效');
    }
    const target = safePath(directory, decoded);
    try { return lstatSync(target).isFile() ? target : undefined; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  });
}

export function ensureRoot(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) {
    throw new RegistryError(400, 'UNSAFE_PATH', '数据目录不能是符号链接');
  }
  return realpathSync(path);
}

export function ensureDirectory(root: string, path: string): string {
  const target = safePath(root, path);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  return target;
}

export const MAX_JSON_BYTES = 4 * 1024 * 1024;

export function readJson(root: string, path: string): unknown {
  const target = safePath(root, path);
  if (!lstatSync(target).isFile() || lstatSync(target).size > MAX_JSON_BYTES) {
    throw new RegistryError(400, 'INVALID_JSON', 'JSON 文件无效或超过 4 MiB');
  }
  try { return JSON.parse(readFileSync(target, 'utf8')); } catch {
    throw new RegistryError(400, 'INVALID_JSON', `JSON 文件无法解析：${path}`);
  }
}

export function writeJson(root: string, path: string, value: unknown): void {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new RegistryError(413, 'JSON_TOO_LARGE', 'JSON 文件不能超过 4 MiB');
  const target = safePath(root, path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(target), `.write-${randomUUID()}`);
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, target);
  } finally { rmSync(temporary, { force: true }); }
}

export function walkFiles(root: string, relative = '', depth = 0): string[] {
  if (depth > 64) throw new RegistryError(400, 'UNSAFE_PATH', '包内目录嵌套过深');
  const directory = relative ? safePath(root, relative) : root;
  if (lstatSync(directory).isSymbolicLink()) throw new RegistryError(400, 'UNSAFE_PATH', '包内不能包含符号链接');
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    safePath(root, path);
    if (entry.isDirectory()) result.push(...walkFiles(root, path, depth + 1));
    else if (entry.isFile()) result.push(path);
    else throw new RegistryError(400, 'UNSAFE_PATH', '包内只允许普通文件与目录');
    if (result.length > 10000) throw new RegistryError(413, 'PACK_TOO_LARGE', '包内文件数量过多');
  }
  return result;
}

export function makeStage(parent: string): string {
  if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) {
    throw new RegistryError(400, 'UNSAFE_PATH', '临时目录的父目录不能是符号链接');
  }
  return mkdtempSync(join(parent, '.stage-'));
}

/** 校验后的候选目录整体替换；提交回调失败时还原旧目录。 */
export function replaceDirectory(stage: string, destination: string, commit: () => void = () => {}): void {
  const backup = join(dirname(destination), `.backup-${randomUUID()}`);
  const existed = existsSync(destination);
  if (existed && lstatSync(destination).isSymbolicLink()) {
    throw new RegistryError(400, 'UNSAFE_PATH', '目标目录不能是符号链接');
  }
  if (existed) renameSync(destination, backup);
  try {
    renameSync(stage, destination);
    commit();
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    if (existed) renameSync(backup, destination);
    throw error;
  }
  if (existed) rmSync(backup, { recursive: true, force: true });
}

export function assetUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('/packs/')) return path;
  return `${baseUrl}${safeRelativePath(path).split('/').map(encodeURIComponent).join('/')}`;
}

export function compareVersions(a: string, b: string): number {
  const [left, leftPre] = a.split('-');
  const [right, rightPre] = b.split('-');
  const compareNumber = (x: string, y: string) => BigInt(x) < BigInt(y) ? -1 : BigInt(x) > BigInt(y) ? 1 : 0;
  const l = left.split('.'), r = right.split('.');
  for (let i = 0; i < 3; i++) {
    const n = compareNumber(l[i], r[i]);
    if (n) return n;
  }
  if (leftPre === rightPre) return 0;
  if (leftPre === undefined) return 1;
  if (rightPre === undefined) return -1;
  const lp = leftPre.split('.'), rp = rightPre.split('.');
  for (let i = 0; i < Math.max(lp.length, rp.length); i++) {
    if (lp[i] === undefined) return -1;
    if (rp[i] === undefined) return 1;
    if (lp[i] === rp[i]) continue;
    const ln = /^\d+$/.test(lp[i]), rn = /^\d+$/.test(rp[i]);
    if (ln && rn) { const n = compareNumber(lp[i], rp[i]); if (n) return n; }
    else if (ln !== rn) return ln ? -1 : 1;
    else return lp[i] < rp[i] ? -1 : 1;
  }
  return 0;
}
