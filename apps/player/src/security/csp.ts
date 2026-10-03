import type { PluginInfo } from '@sprout/schema';

// 只放行当前 Vite React 开发引导的两种 base，不允许任意内联脚本。
const DEV_PREAMBLE = "'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=' 'sha256-xcROUoAq4P1ftagk66YyTCVnYIRS7MPKYaPLRp2ypIY='";

export function pluginEntry(info: PluginInfo, resolve: (url: string) => string, server: string): string {
  if (!info.enabled || info.source === 'builtin' || !info.entryUrl) throw new Error('插件未登记或未启用');
  const base = server ? `${server}/` : globalThis.location?.href || 'http://localhost/';
  const expected = new URL(info.entryUrl, base);
  const resolved = new URL(resolve(info.entryUrl), base);
  if (!['http:', 'https:'].includes(expected.protocol) || expected.username || expected.password ||
    /[\u0000-\u0020\\]/.test(info.entryUrl) || resolved.href !== expected.href) {
    throw new Error('插件入口必须是已登记的 HTTP(S) 地址');
  }
  if (info.source === 'installed' && resolved.origin !== new URL(base).origin) {
    throw new Error('已安装插件必须由家庭服务器提供');
  }
  return resolved.href;
}

export function runtimePolicy(server: string, entries: readonly string[], dev: boolean): string {
  const origin = server ? new URL(server).origin : '';
  const sources = ["'self'", ...(origin ? [origin] : [])].join(' ');
  const scripts = [...new Set(entries.map((entry) => {
    const url = new URL(entry);
    return `${url.origin}${url.pathname}`;
  }))];
  const socket = dev && globalThis.location?.host ? `ws://${location.host} wss://${location.host}` : '';
  return [
    "default-src 'self'", "base-uri 'none'", "object-src 'none'", "form-action 'none'",
    `script-src 'self' ${dev ? DEV_PREAMBLE : ''} ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'", "font-src 'self'",
    // 外部 H5 的最终来源检查需 CORS HEAD；媒体与脚本仍各自使用严格来源集合。
    `connect-src ${sources} http: https: ${socket}`,
    `img-src ${sources} blob: data:`, `media-src ${sources} blob: data:`,
    'frame-src http: https:', "worker-src 'self' blob:",
  ].join('; ');
}

/** CSP 只能收紧。新服务器或新插件来源需要重开页面，不能偷偷扩大旧策略。 */
export function installRuntimePolicy(server: string, entries: readonly string[]): void {
  if (typeof document === 'undefined') return;
  const policy = runtimePolicy(server, entries, import.meta.env.DEV);
  const previous = document.querySelector<HTMLMetaElement>('meta[data-sprout-csp]');
  if (previous) {
    const allowed = JSON.parse(previous.dataset.entries ?? '[]') as string[];
    if (previous.dataset.server !== server || entries.some((entry) => !allowed.includes(entry))) {
      throw new Error('服务器或插件来源已变化，请重新打开播放端');
    }
    return;
  }
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = policy;
  meta.dataset.sproutCsp = '';
  meta.dataset.server = server;
  meta.dataset.entries = JSON.stringify(entries);
  document.head.append(meta);
}
