import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { LookupAddress } from 'node:dns';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { checkServerIdentity } from 'node:tls';
import { strToU8 } from 'fflate';
import {
  PluginRegistry, REMOTE_MANIFEST_MAX_BYTES, REMOTE_MANIFEST_TIMEOUT_MS,
} from '../src/plugins/registry';
import { REMOTE_MANIFEST_MAX_REDIRECTS, type PluginResolver } from '../src/plugins/remote';
import { plugin, pluginDatabase, pluginZip } from './fixtures/content';

const publicIPv4: LookupAddress = { address: '93.184.216.34', family: 4 };
const publicIPv6: LookupAddress = { address: '2606:4700:4700::1111', family: 6 };
const lanIPv4: LookupAddress = { address: '192.168.1.12', family: 4 };
const loopback: LookupAddress = { address: '127.0.0.1', family: 4 };
const manifestUrl = 'https://plugins.example.test/plugin.json';

let root: string, db: DatabaseSync;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sprout-plugin-security-'));
  db = pluginDatabase();
  // 默认阻止任何真实网络；固定连接测试会显式替换成内存请求。
  vi.spyOn(http, 'request').mockImplementation(() => { throw new Error('测试不允许真实 HTTP 请求'); });
  vi.spyOn(https, 'request').mockImplementation(() => { throw new Error('测试不允许真实 HTTPS 请求'); });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  db.close();
  rmSync(root, { recursive: true, force: true });
});

function create(
  resolver: PluginResolver = async () => [publicIPv4],
  fetcher: typeof fetch | undefined = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(plugin())),
): PluginRegistry {
  return new PluginRegistry({ dataDir: root, db, resolver, fetch: fetcher });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

interface ResponseFixture {
  status?: number;
  headers?: http.IncomingHttpHeaders;
  chunks?: Uint8Array[];
  body?: Readable;
}
interface CapturedRequest {
  url: URL;
  options: https.RequestOptions;
  request: http.ClientRequest;
  response: http.IncomingMessage;
}

function mockNativeRequests(transport: typeof http | typeof https, fixtures: ResponseFixture[]): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  const stub = (url: URL, options: https.RequestOptions, respond: (response: http.IncomingMessage) => void) => {
    const fixture = fixtures[captured.length];
    if (!fixture) throw new Error('未预期的原生请求');
    const response = (fixture.body ?? Readable.from(fixture.chunks ?? [strToU8(JSON.stringify(plugin()))])) as http.IncomingMessage;
    response.statusCode = fixture.status ?? 200;
    response.headers = fixture.headers ?? {};
    const request = new EventEmitter() as http.ClientRequest;
    request.end = vi.fn(() => { queueMicrotask(() => respond(response)); return request; }) as http.ClientRequest['end'];
    request.destroy = vi.fn((error?: Error) => {
      response.destroy();
      if (error) queueMicrotask(() => request.emit('error', error));
      return request;
    });
    captured.push({ url, options, request, response });
    return request;
  };
  vi.mocked(transport.request).mockImplementation(stub as unknown as typeof http.request);
  return captured;
}

describe('remote plugin address policy', () => {
  it.each([
    'http://127.0.0.1/plugin.json', 'https://127.255.255.254/plugin.json',
    'http://127.1/plugin.json', 'http://2130706433/plugin.json', 'http://0x7f000001/plugin.json',
    'https://0.0.0.0/plugin.json', 'https://0.12.34.56/plugin.json',
    'https://169.254.169.254/plugin.json', 'https://169.254.170.2/plugin.json',
    'https://100.100.100.200/plugin.json', 'https://100.64.0.1/plugin.json',
    'https://100.127.255.254/plugin.json', 'https://168.63.129.16/plugin.json',
    'https://192.0.0.8/plugin.json', 'https://192.0.2.1/plugin.json', 'https://192.88.99.1/plugin.json',
    'https://198.18.0.1/plugin.json', 'https://198.19.255.254/plugin.json',
    'https://198.51.100.2/plugin.json', 'https://203.0.113.2/plugin.json',
    'https://224.0.0.1/plugin.json', 'https://240.0.0.1/plugin.json', 'https://255.255.255.255/plugin.json',
    'https://[::]/plugin.json', 'https://[::1]/plugin.json', 'https://[fe80::1]/plugin.json',
    'https://[fec0::1]/plugin.json', 'https://[ff02::1]/plugin.json',
    'https://[::ffff:127.0.0.1]/plugin.json', 'https://[::ffff:7f00:1]/plugin.json',
    'https://[::ffff:169.254.169.254]/plugin.json', 'https://[::127.0.0.1]/plugin.json',
    'https://[64:ff9b::7f00:1]/plugin.json', 'https://[100::1]/plugin.json',
    'https://[2001:db8::1]/plugin.json', 'https://[2001:2::1]/plugin.json',
    'https://[2002:7f00:1::]/plugin.json', 'https://[3fff::1]/plugin.json',
    'https://[fd00:ec2::254]/plugin.json', 'https://[fd00:ec2::23]/plugin.json',
    'https://[fd20:ce::254]/plugin.json',
    'http://8.8.8.8/plugin.json', 'http://[2606:4700:4700::1111]/plugin.json',
  ])('rejects forbidden or plaintext-public destination %s before connecting', async (url) => {
    const resolver = vi.fn<PluginResolver>().mockResolvedValue([publicIPv4]);
    const fetcher = vi.fn<typeof fetch>();
    await expect(create(resolver, fetcher).registerRemote(url)).rejects.toMatchObject({
      statusCode: 400, code: 'UNSAFE_REMOTE_ADDRESS',
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it.each([
    'http://10.0.0.2/plugin.json', 'http://10.255.255.254/plugin.json',
    'http://172.16.0.2/plugin.json', 'http://172.31.255.254/plugin.json',
    'http://192.168.1.12/plugin.json', 'https://192.168.1.12/plugin.json',
    'http://[fc00::2]/plugin.json', 'http://[fd12:3456::2]/plugin.json',
    'https://[fdff:ffff::2]/plugin.json', 'http://[::ffff:192.168.1.12]/plugin.json',
    'https://8.8.8.8/plugin.json', 'https://[2606:4700:4700::1111]/plugin.json',
  ])('allows LAN/ULA or HTTPS public destination %s', async (url) => {
    const resolver = vi.fn<PluginResolver>();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(plugin()));
    const info = await create(resolver, fetcher).registerRemote(url);
    expect(info.source).toBe('remote');
    expect(info.entryUrl).toBe(new URL('dist/index.js', url).href);
    expect(info.manifestUrl).toBe(new URL(url).href);
    expect(resolver).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://LOCALHOST./plugin.json', 'https://sub.localhost/plugin.json',
    'https://metadata/plugin.json', 'https://metadata.google.internal/plugin.json', 'https://metadata.goog/plugin.json',
    'https://instance-data.ec2.internal/plugin.json', 'https://instance-data/plugin.json',
  ])('rejects known local/metadata hostname %s even with a public resolver result', async (url) => {
    const resolver = vi.fn<PluginResolver>().mockResolvedValue([publicIPv4]);
    const fetcher = vi.fn<typeof fetch>();
    await expect(create(resolver, fetcher).registerRemote(url)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(resolver).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [publicIPv4, loopback], [loopback, publicIPv4],
    [publicIPv4, { address: '::1', family: 6 }],
    [publicIPv6, { address: '169.254.169.254', family: 4 }],
    [publicIPv4, { address: '::ffff:169.254.169.254', family: 6 }],
    [publicIPv4, { address: 'fd00:ec2::254', family: 6 }],
  ].map((addresses) => ({ addresses })))('rejects the entire DNS result if any address is forbidden: $addresses', async ({ addresses }) => {
    const resolver = vi.fn<PluginResolver>().mockResolvedValue(addresses);
    const fetcher = vi.fn<typeof fetch>();
    await expect(create(resolver, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(resolver).toHaveBeenCalledWith('plugins.example.test');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows mixed LAN/public DNS answers over HTTPS but not over HTTP', async () => {
    const resolver = vi.fn<PluginResolver>().mockResolvedValue([lanIPv4, publicIPv4, publicIPv6]);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(plugin()));
    const registry = create(resolver, fetcher);
    await expect(registry.registerRemote('http://plugins.example.test/plugin.json')).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await registry.registerRemote(manifestUrl)).source).toBe('remote');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [] as LookupAddress[],
    [{ address: 'not-an-ip', family: 4 }],
    [{ address: '127.0.0.1', family: 6 }],
    [{ address: 'fe80::1%en0', family: 6 }],
  ].map((addresses) => ({ addresses })))('fails closed for empty, malformed or mismatched DNS result $addresses', async ({ addresses }) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(create(async () => addresses, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({
      code: addresses.length ? 'UNSAFE_REMOTE_ADDRESS' : 'REMOTE_DNS_FAILED',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a structured DNS error without connecting or writing', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(create(async () => { throw new Error('ENOTFOUND'); }, fetcher).registerRemote(manifestUrl))
      .rejects.toMatchObject({ statusCode: 502, code: 'REMOTE_DNS_FAILED' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('requires an explicit resolver alongside a test fetch injection', () => {
    expect(() => new PluginRegistry({ dataDir: root, db, fetch: vi.fn<typeof fetch>() })).toThrow(TypeError);
  });
});

describe('native DNS pinning and redirect validation', () => {
  it('pins every lookup to the checked IP and keeps original Host, SNI and certificate verification', async () => {
    const source = 'https://plugins.example.test:8443/plugin.json?version=1';
    const resolver = vi.fn<PluginResolver>()
      .mockResolvedValueOnce([publicIPv4, publicIPv6])
      .mockResolvedValueOnce([publicIPv6])
      .mockResolvedValue([loopback]);
    const calls = mockNativeRequests(https, [{
      chunks: [strToU8(JSON.stringify(plugin({ entry: 'https://assets.example.test/module.js' })))],
    }]);
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('生产不应使用 fetch'));
    const registry = new PluginRegistry({ dataDir: root, db, resolver });
    expect((await registry.registerRemote(source)).entryUrl).toBe('https://assets.example.test/module.js');
    expect(globalFetch).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    const { url, options } = calls[0];
    expect(url.href).toBe(source);
    expect(options).toMatchObject({
      agent: false, family: 4, servername: 'plugins.example.test', rejectUnauthorized: true,
      headers: { host: 'plugins.example.test:8443', accept: 'application/json' },
    });
    expect(options.checkServerIdentity).toBe(checkServerIdentity);
    const single = vi.fn(), all = vi.fn();
    options.lookup!('plugins.example.test', {}, single);
    options.lookup!('plugins.example.test', { all: true }, all);
    expect(single).toHaveBeenCalledWith(null, publicIPv4.address, 4);
    expect(all).toHaveBeenCalledWith(null, [publicIPv4], 4);
    expect(resolver.mock.calls).toEqual([['plugins.example.test'], ['assets.example.test']]);
  });

  it.each([lanIPv4, { address: 'fd12:3456::12', family: 6 }])('uses a pinned native HTTP connection for LAN answer %j', async (address) => {
    const resolver = vi.fn<PluginResolver>().mockResolvedValue([address]);
    const calls = mockNativeRequests(http, [{}]);
    const registry = new PluginRegistry({ dataDir: root, db, resolver });
    expect((await registry.registerRemote('http://plugins.lan:8080/plugin.json')).entryUrl).toBe('http://plugins.lan:8080/dist/index.js');
    const callback = vi.fn();
    calls[0].options.lookup!('plugins.lan', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, address.address, address.family);
    expect(calls[0].options.headers).toMatchObject({ host: 'plugins.lan:8080' });
    expect(https.request).not.toHaveBeenCalled();
  });

  it('rechecks and pins a fresh DNS result on each relative redirect', async () => {
    const nextIP = { address: '8.8.8.8', family: 4 };
    const resolver = vi.fn<PluginResolver>()
      .mockResolvedValueOnce([publicIPv4])
      .mockResolvedValueOnce([nextIP])
      .mockResolvedValueOnce([nextIP]);
    const calls = mockNativeRequests(https, [
      { status: 302, headers: { location: '/v2/plugin.json' }, chunks: [] },
      {},
    ]);
    const registry = new PluginRegistry({ dataDir: root, db, resolver });
    const info = await registry.registerRemote(manifestUrl);
    expect(info.manifestUrl).toBe('https://plugins.example.test/v2/plugin.json');
    expect(info.entryUrl).toBe('https://plugins.example.test/v2/dist/index.js');
    const before = vi.fn(), after = vi.fn();
    calls[0].options.lookup!('plugins.example.test', {}, before);
    calls[1].options.lookup!('plugins.example.test', {}, after);
    expect(before).toHaveBeenCalledWith(null, publicIPv4.address, 4);
    expect(after).toHaveBeenCalledWith(null, nextIP.address, 4);
    expect(resolver).toHaveBeenCalledTimes(3);
  });

  it.each([301, 302, 303, 307, 308])('rejects a %s redirect to metadata before its request', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status, headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    }));
    await expect(create(undefined, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('checks the DNS results of every hop, including a later unsafe DNS answer', async () => {
    const resolver = vi.fn<PluginResolver>()
      .mockResolvedValueOnce([publicIPv4])
      .mockResolvedValueOnce([publicIPv6])
      .mockResolvedValueOnce([publicIPv4, loopback]);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://cdn.example.test/plugin.json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: 'https://third.example.test/plugin.json' } }));
    await expect(create(resolver, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(resolver.mock.calls).toEqual([['plugins.example.test'], ['cdn.example.test'], ['third.example.test']]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects same-host rebinding during a redirect before the second native connection', async () => {
    const resolver = vi.fn<PluginResolver>()
      .mockResolvedValueOnce([publicIPv4])
      .mockResolvedValueOnce([loopback]);
    const calls = mockNativeRequests(https, [{ status: 302, headers: { location: '/again' }, chunks: [] }]);
    const registry = new PluginRegistry({ dataDir: root, db, resolver });
    await expect(registry.registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(calls).toHaveLength(1);
  });

  it('rejects an HTTPS redirect to public HTTP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: 'http://cdn.example.test/plugin.json' },
    }));
    await expect(create(undefined, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('allows exactly five redirects and refuses a sixth', async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (let hop = 1; hop <= REMOTE_MANIFEST_MAX_REDIRECTS; hop++) {
      fetcher.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: `/hop-${hop}/plugin.json` } }));
    }
    fetcher.mockResolvedValueOnce(Response.json(plugin()));
    const registry = create(undefined, fetcher);
    expect((await registry.registerRemote(manifestUrl)).manifestUrl).toBe('https://plugins.example.test/hop-5/plugin.json');
    expect(fetcher).toHaveBeenCalledTimes(6);
    fetcher.mockClear().mockResolvedValue(new Response(null, { status: 302, headers: { location: '/loop' } }));
    await expect(registry.registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'REMOTE_REDIRECT' });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(registry.list()[1].manifestUrl).toBe('https://plugins.example.test/hop-5/plugin.json');
  });
});

describe('entry validation and transactional installation', () => {
  it.each([
    'https://127.0.0.1/module.js', 'http://169.254.169.254/module.js',
    'https://[fd00:ec2::254]/module.js', 'http://8.8.8.8/module.js',
    'file:///tmp/module.js', 'javascript:alert(1)', 'https://user:pass@example.test/module.js',
  ])('applies the same URL/address policy to remote entry %s', async (entry) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(plugin({ entry })));
    await expect(create(undefined, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('rejects an entry hostname with a mixed safe/forbidden DNS result', async () => {
    const resolver = vi.fn<PluginResolver>()
      .mockResolvedValueOnce([publicIPv4])
      .mockResolvedValueOnce([publicIPv6, { address: 'fe80::1', family: 6 }]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(plugin({ entry: 'https://code.example.test/module.js' })));
    await expect(create(resolver, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(resolver.mock.calls).toEqual([['plugins.example.test'], ['code.example.test']]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('revalidates a relative entry even if its manifest hostname has just rebound', async () => {
    const resolver = vi.fn<PluginResolver>()
      .mockResolvedValueOnce([publicIPv4])
      .mockResolvedValueOnce([loopback]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(plugin()));
    await expect(create(resolver, fetcher).registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('does not replace installed files or metadata if a newer remote entry fails validation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(plugin({
      version: '2.0.0', entry: 'https://[fd20:ce::254]/module.js',
    })));
    const registry = create(undefined, fetcher);
    const installed = await registry.installZip(pluginZip());
    registry.setEnabled(installed.id, false);
    const path = join(root, 'plugins/acme.demo/plugin.json');
    const before = readFileSync(path, 'utf8');
    await expect(registry.registerRemote(manifestUrl)).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(registry.list()[1]).toMatchObject({ source: 'installed', version: '1.0.0', enabled: false });
    expect(readdirSync(join(root, 'plugins'))).toEqual(['acme.demo']);
  });

  it.each([
    'https://127.0.0.1/module.js', 'http://169.254.169.254/module.js',
    'http://8.8.8.8/module.js', 'https://[fd00:ec2::254]/module.js',
  ])('rejects unsafe absolute ZIP entry %s without leaving staged files', async (entry) => {
    const registry = create();
    await expect(registry.installZip(pluginZip(plugin({ entry })))).rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(readdirSync(join(root, 'plugins'))).toEqual([]);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
  });

  it('DNS-checks ZIP remote entries and preserves the previous version on rejection', async () => {
    const resolver = vi.fn<PluginResolver>().mockResolvedValue([publicIPv4, loopback]);
    const registry = create(resolver);
    await registry.installZip(pluginZip());
    const path = join(root, 'plugins/acme.demo/plugin.json');
    const before = readFileSync(path, 'utf8');
    await expect(registry.installZip(pluginZip(plugin({ version: '2.0.0', entry: 'https://code.example.test/module.js' }))))
      .rejects.toMatchObject({ code: 'UNSAFE_REMOTE_ADDRESS' });
    expect(resolver.mock.calls).toEqual([['code.example.test']]);
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(registry.list()[1]).toMatchObject({ source: 'installed', version: '1.0.0' });
    expect(readdirSync(join(root, 'plugins'))).toEqual(['acme.demo']);
  });
});

describe('total timeout and manifest byte limits', () => {
  it('times out DNS and ignores a late answer without fetching or writing', async () => {
    vi.useFakeTimers();
    const dns = deferred<readonly LookupAddress[]>();
    const fetcher = vi.fn<typeof fetch>();
    const registry = create(() => dns.promise, fetcher);
    const pending = registry.registerRemote(manifestUrl);
    const assertion = expect(pending).rejects.toMatchObject({ statusCode: 504, code: 'REMOTE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    dns.resolve([publicIPv4]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a late fetch response and never checks its entry or writes rows', async () => {
    vi.useFakeTimers();
    const response = deferred<Response>();
    const resolver = vi.fn<PluginResolver>().mockResolvedValue([publicIPv4]);
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(response.promise);
    const registry = create(resolver, fetcher);
    const pending = registry.registerRemote(manifestUrl);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'REMOTE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    const cancel = vi.fn();
    response.resolve(new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(strToU8(JSON.stringify(plugin()))); }, cancel,
    })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('includes entry DNS validation in the same timeout and ignores its late answer', async () => {
    vi.useFakeTimers();
    const entryDns = deferred<readonly LookupAddress[]>();
    const resolver = vi.fn<PluginResolver>()
      .mockResolvedValueOnce([publicIPv4])
      .mockReturnValueOnce(entryDns.promise);
    const registry = create(resolver);
    const pending = registry.registerRemote(manifestUrl);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'REMOTE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    expect(resolver).toHaveBeenCalledTimes(2);
    entryDns.resolve([publicIPv4]);
    await vi.advanceTimersByTimeAsync(0);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not reset the ten-second timeout on redirects', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      return new Response(null, { status: 302, headers: { location: '/next' } });
    });
    const pending = create(undefined, fetcher).registerRemote(manifestUrl);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'REMOTE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('destroys a native request and endless body at the timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const body = new Readable({ read() {} });
    body.push(strToU8('{'));
    const calls = mockNativeRequests(https, [{ body }]);
    const registry = new PluginRegistry({ dataDir: root, db, resolver: async () => [publicIPv4] });
    const pending = registry.registerRemote(manifestUrl);
    const assertion = expect(pending).rejects.toMatchObject({ statusCode: 504, code: 'REMOTE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    expect(calls[0].request.destroy).toHaveBeenCalled();
    expect(body.destroyed).toBe(true);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up a ZIP stage after entry DNS timeout and never installs its late result', async () => {
    vi.useFakeTimers();
    const dns = deferred<readonly LookupAddress[]>();
    const registry = create(() => dns.promise);
    const pending = registry.installZip(pluginZip(plugin({ entry: 'https://code.example.test/module.js' })));
    const assertion = expect(pending).rejects.toMatchObject({ code: 'REMOTE_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(REMOTE_MANIFEST_TIMEOUT_MS);
    await assertion;
    expect(readdirSync(join(root, 'plugins'))).toEqual([]);
    dns.resolve([publicIPv4]);
    await vi.advanceTimersByTimeAsync(0);
    expect(db.prepare('SELECT * FROM plugins').all()).toEqual([]);
    expect(readdirSync(join(root, 'plugins'))).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts exactly one MiB and counts bytes across native chunks without trusting headers', async () => {
    const json = JSON.stringify(plugin());
    const exact = strToU8(json + ' '.repeat(REMOTE_MANIFEST_MAX_BYTES - Buffer.byteLength(json)));
    const calls = mockNativeRequests(https, [
      { chunks: [exact.subarray(0, 123), exact.subarray(123)] },
      { headers: { 'content-length': '1' }, chunks: [exact, strToU8(' ')] },
      { headers: { 'content-length': String(REMOTE_MANIFEST_MAX_BYTES + 1) }, chunks: [strToU8(json)] },
    ]);
    const registry = new PluginRegistry({ dataDir: root, db, resolver: async () => [publicIPv4] });
    expect((await registry.registerRemote(manifestUrl)).source).toBe('remote');
    await expect(registry.registerRemote(manifestUrl)).rejects.toMatchObject({ statusCode: 413, code: 'REMOTE_TOO_LARGE' });
    await expect(registry.registerRemote(manifestUrl)).rejects.toMatchObject({ statusCode: 413, code: 'REMOTE_TOO_LARGE' });
    expect(calls).toHaveLength(3);
    expect(registry.list()).toHaveLength(2);
    expect(registry.list()[1].version).toBe('1.0.0');
  });
});
