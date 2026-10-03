import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync } from 'fflate';
import { BUILTIN_ACTIVITY_TYPES } from '@sprout/schema';
import { PluginRegistry, REMOTE_MANIFEST_MAX_BYTES, REMOTE_MANIFEST_TIMEOUT_MS } from '../src/plugins/registry';
import { PackRegistry } from '../src/content/registry';
import { RegistryError } from '../src/content/files';
import {
  json, lesson, packFiles, patchFirstZipSize, plugin, pluginDatabase, pluginZip, renameZipEntry, writeFiles,
} from './fixtures/content';

let root: string, db: DatabaseSync;
const create = (fetch?: typeof globalThis.fetch) => new PluginRegistry({
  dataDir: root, db, fetch, resolver: async () => [{ address: '93.184.216.34', family: 4 }],
});
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'sprout-plugins-')); db = pluginDatabase(); });
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); db.close();
  rmSync(root, { recursive: true, force: true });
});

describe('PluginRegistry builtin and ZIP plugins', () => {
  it('exposes all seventeen builtins as one PluginInfo with props schemas and no URL', () => {
    const registry = create(), list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'sprout.builtin', source: 'builtin', enabled: true });
    expect(list[0].entryUrl).toBeUndefined();
    expect(list[0].activities.map((activity) => activity.type)).toEqual(BUILTIN_ACTIVITY_TYPES);
    expect(list[0].activities).toHaveLength(17);
    expect(list[0].activities.some((activity) => activity.type === 'guide')).toBe(true);
    expect(list[0].activities.every((activity) => activity.name.zh && activity.propsSchema)).toBe(true);
    expect(() => registry.deletePlugin('sprout.builtin')).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(registry.setEnabled('sprout.builtin', false).enabled).toBe(false);
    expect(create().list()[0].enabled).toBe(false);
    expect(registry.setEnabled('sprout.builtin', true).enabled).toBe(true);
  });

  it('installs a wrapper ZIP, persists metadata, toggles and deletes', async () => {
    const registry = create(), info = await registry.installZip(pluginZip(plugin({ permissions: ['storage', 'network'] }), {}, 'demo/'));
    expect(info).toMatchObject({
      id: 'acme.demo', source: 'installed', enabled: true, entryUrl: '/plugins/acme.demo/dist/index.js',
      permissions: ['storage', 'network'],
    });
    expect(info.manifestUrl).toBeUndefined();
    expect(registry.directory(info.id)).toBe(realpathSync(join(root, 'plugins/acme.demo')));
    expect(create().list()[1]).toEqual(info);
    registry.setEnabled(info.id, false);
    expect(registry.list()[1].enabled).toBe(false);
    expect(registry.validateExternal('acme.touch', {})).toBeNull();
    registry.setEnabled(info.id, true);
    registry.deletePlugin(info.id);
    expect(registry.list()).toHaveLength(1);
    expect(registry.directory(info.id)).toBeUndefined();
    expect(existsSync(join(root, 'plugins/acme.demo'))).toBe(false);
  });

  it('supports a validated absolute HTTPS entry without fetching code', async () => {
    const registry = create();
    expect((await registry.installZip(pluginZip(plugin({ entry: 'https://example.test/module.js' })))).entryUrl).toBe('https://example.test/module.js');
  });

  it('validates type, required and nested array/object schemas with own-property checks', async () => {
    const registry = create(); await registry.installZip(pluginZip());
    expect(registry.validateExternal('acme.touch', { title: 'hi', rounds: [{ count: 1 }], hint: null, flags: { enabled: false } })).toEqual([]);
    const issues = registry.validateExternal('acme.touch', { title: 2, rounds: [{ count: 1.2 }, {}], hint: false, flags: {} })!;
    expect(issues.map((issue) => issue.path)).toEqual(['title', 'rounds.0.count', 'rounds.1.count', 'hint', 'flags.enabled']);
    expect(registry.validateExternal('acme.touch', Object.create({ title: 'inherited', rounds: [] }))!.map((issue) => issue.path)).toEqual(['title', 'rounds']);
    expect(registry.validateExternal('acme.touch', null)![0].path).toBe('');
    expect(registry.validateExternal('unknown.activity', {})).toBeNull();
    expect(registry.validateExternal('word-cards', {})).toBeNull();
  });

  it('returns [] for an enabled activity without a props schema', async () => {
    const registry = create();
    await registry.installZip(pluginZip(plugin({ activities: [{ type: 'acme.simple', name: { zh: '简单活动' } }] })));
    expect(registry.validateExternal('acme.simple', { arbitrary: true })).toEqual([]);
  });

  it('upgrades monotonically while preserving enablement and rolls back invalid versions', async () => {
    const registry = create();
    await registry.installZip(pluginZip());
    registry.setEnabled('acme.demo', false);
    const before = readFileSync(join(root, 'plugins/acme.demo/plugin.json'), 'utf8');
    await expect(registry.installZip(pluginZip(plugin({ version: '2.0.0', entry: 'missing.js' })))).rejects.toThrow(RegistryError);
    expect(readFileSync(join(root, 'plugins/acme.demo/plugin.json'), 'utf8')).toBe(before);
    await expect(registry.installZip(pluginZip())).rejects.toThrow(expect.objectContaining({ statusCode: 409 }));
    expect((await registry.installZip(pluginZip(plugin({ version: '2.0.0' })))).enabled).toBe(false);
    expect(registry.list()[1].version).toBe('2.0.0');
  });

  it('rolls filesystem replacement back if the database rejects the upsert', async () => {
    const registry = create(); await registry.installZip(pluginZip());
    db.exec("CREATE TRIGGER reject_update BEFORE UPDATE ON plugins BEGIN SELECT RAISE(ABORT, 'reject'); END");
    await expect(registry.installZip(pluginZip(plugin({ version: '2.0.0' })))).rejects.toThrow(expect.objectContaining({ statusCode: 500 }));
    expect(JSON.parse(readFileSync(join(root, 'plugins/acme.demo/plugin.json'), 'utf8')).version).toBe('1.0.0');
    expect(registry.list()[1].version).toBe('1.0.0');
  });

  it('rejects builtin replacement, invalid schemas, duplicate and conflicting activity types', async () => {
    const registry = create();
    await expect(registry.installZip(pluginZip(plugin({ id: 'sprout.builtin' })))).rejects.toThrow(expect.objectContaining({ statusCode: 403 }));
    await expect(registry.installZip(pluginZip(plugin({ activities: [plugin().activities[0], plugin().activities[0]] })))).rejects.toThrow(RegistryError);
    await expect(registry.installZip(pluginZip(plugin({ activities: [{
      type: 'acme.touch', name: { zh: '轻触' }, propsSchema: { type: 'bogus' },
    }] })))).rejects.toThrow(RegistryError);
    await registry.installZip(pluginZip());
    await expect(registry.installZip(pluginZip(plugin({ id: 'other.vendor' })))).rejects.toThrow(expect.objectContaining({ statusCode: 409 }));
    expect(registry.list()).toHaveLength(2);
  });

  it.each(['../module.js', '/module.js', 'file:///tmp/module.js', 'javascript:alert(1)', 'dist\\index.js'])('rejects unsafe entry %s', async (entry) => {
    await expect(create().installZip(pluginZip(plugin({ entry })))).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('rejects malicious ZIP paths, duplicates, symbolic links and forged sizes', async () => {
    const registry = create();
    await expect(registry.installZip(pluginZip(plugin(), { '../escape': strToU8('x') }))).rejects.toThrow(RegistryError);
    await expect(registry.installZip(renameZipEntry(pluginZip(plugin(), {
      'dup-a': strToU8('a'), 'dup-b': strToU8('b'),
    }), 'dup-b', 'dup-a'))).rejects.toThrow(RegistryError);
    await expect(registry.installZip(pluginZip(plugin(), {
      link: [strToU8('/tmp/outside'), { os: 3, attrs: 0o120777 << 16 }],
    }))).rejects.toThrow(RegistryError);
    await expect(registry.installZip(patchFirstZipSize(pluginZip(), 1))).rejects.toThrow(RegistryError);
    await expect(registry.installZip(zipSync({ 'not-plugin.json': json(plugin()) }))).rejects.toThrow(RegistryError);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('rejects a symlink destination or tampered stored directory', async () => {
    const registry = create();
    const outside = join(root, 'outside');
    writeFiles(outside, { 'keep.txt': strToU8('keep') });
    symlinkSync(outside, join(root, 'plugins/acme.demo'));
    await expect(registry.installZip(pluginZip())).rejects.toThrow(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('keep');
    rmSync(join(root, 'plugins/acme.demo'));
    await registry.installZip(pluginZip());
    db.prepare('UPDATE plugins SET directory = ? WHERE id = ?').run(outside, 'acme.demo');
    expect(() => registry.directory('acme.demo')).toThrow(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    expect(() => registry.deletePlugin('acme.demo')).toThrow(RegistryError);
    expect(existsSync(outside)).toBe(true);
  });

  it('has structured not-found errors', () => {
    const registry = create();
    expect(() => registry.setEnabled('missing', true)).toThrow(expect.objectContaining({ statusCode: 404, code: 'PLUGIN_NOT_FOUND' }));
    expect(() => registry.deletePlugin('missing')).toThrow(expect.objectContaining({ statusCode: 404, code: 'PLUGIN_NOT_FOUND' }));
  });
});

describe('remote plugin registration', () => {
  it('resolves entry against the final redirect URL and retains enablement during replacement', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://cdn.example.test/v1/plugin.json' } }))
      .mockResolvedValueOnce(Response.json(plugin({ entry: '../module.js', permissions: ['camera', 'microphone'] })))
      .mockResolvedValueOnce(Response.json(plugin({ version: '2.0.0', entry: 'https://example.test/absolute.js', permissions: ['network'] })));
    const registry = create(fetcher);
    const info = await registry.registerRemote('https://example.test/plugin.json');
    expect(info).toMatchObject({
      source: 'remote', entryUrl: 'https://cdn.example.test/module.js', enabled: true,
      manifestUrl: 'https://cdn.example.test/v1/plugin.json', permissions: ['camera', 'microphone'],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(registry.directory(info.id)).toBeUndefined();
    registry.setEnabled(info.id, false);
    expect((await registry.registerRemote('https://example.test/plugin.json')).enabled).toBe(false);
    expect(create().list()[1]).toMatchObject({
      entryUrl: 'https://example.test/absolute.js', manifestUrl: 'https://example.test/plugin.json', permissions: ['network'],
    });
    registry.deletePlugin(info.id);
    expect(registry.list()).toHaveLength(1);
  });

  it('can replace an installed plugin with a newer remote manifest', async () => {
    const registry = create(vi.fn<typeof fetch>().mockResolvedValue(Response.json(plugin({ version: '2.0.0' }))));
    await registry.installZip(pluginZip());
    await registry.registerRemote('https://example.test/plugin.json');
    expect(existsSync(join(root, 'plugins/acme.demo'))).toBe(false);
    expect(registry.list()[1].entryUrl).toBe('https://example.test/dist/index.js');
  });

  it.each(['file:///etc/passwd', 'ftp://example.test/plugin.json', 'data:application/json,{}', 'https://user:pass@example.test/plugin.json', 'invalid'])('rejects %s before fetching', async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(create(fetcher).registerRemote(url)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_URL' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects non-HTTP redirects and non-HTTP entry URLs without storing rows', async () => {
    const registry = create(vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } }))
      .mockResolvedValueOnce(Response.json(plugin({ entry: 'javascript:alert(1)' }))));
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ code: 'INVALID_URL' });
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ code: 'INVALID_URL' });
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('limits advertised and streamed manifest bytes regardless of content-length', async () => {
    const registry = create(vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { headers: { 'content-length': String(REMOTE_MANIFEST_MAX_BYTES + 1) } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(REMOTE_MANIFEST_MAX_BYTES + 1), { headers: { 'content-length': '1' } })));
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ statusCode: 413 });
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ statusCode: 413 });
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('times out even if an injected fetch ignores abort', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const registry = create(vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      signal = init?.signal; return new Promise(() => {});
    }));
    const pending = registry.registerRemote('https://example.test/plugin.json');
    const assertion = expect(pending).rejects.toMatchObject({ statusCode: 504, code: 'REMOTE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an endless body stream on timeout and writes nothing later', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(strToU8('{')); }, cancel });
    const registry = create(vi.fn<typeof fetch>().mockResolvedValue(new Response(stream)));
    const pending = registry.registerRemote('https://example.test/plugin.json');
    const assertion = expect(pending).rejects.toMatchObject({ statusCode: 504 });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    expect(cancel).toHaveBeenCalled();
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('rejects bad status, JSON, schema, and redirect loops without partial state', async () => {
    const registry = create(vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('{'))
      .mockResolvedValueOnce(Response.json({ id: 'bad' }))
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: '/again' } })));
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ statusCode: 502 });
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ statusCode: 400 });
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ statusCode: 400, issues: expect.any(Array) });
    await expect(registry.registerRemote('https://example.test/plugin.json')).rejects.toMatchObject({ code: 'REMOTE_REDIRECT' });
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });
});

describe('plugin and pack integration', () => {
  it('revalidates external props after install/enable/delete despite an unchanged content signature', async () => {
    const plugins = create();
    writeFiles(join(root, 'content/core'), packFiles({
      lessons: [lesson('mini.external', { steps: [{ type: 'acme.touch', props: {} }] })],
    }));
    const packs = new PackRegistry({
      dataDir: root, contentDirs: [join(root, 'content')], validateExternal: (type, props) => plugins.validateExternal(type, props),
    });
    expect(packs.getLesson('mini.external')?.issues[0].level).toBe('warning');
    await plugins.installZip(pluginZip()); packs.reload();
    expect(packs.getLesson('mini.external')).toBeUndefined();
    expect(packs.validate('sprout.core').some((issue) => issue.path.includes('steps.0.props.title'))).toBe(true);
    plugins.setEnabled('acme.demo', false); packs.reload();
    expect(packs.getLesson('mini.external')?.issues[0].level).toBe('warning');
    plugins.setEnabled('acme.demo', true); packs.reload();
    expect(packs.getLesson('mini.external')).toBeUndefined();
    plugins.deletePlugin('acme.demo'); packs.reload();
    expect(packs.getLesson('mini.external')).toBeDefined();
  });
});
