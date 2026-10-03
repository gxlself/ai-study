import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginInfo } from '@sprout/schema';
import {
  inspectPluginZip, inspectRemotePlugin, matchesPluginReview, pluginEntryUrl, pluginSourceUrl, samePluginDeclaration,
} from './plugin-review';

const origin = 'https://family.example';
const manifest = {
  schemaVersion: 1, id: 'example.puzzle', name: { zh: '拼图插件' }, version: '1.0.0',
  sdk: '^1.0.0', entry: 'index.js', permissions: ['network', 'storage'],
  activities: [{ type: 'example.puzzle', name: { zh: '拼图' } }],
};
const bytes = () => strToU8(JSON.stringify(manifest));
const remoteResponse = () => new Response(bytes(), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.useRealTimers());

describe('安装前读取 ZIP 清单', () => {
  it.each(['plugin.json', 'puzzle/plugin.json'])('读取 %s 并展示安装后的来源入口', (path) => {
    const zip = zipSync({ [path]: bytes(), 'assets/large.bin': new Uint8Array(2 * 1024 * 1024) });
    const result = inspectPluginZip(zip, 'puzzle.zip', origin);
    expect(result.manifest.permissions).toEqual(['network', 'storage']);
    expect(result.sourceUrl).toBe('本地 ZIP：puzzle.zip');
    expect(result.entryUrl).toBe('https://family.example/plugins/example.puzzle/index.js');
  });
  it('拒绝缺失、重复、非法清单和不安全路径', () => {
    const invalidFiles: Record<string, Uint8Array>[] = [
      { 'index.js': strToU8('export default {}') },
      { 'plugin.json': bytes(), 'another/plugin.json': bytes() },
      { 'plugin.json': strToU8('{}') },
      { 'plugin.json': strToU8('{invalid') },
      { 'plugin.json': bytes(), '../outside': strToU8('unsafe') },
    ];
    for (const files of invalidFiles) expect(() => inspectPluginZip(zipSync(files), 'puzzle.zip', origin)).toThrow();
  });
  it('在解压清单前限制大小', () => {
    const oversized = strToU8(`${JSON.stringify(manifest)}${' '.repeat(1024 * 1024)}`);
    expect(() => inspectPluginZip(zipSync({ 'plugin.json': oversized }), 'puzzle.zip', origin)).toThrow('1 MB');
  });
});

describe('远程插件清单读取', () => {
  it('不发送管理员 token、cookie 或 referrer，也不自动跟随跳转', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(remoteResponse());
    const result = await inspectRemotePlugin('https://plugins.example/puzzle/plugin.json', undefined, fetcher);
    expect(result.entryUrl).toBe('https://plugins.example/puzzle/index.js');
    expect(result.sourceUrl).toBe('https://plugins.example/puzzle/plugin.json');
    const options = fetcher.mock.calls[0][1]!;
    expect(options.credentials).toBe('omit');
    expect(options.referrerPolicy).toBe('no-referrer');
    expect(options.redirect).toBe('error');
    expect(new Headers(options.headers).has('Authorization')).toBe(false);
  });
  it('拒绝非 HTTP(S) 和带凭据来源，不发起请求', async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const url of ['javascript:alert(1)', 'https://admin:secret@plugins.example/plugin.json']) {
      await expect(inspectRemotePlugin(url, undefined, fetcher)).rejects.toThrow('HTTP(S)');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('不能跨域读取时明确提示使用 ZIP，不以未知权限继续安装', async () => {
    await expect(inspectRemotePlugin('https://plugins.example/plugin.json', undefined,
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))).rejects.toThrow('ZIP');
  });
  it('检查 Content-Length 与实际流大小，不相信缺失或偏小的长度', async () => {
    const tooLarge = new Uint8Array(1024 * 1024 + 1);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bytes(), {
      headers: { 'Content-Length': String(tooLarge.length) },
    })).mockResolvedValueOnce(new Response(tooLarge, { headers: { 'Content-Length': '1' } }));
    await expect(inspectRemotePlugin('https://plugins.example/plugin.json', undefined, fetcher)).rejects.toThrow('1 MB');
    await expect(inspectRemotePlugin('https://plugins.example/plugin.json', undefined, fetcher)).rejects.toThrow('1 MB');
  });
  it('10 秒超时会取消网络请求', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const request = inspectRemotePlugin('https://plugins.example/plugin.json', undefined, fetcher);
    const rejected = expect(request).rejects.toThrow('读取插件清单超时');
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

describe('插件来源与权限核对', () => {
  it('来源 URL 只允许 HTTP(S)，兼容受管本地入口', () => {
    expect(pluginEntryUrl('/plugins/example.puzzle/index.js', origin)).toBe(`${origin}/plugins/example.puzzle/index.js`);
    expect(pluginEntryUrl('javascript:alert(1)', origin)).toBeUndefined();
    expect(pluginEntryUrl(undefined, origin)).toBeUndefined();
  });
  it('服务端权限、版本或入口变更不能复用先前的知情同意', () => {
    const review = inspectPluginZip(zipSync({ 'plugin.json': bytes() }), 'puzzle.zip', origin);
    const plugin: PluginInfo = {
      ...manifest, source: 'installed', enabled: true, entryUrl: '/plugins/example.puzzle/index.js',
      permissions: ['storage', 'network'],
    };
    expect(matchesPluginReview(plugin, review, origin)).toBe(true);
    expect(matchesPluginReview({ ...plugin, permissions: ['camera'] }, review, origin)).toBe(false);
    expect(matchesPluginReview({ ...plugin, version: '1.1.0' }, review, origin)).toBe(false);
    expect(matchesPluginReview({ ...plugin, entryUrl: 'https://changed.example/code.js' }, review, origin)).toBe(false);
  });
  it('启用前复核来源、版本和权限，权限顺序或启用状态变化不影响声明', () => {
    const plugin: PluginInfo = {
      ...manifest, source: 'remote', enabled: false, entryUrl: 'https://plugins.example/index.js',
    };
    expect(samePluginDeclaration(plugin, { ...plugin, permissions: ['storage', 'network'], enabled: true }, origin)).toBe(true);
    expect(samePluginDeclaration(plugin, { ...plugin, permissions: ['camera'] }, origin)).toBe(false);
    expect(samePluginDeclaration(plugin, { ...plugin, source: 'installed' }, origin)).toBe(false);
    expect(samePluginDeclaration(plugin, { ...plugin, entryUrl: 'https://other.example/index.js' }, origin)).toBe(false);
    expect(samePluginDeclaration(plugin, { ...plugin, version: '2.0.0' }, origin)).toBe(false);
  });
  it('使用 T18 返回的远程清单 URL，旧服务端没有此字段时展示入口来源', () => {
    const plugin: PluginInfo = { ...manifest, source: 'remote', enabled: false, entryUrl: 'https://plugins.example/index.js' };
    const before = { ...plugin, manifestUrl: 'https://plugins.example/plugin.json' };
    const after = { ...plugin, manifestUrl: 'https://another.example/plugin.json' };
    expect(pluginSourceUrl(before, origin)).toBe('https://plugins.example/plugin.json');
    expect(pluginSourceUrl(plugin, origin)).toBe('https://plugins.example/index.js');
    expect(samePluginDeclaration(before, after, origin)).toBe(false);
  });
});
