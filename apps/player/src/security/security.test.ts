import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginInfo } from '@sprout/schema';
import { installRuntimePolicy, pluginEntry, runtimePolicy } from './csp';
import { adminOrigin, configuredServer, consumePreviewCredential, isPreviewPath, trustedPreviewMessage, trustedPreviewServer } from './preview';

afterEach(() => {
  document.querySelectorAll('meta[data-sprout-csp]').forEach((element) => element.remove());
  history.replaceState(null, '', '/');
});

describe('预览凭据与消息来源', () => {
  it.each([
    ['/preview', true], ['/preview/core.test', true], ['/Preview/core.test', true], ['/%70review/core.test', true],
    ['/preview-other', false], ['/lesson/core.test', false], ['/%invalid', false],
  ] as const)('统一判定 %s，不把预览别名当成设备页面', (path, expected) => {
    expect(isPreviewPath(path)).toBe(expected);
  });
  it('消费短期凭据后从 URL 移除，保留非敏感预览参数，不落盘', () => {
    const before = { local: { ...localStorage }, session: { ...sessionStorage } };
    history.replaceState(null, '', '/#/preview/core.test?previewToken=preview-secret&mode=zh&age=24');
    const result = consumePreviewCredential(new URLSearchParams('previewToken=preview-secret&mode=zh&age=24'));
    expect(result).toEqual({ token: 'preview-secret', error: '' });
    expect(location.href).not.toContain('secret');
    expect(location.hash).toBe('#/preview/core.test?mode=zh&age=24');
    expect({ local: { ...localStorage }, session: { ...sessionStorage } }).toEqual(before);
  });
  it('拒绝旧 URL admin token，也不会回退到设备 token', () => {
    localStorage.setItem('sprout.deviceToken', 'paired-token');
    history.replaceState(null, '', '/?token=admin-secret#/preview/a?token=admin-secret&previewToken=another');
    const result = consumePreviewCredential(new URLSearchParams('token=admin-secret&previewToken=another'));
    expect(result.token).toBe('');
    expect(result.error).toContain('不再接受管理员');
    expect(location.href).not.toContain('secret');
    expect(location.href).not.toContain('another');
    expect(localStorage.getItem('sprout.deviceToken')).toBe('paired-token');
    localStorage.removeItem('sprout.deviceToken');
  });
  it('只信任明确的后台 origin 和父窗口，referrer 不参与信任', () => {
    const parent = {} as Window;
    const event = (origin: string, source: MessageEventSource) => new MessageEvent('message', { origin, source });
    expect(trustedPreviewMessage(event('https://admin.test', parent), 'https://admin.test', parent)).toBe(true);
    expect(trustedPreviewMessage(event('https://evil.test', parent), 'https://admin.test', parent)).toBe(false);
    expect(trustedPreviewMessage(event('https://admin.test', window), 'https://admin.test', parent)).toBe(false);
    expect(trustedPreviewMessage(event('https://admin.test', window), 'https://admin.test', window)).toBe(false);
    expect(adminOrigin('http://localhost:5310', 'http://localhost:5310', undefined, true)).toBe('http://localhost:5311');
    expect(adminOrigin('https://family.test', 'https://player.test')).toBe('https://family.test');
    expect(adminOrigin('', 'https://player.test', 'https://admin.test')).toBe('https://admin.test');
    expect(() => adminOrigin('', 'https://player.test', 'javascript:alert(1)')).toThrow();
  });
  it('URL 参数不能自行信任服务器或同源包内伪造的 API 前缀', () => {
    expect(trustedPreviewServer('https://evil.test', 'https://player.test')).toBe(false);
    expect(trustedPreviewServer('https://player.test/packs/untrusted', 'https://player.test')).toBe(false);
    expect(trustedPreviewServer('https://player.test', 'https://player.test')).toBe(true);
    expect(trustedPreviewServer('http://192.168.1.2:4310/family', 'https://player.test', undefined, 'http://192.168.1.2:4310/family/')).toBe(true);
    expect(trustedPreviewServer('https://admin.test', 'https://player.test', 'https://admin.test')).toBe(true);
    expect(trustedPreviewServer('http://localhost:5311', 'http://localhost:5310', undefined, undefined, true)).toBe(true);
    expect(trustedPreviewServer('http://localhost:5411', 'http://localhost:5410', undefined, undefined, true)).toBe(true);
    expect(trustedPreviewServer('http://localhost:5312', 'http://localhost:5310', undefined, undefined, true)).toBe(false);
  });
  it('仅从存储读取服务器配置，不读取设备或管理员凭据', () => {
    localStorage.setItem('sprout.server', 'https://family.test');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    expect(configuredServer()).toBe('https://family.test');
    expect(read).toHaveBeenCalledExactlyOnceWith('sprout.server');
    localStorage.removeItem('sprout.server');
    expect(configuredServer()).toBeUndefined();
  });
});

describe('插件来源与 CSP', () => {
  const info: PluginInfo = {
    id: 'example.plugin', version: '1.0.0', name: { zh: '测试' }, source: 'remote', enabled: true,
    entryUrl: 'https://trusted.test/entry.js', activities: [], permissions: [],
  };
  it('仅登记入口能求值，不能被 resolver 替换或使用危险协议', () => {
    expect(pluginEntry(info, (url) => url, 'https://family.test')).toBe(info.entryUrl);
    expect(() => pluginEntry(info, () => 'https://evil.test/entry.js', 'https://family.test')).toThrow();
    expect(() => pluginEntry({ ...info, entryUrl: 'data:text/javascript,1' }, (url) => url, '')).toThrow();
    expect(() => pluginEntry({ ...info, enabled: false }, (url) => url, '')).toThrow();
    expect(() => pluginEntry({ ...info, source: 'installed' }, (url) => url, 'https://family.test')).toThrow();
  });
  it('生产策略仅允许自身、已配置 LAN 服务器、已登记脚本和本地图片/音频', () => {
    const policy = runtimePolicy('http://192.168.1.2:4310', ['https://trusted.test/entry.js'], false);
    const script = policy.split('; ').find((part) => part.startsWith('script-src'));
    expect(script).toBe("script-src 'self'  https://trusted.test/entry.js");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(policy).toContain("media-src 'self' http://192.168.1.2:4310 blob: data:");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
  });
  it('重复 bootstrap 不扩大已经生效的 CSP，新来源必须重开页面', () => {
    installRuntimePolicy('http://192.168.1.2:4310', ['https://trusted.test/entry.js']);
    installRuntimePolicy('http://192.168.1.2:4310', []);
    expect(document.querySelectorAll('meta[data-sprout-csp]')).toHaveLength(1);
    expect(() => installRuntimePolicy('http://192.168.1.3:4310', [])).toThrow('重新打开');
    expect(() => installRuntimePolicy('http://192.168.1.2:4310', ['https://evil.test/entry.js'])).toThrow('重新打开');
  });
});
