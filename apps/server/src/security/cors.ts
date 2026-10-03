import { isIP } from 'node:net';

function canonicalOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'capacitor:'].includes(url.protocol) || !url.hostname || url.hostname.includes('*') ||
      url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) return undefined;
    return `${url.protocol}//${url.host}`;
  } catch { return undefined; }
}

export function parseCorsOrigins(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const origin = canonicalOrigin(item);
    if (!origin) throw new Error('SPROUT_CORS_ORIGINS 必须是逗号分隔的明确 HTTP(S) 或 Capacitor 来源，不支持通配符');
    return origin;
  }))];
}

export function corsOriginAllowed(origin: string | undefined, overrides: string[] | null): boolean {
  if (!origin) return false;
  const canonical = canonicalOrigin(origin);
  if (!canonical) return false;
  if (overrides !== null) return overrides.includes(canonical);
  const url = new URL(canonical);
  if (url.protocol === 'capacitor:') return true;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return isIP(host) === 6 && /^f[cd][0-9a-f]{2}:/i.test(host);
}
