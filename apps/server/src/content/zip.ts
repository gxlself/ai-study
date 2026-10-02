import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { RegistryError, safePath, safeRelativePath, walkFiles } from './files';

export const ZIP_LIMITS = {
  compressedBytes: 64 * 1024 * 1024,
  expandedBytes: 128 * 1024 * 1024,
  fileBytes: 32 * 1024 * 1024,
  entries: 4096,
} as const;

interface Entry {
  name: string; directory: boolean; method: number; size: number;
  compressed: number; checksum: number; start: number; offset: number;
}

function invalid(message = 'ZIP 文件结构无效'): never {
  throw new RegistryError(400, 'INVALID_ZIP', message);
}
function tooLarge(): never {
  throw new RegistryError(413, 'ZIP_TOO_LARGE', 'ZIP 文件数量或解压体积超过限制');
}

/** 先遍历完整中央目录和本地头，再解压；不能让 unzip 的同名键覆盖隐藏危险条目。 */
export function readZip(bytes: Uint8Array, manifestName: 'pack.json' | 'plugin.json'): Map<string, Uint8Array> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) invalid();
  if (bytes.length > ZIP_LIMITS.compressedBytes) tooLarge();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) &&
      (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < Math.max(0, bytes.length - 65557)) invalid();
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) invalid('不支持分卷 ZIP');
  const count = u16(end + 10), centralSize = u32(end + 12), centralStart = u32(end + 16);
  if (!count || count === 65535 || centralStart === 0xffffffff || centralStart + centralSize !== end) invalid();
  if (count > ZIP_LIMITS.entries) tooLarge();
  let cursor = centralStart, expanded = 0;
  const entries: Entry[] = [], names = new Map<string, boolean>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) invalid();
    const flags = u16(cursor + 8), method = u16(cursor + 10);
    const compressed = u32(cursor + 20), size = u32(cursor + 24);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32);
    const offset = u32(cursor + 42), next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || !nameLength || u16(cursor + 34) || flags & 0x2041 || ![0, 8].includes(method)) invalid();
    let raw: string;
    try { raw = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); } catch { invalid('ZIP 文件名编码无效'); }
    const directory = raw.endsWith('/');
    const name = safeRelativePath(directory ? raw.slice(0, -1) : raw);
    const key = name.normalize('NFC').toLowerCase();
    if (names.has(key)) invalid('ZIP 含重复或大小写冲突路径');
    names.set(key, directory);
    const mode = u32(cursor + 38) >>> 16, type = mode & 0xf000;
    if (type && type !== 0x8000 && type !== 0x4000) invalid('ZIP 不允许符号链接或特殊文件');
    if ((type === 0x4000 && !directory) || (type === 0x8000 && directory)) invalid();
    expanded += size;
    if (size > ZIP_LIMITS.fileBytes || expanded > ZIP_LIMITS.expandedBytes) tooLarge();
    if (directory && size !== 0) invalid();
    if (offset + 30 > centralStart || u32(offset) !== 0x04034b50) invalid();
    if (u16(offset + 6) !== flags || u16(offset + 8) !== method) invalid();
    const localNameLength = u16(offset + 26), localExtraLength = u16(offset + 28);
    const start = offset + 30 + localNameLength + localExtraLength;
    if (start + compressed > centralStart || localNameLength !== nameLength) invalid();
    for (let n = 0; n < nameLength; n++) {
      if (bytes[offset + 30 + n] !== bytes[cursor + 46 + n]) invalid('ZIP 文件名与本地头不一致');
    }
    const checksum = u32(cursor + 16);
    if (!(flags & 8) && (u32(offset + 14) !== checksum || u32(offset + 18) !== compressed || u32(offset + 22) !== size)) invalid();
    entries.push({ name, directory, method, size, compressed, checksum, start, offset });
    cursor = next;
  }
  if (cursor !== end) invalid();
  for (const [name] of names) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (names.get(parts.slice(0, i).join('/')) === false) invalid('ZIP 中文件与目录路径冲突');
    }
  }
  const ordered = [...entries].sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].offset < ordered[i - 1].start + ordered[i - 1].compressed) invalid('ZIP 条目重叠');
  }
  const files = entries.filter((entry) => !entry.directory);
  let prefix = '';
  if (!files.some((entry) => entry.name === manifestName)) {
    const root = files[0]?.name.split('/')[0];
    if (!root || !files.some((entry) => entry.name === `${root}/${manifestName}`) ||
        entries.some((entry) => entry.name !== root && !entry.name.startsWith(`${root}/`))) {
      invalid(`ZIP 根目录或唯一子目录中必须包含 ${manifestName}`);
    }
    prefix = `${root}/`;
  }
  const result = new Map<string, Uint8Array>();
  for (const entry of files) {
    let output: Uint8Array;
    try {
      const input = bytes.subarray(entry.start, entry.start + entry.compressed);
      output = entry.method === 0 ? input.slice() :
        inflateRawSync(input, { maxOutputLength: Math.max(1, entry.size) });
    } catch { invalid('ZIP 解压失败或实际大小超过声明值'); }
    if (output.length !== entry.size || crc32(output) !== entry.checksum) invalid('ZIP 文件大小或校验和不匹配');
    result.set(entry.name.slice(prefix.length), output);
  }
  return result;
}

export function extractFiles(files: Map<string, Uint8Array>, directory: string): void {
  for (const [path, bytes] of files) {
    const target = safePath(directory, path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  }
}

export function exportDirectory(directory: string): Uint8Array {
  const paths = walkFiles(directory);
  if (paths.length > ZIP_LIMITS.entries) tooLarge();
  let total = 0;
  const files: Record<string, Uint8Array> = Object.create(null);
  for (const path of paths) {
    const target = safePath(directory, path), size = lstatSync(target).size;
    total += size;
    if (size > ZIP_LIMITS.fileBytes || total > ZIP_LIMITS.expandedBytes) tooLarge();
    const bytes = readFileSync(target);
    files[path] = bytes;
  }
  const zipped = zipSync(files);
  if (zipped.length > ZIP_LIMITS.compressedBytes) tooLarge();
  return zipped;
}
