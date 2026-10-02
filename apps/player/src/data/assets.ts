import { Id } from '@sprout/schema';
import { DataSourceError } from './errors';

export function packSegment(packId: string): string {
  return encodeURIComponent(Id.parse(packId));
}

function invalidAsset(): never {
  throw new DataSourceError('invalid-asset', '资源地址必须是包内路径或 HTTP/HTTPS 地址。');
}

export function httpAsset(path: string): string | null {
  if (!/^https?:\/\//i.test(path)) return null;
  const url = new URL(path);
  if (url.username || url.password) invalidAsset();
  return url.href;
}

function relativeAsset(path: string): string {
  const value = path.replace(/^(\.\/)+/, '');
  if (!value || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value) || value.includes('\\')) invalidAsset();
  for (const segment of value.split(/[?#]/, 1)[0].split('/')) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { return invalidAsset(); }
    if (decoded === '..' || decoded.includes('/') || decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) invalidAsset();
  }
  return value;
}

export function joinAsset(baseUrl: string, path: string): string {
  const absolute = httpAsset(path);
  if (absolute) return absolute;
  return `${baseUrl.replace(/\/+$/, '')}/${relativeAsset(path)}`;
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
