// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { PluginInfo } from '@sprout/schema';

vi.mock('@sprout/activities', () => ({
  builtinActivities: [{
    type: 'word-cards', version: '1.0.0', name: { zh: '图像词卡' },
    mount: () => ({ unmount() {} }),
  }],
}));

import { ActivityRegistry, SproutHost } from './registry';

let moduleId = 0;
function moduleUrl(source: string): string {
  return `data:text/javascript,${encodeURIComponent(`${source}\n// ${++moduleId}`)}`;
}

function pluginCode(type: string): string {
  return `{ type: ${JSON.stringify(type)}, version: '1.0.0', name: { zh: '测试活动' }, mount() { return { unmount() {} }; } }`;
}

function info(id: string, entryUrl: string, types: string[], patch: Partial<PluginInfo> = {}): PluginInfo {
  return {
    id, entryUrl, version: '1.0.0', name: { zh: '测试插件' }, enabled: true, source: 'remote',
    activities: types.map((type) => ({ type, name: { zh: '测试活动' } })), permissions: [],
    ...patch,
  };
}

describe('ActivityRegistry', () => {
  it('registers imported builtins and exposes the shared React runtime immediately', () => {
    const registry = new ActivityRegistry();
    expect(registry.get('word-cards')?.name.zh).toBe('图像词卡');
    expect(registry.get('absent')).toBeUndefined();
    expect(globalThis.SproutHost).toBe(SproutHost);
    expect(SproutHost.sdkVersion).toBe('1.0.0');
    expect(SproutHost.React).toHaveProperty('createElement');
    expect(SproutHost.ReactDOMClient).toHaveProperty('createRoot');
  });

  it('resolves enabled remote URLs and sets SproutHost before evaluation', async () => {
    const registry = new ActivityRegistry();
    const url = moduleUrl(`
      if (!globalThis.SproutHost?.React || !globalThis.SproutHost?.ReactDOMClient) throw new Error('missing host');
      export default ${pluginCode('example.one')};
    `);
    const resolveUrl = vi.fn(() => url);
    await registry.load([
      info('one', '/plugins/one/index.js', ['example.one']),
      info('disabled', '/disabled.js', ['example.disabled'], { enabled: false }),
      info('builtin', '/builtin.js', [], { source: 'builtin' }),
      info('empty', '', []),
    ], resolveUrl);
    expect(resolveUrl).toHaveBeenCalledExactlyOnceWith('/plugins/one/index.js');
    expect(registry.get('example.one')?.type).toBe('example.one');
    expect(registry.errors).toEqual([]);
  });

  it('supports both default arrays and registerActivity-only modules', async () => {
    const registry = new ActivityRegistry();
    const arrayUrl = moduleUrl(`export default [${pluginCode('example.one')}, ${pluginCode('example.two')}];`);
    const registerUrl = moduleUrl(`globalThis.SproutHost.registerActivity(${pluginCode('example.three')});`);
    await registry.load([
      info('array', arrayUrl, ['example.one', 'example.two']),
      info('registration', registerUrl, ['example.three']),
    ], (url) => url);
    for (const type of ['example.one', 'example.two', 'example.three']) expect(registry.get(type)?.type).toBe(type);
    await registry.load([], (url) => url);
    expect(registry.get('example.three')).toBeUndefined();
    await registry.load([info('registration', registerUrl, ['example.three'])], (url) => url);
    expect(registry.get('example.three')?.type).toBe('example.three');
  });

  it('isolates import failures and does not register malformed, undeclared, or unnamespaced activities', async () => {
    const registry = new ActivityRegistry();
    const malformedUrl = moduleUrl('export default { type: "example.broken", version: "1.0.0", name: { zh: "bad" } };');
    const failedUrl = moduleUrl('throw new Error("could not load plugin");');
    const validUrl = moduleUrl(`export default [${pluginCode('example.valid')}, ${pluginCode('example.undeclared')}, ${pluginCode('word-cards')}];`);
    const builtin = registry.get('word-cards');
    await registry.load([
      info('malformed', malformedUrl, ['example.broken']),
      info('failed', failedUrl, ['example.failed']),
      info('valid', validUrl, ['example.valid', 'word-cards']),
    ], (url) => url);
    expect(registry.get('example.valid')).toBeDefined();
    expect(registry.get('example.broken')).toBeUndefined();
    expect(registry.get('example.undeclared')).toBeUndefined();
    expect(registry.get('word-cards')).toBe(builtin);
    expect(registry.errors.map((error) => error.pluginId)).toEqual(['malformed', 'failed']);
  });

  it('removes disabled plugins when reloading without losing builtins', async () => {
    const registry = new ActivityRegistry();
    const plugin = info('one', moduleUrl(`export default ${pluginCode('example.one')};`), ['example.one']);
    await registry.load([plugin], (url) => url);
    expect(registry.get('example.one')).toBeDefined();
    await registry.load([{ ...plugin, enabled: false }], (url) => url);
    expect(registry.get('example.one')).toBeUndefined();
    expect(registry.get('word-cards')).toBeDefined();
    SproutHost.registerActivity({
      type: 'example.one', version: '1.0.0', name: { zh: '迟到的注册' }, mount: () => ({ unmount() {} }),
    });
    expect(registry.get('example.one')).toBeUndefined();
  });

  it('ignores stale loads that complete after a newer bootstrap', async () => {
    const registry = new ActivityRegistry();
    const url = moduleUrl(`export default ${pluginCode('example.stale')};`);
    const pending = registry.load([info('stale', url, ['example.stale'])], (value) => value);
    await registry.load([], (value) => value);
    await pending;
    expect(registry.get('example.stale')).toBeUndefined();
    expect(registry.errors).toEqual([]);
  });
});
