import type { ActivityPlugin } from '@sprout/plugin-sdk';

type Helpers = Parameters<NonNullable<ActivityPlugin['preload']>>[1];

function safePath(value: string): boolean {
  if (!value || /[\u0000-\u0020\\]/.test(value) || value.startsWith('//')) return false;
  const pathname = value.split(/[?#]/, 1)[0];
  for (const part of pathname.split('/')) {
    let decoded = part;
    for (let i = 0; i < 8; i += 1) {
      let next: string;
      try { next = decodeURIComponent(decoded); } catch { return false; }
      if (next === '..' || next.includes('/') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) return false;
      if (decoded === next) break;
      decoded = next;
      if (i === 7) return false;
    }
  }
  return true;
}

export function mediaAsset(path: string | undefined, helpers: Helpers): string | undefined {
  if (!path || !safePath(path) || (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^https?:\/\//i.test(path))) return undefined;
  try {
    const resolved = helpers.resolveAsset(path);
    if (!resolved || !safePath(resolved)) return undefined;
    const base = new URL(helpers.resolveAsset('assets/__sprout_origin__'), window.location.href);
    const url = new URL(resolved, window.location.href);
    if (url.username || url.password || url.origin !== base.origin || !['http:', 'https:', 'capacitor:', 'file:'].includes(url.protocol)) return undefined;
    return resolved;
  } catch { return undefined; }
}

const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'pink', 'purple',
  'gray', 'grey', 'cyan', 'magenta', 'lime', 'navy', 'teal', 'olive', 'maroon',
  'silver', 'aqua', 'fuchsia', 'transparent', 'coral', 'gold', 'violet', 'indigo',
]);

export function sortColor(input?: string): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(value) || NAMED_COLORS.has(value)) return value;
  const match = /^(rgb|rgba)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?|\.\d+))?\s*\)$/.exec(value);
  if (!match || (match[1] === 'rgba') !== (match[5] !== undefined) ||
    match.slice(2, 5).some((channel) => Number(channel) > 255)) return undefined;
  return value;
}

export function webTarget(input: string): URL | null {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      /[\u0000-\u0020\\]/.test(input) || url.origin === window.location.origin) return null;
    return url;
  } catch { return null; }
}

export function webNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkWebTarget(url: URL, signal: AbortSignal): Promise<void> {
  const response = await fetch(url.href, {
    method: 'HEAD', signal, mode: 'cors', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
  });
  if (!response.ok || response.redirected || !response.url || new URL(response.url).origin !== url.origin ||
    new URL(response.url).origin === window.location.origin) throw new Error('网页最终来源未通过校验');
}
