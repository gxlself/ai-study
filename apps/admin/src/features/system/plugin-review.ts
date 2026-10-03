import { PluginManifest, type PluginInfo } from '@sprout/schema';
import { strFromU8, unzipSync } from 'fflate';
import { normalizeHttpUrl } from './helpers';

export const PLUGIN_TRUST_WARNING = '插件与播放端同源运行，只安装你信任的来源';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

export interface PluginReview {
  manifest: PluginManifest;
  sourceUrl: string;
  entryUrl: string;
}

function parseManifest(text: string): PluginManifest {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('plugin.json 不是有效的 JSON。'); }
  const parsed = PluginManifest.safeParse(value);
  if (!parsed.success) throw new Error('plugin.json 格式无效，无法核对插件权限。');
  if (parsed.data.id === 'sprout.builtin') throw new Error('不能替换芽芽内置活动。');
  return parsed.data;
}

export function pluginEntryUrl(entry: string | undefined, origin: string): string | undefined {
  if (!entry) return undefined;
  try { return normalizeHttpUrl(new URL(entry, origin).href); }
  catch { return undefined; }
}

function pluginManifestUrl(plugin: PluginInfo): string | undefined {
  return plugin.source === 'remote' && 'manifestUrl' in plugin && typeof plugin.manifestUrl === 'string'
    ? normalizeHttpUrl(plugin.manifestUrl) : undefined;
}

export function pluginSourceUrl(plugin: PluginInfo, origin: string): string {
  return plugin.source === 'remote'
    ? pluginManifestUrl(plugin) ?? pluginEntryUrl(plugin.entryUrl, origin) ?? '来源未提供'
    : '本地安装';
}

export function inspectPluginZip(bytes: Uint8Array, filename: string, origin: string): PluginReview {
  if (!bytes.length || bytes.length > MAX_ZIP_BYTES) throw new Error('插件 ZIP 不能为空或超过 50 MB。');
  let count = 0;
  const manifests: string[] = [];
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (++count > 5000) throw new Error('插件 ZIP 文件条目过多。');
      if (file.name.startsWith('/') || file.name.includes('\\') || file.name.split('/').includes('..')) {
        throw new Error('插件 ZIP 包含不安全路径。');
      }
      if (!/^(?:[^/]+\/)?plugin\.json$/.test(file.name)) return false;
      if (file.originalSize > MAX_MANIFEST_BYTES || file.size > MAX_MANIFEST_BYTES) {
        throw new Error('plugin.json 不能超过 1 MB。');
      }
      manifests.push(file.name);
      if (manifests.length > 1) throw new Error('插件 ZIP 必须只有一份 plugin.json。');
      return true;
    },
  });
  if (manifests.length !== 1) throw new Error('插件 ZIP 根目录或单一子目录内缺少 plugin.json。');
  const content = files[manifests[0]];
  if (content.byteLength > MAX_MANIFEST_BYTES) throw new Error('plugin.json 不能超过 1 MB。');
  const manifest = parseManifest(strFromU8(content));
  const entryUrl = pluginEntryUrl(manifest.entry, `${origin}/plugins/${encodeURIComponent(manifest.id)}/`);
  if (!entryUrl) throw new Error('插件入口必须是 HTTP(S) 地址或插件内相对路径。');
  return { manifest, sourceUrl: `本地 ZIP：${filename}`, entryUrl };
}

export async function inspectRemotePlugin(
  value: string, signal?: AbortSignal, fetcher: typeof fetch = globalThis.fetch,
): Promise<PluginReview> {
  const sourceUrl = normalizeHttpUrl(value);
  if (!sourceUrl || sourceUrl.length > 2048) throw new Error('请输入不含账号密码的 HTTP(S) 清单地址。');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 10000);
  try {
    const response = await fetcher(sourceUrl, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' },
    });
    if (!response.ok || !response.body) throw new Error('无法读取远程 plugin.json。');
    if (Number(response.headers.get('content-length')) > MAX_MANIFEST_BYTES) {
      void response.body.cancel();
      throw new Error('plugin.json 不能超过 1 MB。');
    }
    const reader = response.body.getReader();
    const abortRead = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', abortRead, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        if (controller.signal.aborted) throw new Error('读取插件清单已取消或超时。');
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_MANIFEST_BYTES) throw new Error('plugin.json 不能超过 1 MB。');
        chunks.push(next.value);
      }
    } finally {
      controller.signal.removeEventListener('abort', abortRead);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (controller.signal.aborted) throw new Error('读取插件清单已取消或超时。');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const manifest = parseManifest(strFromU8(bytes));
    const entryUrl = pluginEntryUrl(manifest.entry, sourceUrl);
    if (!entryUrl) throw new Error('远程插件入口必须是 HTTP(S) 地址。');
    return { manifest, sourceUrl, entryUrl };
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error(signal?.aborted ? '读取插件清单已取消。' : '读取插件清单超时，请重试或改用 ZIP。');
    }
    if (cause instanceof TypeError) {
      throw new Error('无法读取远程清单。请确认来源允许跨域读取且没有跳转，或改用该来源提供的 ZIP。');
    }
    throw cause;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}

export function matchesPluginReview(plugin: PluginInfo, review: PluginReview, origin: string): boolean {
  const sourceUrl = pluginManifestUrl(plugin);
  return plugin.id === review.manifest.id && plugin.version === review.manifest.version &&
    (!sourceUrl || sourceUrl === review.sourceUrl) &&
    pluginEntryUrl(plugin.entryUrl, origin) === review.entryUrl &&
    JSON.stringify([...new Set(plugin.permissions)].sort()) ===
      JSON.stringify([...new Set(review.manifest.permissions)].sort());
}

export function samePluginDeclaration(before: PluginInfo, after: PluginInfo, origin: string): boolean {
  return before.id === after.id && before.version === after.version && before.source === after.source &&
    pluginSourceUrl(before, origin) === pluginSourceUrl(after, origin) &&
    pluginEntryUrl(before.entryUrl, origin) === pluginEntryUrl(after.entryUrl, origin) &&
    JSON.stringify([...new Set(before.permissions)].sort()) === JSON.stringify([...new Set(after.permissions)].sort());
}
