import { Id } from '@sprout/schema';
import { DataSourceError } from './errors';

export function packSegment(packId: string): string {
  return encodeURIComponent(Id.parse(packId));
}

function invalidAsset(): never {
  throw new DataSourceError('invalid-asset', '资源地址必须是包内路径或已配置服务器的同源地址。');
}

export function httpAsset(path: string): string | null {
  if (!/^https?:\/\//i.test(path)) return null;
  const url = new URL(path);
  if (url.username || url.password || /[\u0000-\u0020\\]/.test(path)) invalidAsset();
  return url.href;
}

function relativeAsset(path: string): string {
  const value = path.replace(/^(\.\/)+/, '');
  if (!value || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value) || value.includes('\\')) invalidAsset();
  for (const segment of value.split(/[?#]/, 1)[0].split('/')) {
    let decoded: string;
    decoded = segment;
    for (let i = 0; i < 8; i += 1) {
      let next: string;
      try { next = decodeURIComponent(decoded); } catch { return invalidAsset(); }
      if (next === '..' || next.includes('/') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) invalidAsset();
      if (next === decoded) break;
      decoded = next;
      if (i === 7) invalidAsset();
    }
  }
  return value;
}

export function joinAsset(baseUrl: string, path: string): string {
  const absolute = httpAsset(path);
  if (absolute) {
    const base = new URL(baseUrl, globalThis.location?.href ?? 'http://localhost/');
    if (new URL(absolute).origin !== base.origin) invalidAsset();
    return absolute;
  }
  return `${baseUrl.replace(/\/+$/, '')}/${relativeAsset(path)}`;
}

export function serverAsset(server: string, path: string): string {
  const result = remoteUrl(server, path);
  if (new URL(result).origin !== new URL(server).origin) invalidAsset();
  return result;
}

export function remoteUrl(server: string, path: string): string {
  const absolute = httpAsset(path);
  if (absolute) return absolute;
  if (path.startsWith('//') || path.includes('\\')) invalidAsset();
  if (path.startsWith('/')) return new URL(`/${relativeAsset(path.slice(1))}`, `${server}/`).href;
  return joinAsset(`${server}/`, path);
}

export function directoryUrl(url: string): string {
  const path = url.split(/[?#]/, 1)[0];
  return path.slice(0, path.lastIndexOf('/') + 1) || './';
}
