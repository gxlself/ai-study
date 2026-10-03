// @vitest-environment node
import { summarizeLesson } from '@sprout/core';
import type { SessionInput } from '@sprout/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, RemoteSource, RequestTimeoutError, StorageError } from '../index';
import { bootstrap, bundleFixture, json, MemoryStorage, NOW, pack, plan, remoteState, screen, session } from './fixtures';
import { legacyRemoteStateKey, remoteStateKey } from '../identity';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const SERVER = 'http://192.168.1.2:4310';
const TOKEN = 'test-device-a';

function create(fetch = vi.fn<typeof globalThis.fetch>(async () => json({ id: 'saved' })), storage = new MemoryStorage()) {
  const source = new RemoteSource(SERVER, TOKEN, { storage, fetch, now: () => new Date(NOW) });
  return { source, fetch, storage };
}

function errorResponse(status: number, code = 'request-failed'): Response {
  return json({ error: { code, message: '请求暂时未完成' } }, status);
}

describe('RemoteSource 队列', () => {
  it('先保存再上传，成功后只移除队列，本机 recent 从不请求 GET sessions', async () => {
    const storage = new MemoryStorage();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      expect(remoteState(storage).pending).toHaveLength(1);
      expect(remoteState(storage).sessions).toHaveLength(1);
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      return json({ id: 'saved', ...JSON.parse(init!.body as string) });
    });
    const { source } = create(fetch, storage);
    await source.saveSession(session());
    expect(remoteState(storage).pending).toEqual([]);
    expect(await source.recent('child-1')).toEqual([session()]);
    expect(await source.recent('other')).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`${SERVER}/api/sessions`);
    await source.flush();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('离线保存不抛上传错误，刷新重建实例仍可重试同一个 clientId', async () => {
    const { source, fetch, storage } = create();
    fetch.mockRejectedValue(new TypeError('offline'));
    const input = session({ clientId: undefined });
    await expect(source.saveSession(input)).resolves.toBeUndefined();
    expect(remoteState(storage).pending).toHaveLength(1);
    const clientId = remoteState(storage).pending[0].clientId;
    expect(clientId).toMatch(/^session-/);
    await expect(source.flush()).rejects.toMatchObject({ code: 'network' });
    fetch.mockResolvedValue(json({ id: 'recovered' }));
    const recovered = create(fetch, storage).source;
    await recovered.flush();
    expect(remoteState(storage).pending).toHaveLength(0);
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string) as SessionInput);
    expect(new Set(bodies.map((body) => body.clientId))).toEqual(new Set([clientId]));
    expect((await recovered.recent('child-1'))[0].clientId).toBe(clientId);
  });

  it('HTTP 失败永不丢弃 session，保留结构化 code/status/message', async () => {
    const { source, fetch, storage } = create();
    fetch.mockImplementation(async () => errorResponse(401, 'device-revoked'));
    await source.saveSession(session());
    await expect(source.flush()).rejects.toMatchObject({
      status: 401, code: 'device-revoked', message: '请求暂时未完成',
    });
    expect(remoteState(storage).pending).toEqual([session()]);
    expect(await source.recent('child-1')).toHaveLength(1);
  });

  it('坏记录不吞掉后续可上传记录，失败记录留待之后重试', async () => {
    const { source, fetch, storage } = create();
    fetch.mockImplementation(async (_url, init) => {
      const record = JSON.parse(init!.body as string) as SessionInput;
      return record.clientId === 'bad' ? errorResponse(400) : json({ id: record.clientId });
    });
    await source.saveSession(session({ clientId: 'bad' }));
    await source.saveSession(session({ clientId: 'good' }));
    expect(remoteState(storage).pending.map((record) => record.clientId)).toEqual(['bad']);
    expect(remoteState(storage).sessions).toHaveLength(2);
    expect(fetch.mock.calls.some(([, init]) => JSON.parse(init!.body as string).clientId === 'good')).toBe(true);
  });

  it.each([401, 403, 408, 429, 500, 503])('HTTP %i 时暂停这一轮补传，避免连续重试整条队列', async (status) => {
    const { source, fetch, storage } = create();
    fetch.mockRejectedValue(new TypeError('offline'));
    await source.saveSession(session({ clientId: 'one' }));
    await source.saveSession(session({ clientId: 'two' }));
    fetch.mockClear();
    fetch.mockImplementation(async () => errorResponse(status));
    await expect(source.flush()).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledOnce();
    expect(remoteState(storage).pending).toHaveLength(2);
  });

  it('相同 clientId 和重复无 id 对象只记录一次，已确认的 session 不再重传', async () => {
    const { source, fetch, storage } = create();
    fetch.mockRejectedValue(new TypeError('offline'));
    const input = session({ clientId: undefined });
    await source.saveSession(input);
    await source.saveSession(input);
    await source.saveSession(session({ clientId: 'explicit' }));
    await source.saveSession(session({ clientId: 'explicit', durationSec: 400 }));
    expect(remoteState(storage).pending).toHaveLength(2);
    expect(remoteState(storage).sessions.find((entry) => entry.clientId === 'explicit')?.durationSec).toBe(60);
    fetch.mockImplementation(async () => json({ id: 'saved' }));
    await source.flush();
    fetch.mockClear();
    await source.saveSession(session({ clientId: 'explicit' }));
    expect(fetch).not.toHaveBeenCalled();
    expect(await source.recent('child-1')).toHaveLength(2);
  });

  it('按规范化 server + token 隔离队列及历史，不能把旧身份记录发给新身份', async () => {
    const storage = new MemoryStorage();
    const offline = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('offline'));
    const alpha = new RemoteSource(`${SERVER}/`, 'token-a', { storage, fetch: offline, now: () => NOW });
    await alpha.saveSession(session({ clientId: 'alpha' }));
    const uploaded: { url: string; token: string | null; clientId: string }[] = [];
    const online = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      uploaded.push({
        url: String(url), token: new Headers(init?.headers).get('Authorization'),
        clientId: JSON.parse(init!.body as string).clientId,
      });
      return json({ id: 'saved' });
    });
    const beta = new RemoteSource(SERVER, 'token-b', { storage, fetch: online, now: () => NOW });
    const elsewhere = new RemoteSource('http://192.168.1.3:4310', 'token-a', { storage, fetch: online, now: () => NOW });
    expect(await beta.recent('child-1')).toEqual([]);
    expect(await elsewhere.recent('child-1')).toEqual([]);
    await beta.flush(); await elsewhere.flush();
    expect(online).not.toHaveBeenCalled();
    await beta.saveSession(session({ clientId: 'beta' }));
    expect(uploaded).toEqual([{ url: `${SERVER}/api/sessions`, token: 'Bearer token-b', clientId: 'beta' }]);
    const resumed = new RemoteSource(SERVER, 'token-a', { storage, fetch: online, now: () => NOW });
    await resumed.flush();
    expect(uploaded[1]).toMatchObject({ clientId: 'alpha', token: 'Bearer token-a' });
    expect(await resumed.recent('child-1')).toHaveLength(1);
    expect([...storage.items.keys()].filter((key) => key.startsWith('sprout.remote:'))).toHaveLength(2);
  });

  it('多个实例并发 flush 与上传期间新增记录不丢失、不重复发送', async () => {
    let release!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }))
      .mockImplementation(async () => json({ id: 'saved' }));
    const { source, storage } = create(fetch);
    const second = create(fetch, storage).source;
    const savingFirst = source.saveSession(session({ clientId: 'first' }));
    await Promise.resolve();
    const savingSecond = second.saveSession(session({ clientId: 'second' }));
    const flushing = source.flush();
    expect(fetch).toHaveBeenCalledOnce();
    release(json({ id: 'first' }));
    await Promise.all([savingFirst, savingSecond, flushing, second.flush()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(remoteState(storage).pending).toEqual([]);
    expect(remoteState(storage).sessions).toHaveLength(2);
  });

  it('请求挂起仍按 timeoutMs 中止，保留队列且清理计时器', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}));
    const source = new RemoteSource(SERVER, TOKEN, { storage, fetch, timeoutMs: 50, now: () => NOW });
    const saving = source.saveSession(session());
    await vi.advanceTimersByTimeAsync(50);
    await expect(saving).resolves.toBeUndefined();
    expect(remoteState(storage).pending).toHaveLength(1);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    const retry = expect(source.flush()).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await retry;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('成功响应的 body 挂起也在超时范围内', async () => {
    vi.useFakeTimers();
    const response = json({});
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
    const source = new RemoteSource(SERVER, TOKEN, {
      storage: new MemoryStorage(), fetch: async () => response, timeoutMs: 50,
    });
    const request = expect(source.lessons()).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await request;
  });

  it('无效 JSON 与非 JSON HTTP 错误有明确异常', async () => {
    const { source, fetch } = create();
    fetch.mockResolvedValueOnce(new Response('<html>', { status: 502 }));
    await expect(source.lessons()).rejects.toMatchObject({ status: 502, code: 'http-error' });
    fetch.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(source.lessons()).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('本机存储失败不发请求，损坏队列不静默重置', async () => {
    const { source, fetch, storage } = create();
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(source.saveSession(session())).rejects.toBeInstanceOf(StorageError);
    expect(fetch).not.toHaveBeenCalled();
    await source.saveSession(session());
    const key = [...storage.items.keys()][0];
    storage.setItem(key, '{broken');
    await expect(source.flush()).rejects.toBeInstanceOf(StorageError);
    expect(storage.getItem(key)).toBe('{broken');
  });

  it('确认后落盘失败仍保留待上传项，下一轮使用同一个 clientId', async () => {
    const { source, fetch, storage } = create();
    const original = storage.setItem.bind(storage);
    let writes = 0;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (++writes === 2) throw new Error('quota');
      original(key, value);
    });
    await expect(source.saveSession(session())).rejects.toBeInstanceOf(StorageError);
    expect(remoteState(storage).pending).toHaveLength(1);
    await source.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(remoteState(storage).pending).toEqual([]);
  });

  it('最近 2000 条历史不会删除更早的待补传记录', async () => {
    const { source, fetch, storage } = create();
    fetch.mockRejectedValue(new TypeError('offline'));
    await source.saveSession(session({ clientId: 'pending' }));
    const key = [...storage.items.keys()][0];
    const value = remoteState(storage);
    value.sessions = Array.from({ length: 2001 }, (_, index) => session({
      clientId: `recent-${index}`,
      startedAt: new Date(NOW.getTime() - (index + 1) * 1000).toISOString(),
      endedAt: new Date(NOW.getTime() - index * 1000).toISOString(),
    }));
    storage.setItem(key, JSON.stringify(value));
    expect(await source.recent('child-1')).toHaveLength(2000);
    await source.saveSession(session({ clientId: 'newest', startedAt: NOW.toISOString(), endedAt: NOW.toISOString() }));
    expect(remoteState(storage).sessions).toHaveLength(2000);
    expect(remoteState(storage).sessions[0].clientId).toBe('newest');
    expect(remoteState(storage).pending.map((entry) => entry.clientId)).toEqual(['pending', 'newest']);
  });

  it('旧孩子失败记录不阻塞当前绑定孩子，切回后补传且不越过设备权限', async () => {
    const { source, fetch, storage } = create();
    let bound = 'child-1';
    let rejectOld = true;
    const received: string[] = [];
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/bootstrap')) return json(bootstrap());
      if (String(url).endsWith('/device/child')) {
        bound = JSON.parse(init!.body as string).childId;
        return new Response(null, { status: 204 });
      }
      const record = JSON.parse(init!.body as string) as SessionInput;
      expect(record.childId).toBe(bound);
      if (record.childId === 'child-1' && rejectOld) return errorResponse(400);
      received.push(record.clientId!);
      return json({ id: record.clientId });
    });
    await source.bootstrap();
    await source.saveSession(session({ clientId: 'old-child' }));
    await source.selectChild('child-2');
    await source.saveSession(session({ childId: 'child-2', clientId: 'new-child' }));
    expect(received).toEqual(['new-child']);
    expect(remoteState(storage).pending.map((entry) => entry.clientId)).toEqual(['old-child']);
    rejectOld = false;
    await source.selectChild('child-1');
    expect(received).toEqual(['new-child', 'old-child']);
    expect(remoteState(storage).pending).toEqual([]);
  });
});

describe('RemoteSource API / 资源', () => {
  it('bootstrap 资源及插件地址指向家庭服务器，读取不会隐式等待队列', async () => {
    const boot = bootstrap();
    boot.plugins = [{
      id: 'sample.plugin', version: '1.0.0', name: { zh: '测试插件' },
      source: 'installed', enabled: true, entryUrl: '/plugins/sample/index.js', activities: [], permissions: [],
    }];
    const { source, fetch, storage } = create();
    fetch.mockRejectedValueOnce(new TypeError('offline'));
    await source.saveSession(session());
    fetch.mockImplementation(async () => json(boot));
    fetch.mockClear();
    const result = await source.bootstrap();
    expect(result.packs[0].baseUrl).toBe(`${SERVER}/packs/sprout.core/`);
    expect(result.plugins[0].entryUrl).toBe(`${SERVER}/plugins/sample/index.js`);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`${SERVER}/api/device/bootstrap`);
    expect(remoteState(storage).pending).toHaveLength(1);
  });

  it('routes 先读索引，再拉每个唯一 id 的完整 Route', async () => {
    const bundle = bundleFixture();
    const { source, fetch } = create();
    fetch.mockImplementation(async (url) => String(url).endsWith('/api/routes')
      ? json([{ id: bundle.routes[0].id }, { id: bundle.routes[0].id }])
      : json(bundle.routes[0]));
    expect(await source.routes()).toEqual(bundle.routes);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${SERVER}/api/routes`, `${SERVER}/api/routes/sprout.core.route`,
    ]);
  });

  it('完整 lesson 校验及默认值回填、API 编码、PUT 切孩子', async () => {
    const { source, fetch } = create();
    const bundle = bundleFixture();
    fetch.mockResolvedValueOnce(json({ lesson: bundle.lessons[0], packId: 'sprout.core', baseUrl: '/packs/sprout.core/' }));
    const result = await source.lesson('child/lesson');
    expect(fetch.mock.calls[0][0]).toBe(`${SERVER}/api/lessons/child%2Flesson`);
    expect(result.baseUrl).toBe(`${SERVER}/packs/sprout.core/`);
    expect(result.lesson.steps[0].props).toMatchObject({ autoAdvanceSec: null });
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await source.selectChild('child/2');
    expect(fetch.mock.calls[1][0]).toBe(`${SERVER}/api/device/child`);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: '{"childId":"child/2"}' });
    fetch.mockResolvedValueOnce(json({ lesson: { id: 'bad' }, packId: 'sprout.core', baseUrl: '/packs/sprout.core/' }));
    await expect(source.lesson('bad')).rejects.toMatchObject({ code: 'invalid-lesson' });
  });

  it('词库、课程封面和资源 URL 可直接用于跨 origin 的播放端', async () => {
    const { source, fetch } = create();
    const bundle = bundleFixture();
    const concept = bundle.lexicon!.concepts[0];
    fetch.mockResolvedValueOnce(json([
      { ...concept, packId: 'other.pack', imageUrl: '/packs/other.pack/assets/apple.svg' },
      { ...concept, packId: 'sprout.core', imageUrl: '/packs/sprout.core/assets/apple.svg' },
    ]));
    expect((await source.lexicon())[0].imageUrl).toBe(`${SERVER}/packs/other.pack/assets/apple.svg`);
    expect(source.resolveAsset('other.pack', 'concept:apple')).toBe(`${SERVER}/packs/other.pack/assets/apple.svg`);
    expect(source.resolveAsset('unknown.pack', 'concept:apple')).toBe(`${SERVER}/packs/sprout.core/assets/apple.svg`);
    fetch.mockResolvedValueOnce(json(bundle.lessons.map((lesson) => summarizeLesson(lesson, 'sprout.core'))));
    expect((await source.lessons())[0].cover?.imageUrl).toBe(`${SERVER}/packs/sprout.core/assets/apple.svg`);
    expect(source.resolveAsset('sprout.core', 'assets/apple.svg')).toBe(`${SERVER}/packs/sprout.core/assets/apple.svg`);
    expect(() => source.resolveAsset('sprout.core', 'https://media.example/a.svg')).toThrow();
    expect(source.resolveAsset('sprout.core', `${SERVER}/video.mp4`)).toBe(`${SERVER}/video.mp4`);
    expect(() => source.resolveAsset('sprout.core', '/packs/../private')).toThrow();
  });

  it('只加载启用包音频，单包缺失/损坏/离线不阻塞其它包，静态源不携带 token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { source, fetch } = create();
    const packs = [
      pack(),
      pack({ id: 'disabled', enabled: false, baseUrl: '/packs/disabled/' }),
      pack({ id: 'missing', baseUrl: '/packs/missing/' }),
      pack({ id: 'broken', baseUrl: '/packs/broken/' }),
      pack({ id: 'offline', baseUrl: '/packs/offline/' }),
    ];
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/api/packs')) return json(packs);
      expect(new Headers(init?.headers).get('Authorization')).toBeNull();
      if (String(url).includes('/missing/')) return errorResponse(404);
      if (String(url).includes('/broken/')) return json({ schemaVersion: 1, entries: { invalid: '../secret' } });
      if (String(url).includes('/offline/')) throw new TypeError('offline');
      return json(bundleFixture().audio);
    });
    const audio = await source.audioManifests();
    expect(audio).toHaveLength(1);
    expect(audio[0].baseUrl).toBe(`${SERVER}/packs/sprout.core/`);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(source.warnings).toHaveLength(3);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/disabled/'))).toBe(false);
    await source.audioManifests();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('音频包列表读取失败也返回空列表，之后可以重新尝试', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { source, fetch } = create();
    fetch.mockRejectedValueOnce(new TypeError('offline'));
    expect(await source.audioManifests()).toEqual([]);
    fetch.mockResolvedValueOnce(json([pack()])).mockResolvedValueOnce(json(bundleFixture().audio));
    expect(await source.audioManifests()).toHaveLength(1);
  });
});

describe('远程身份与只读预览', () => {
  it('迁移旧键的历史和去重队列，新键不包含可反解 token', async () => {
    const storage = new MemoryStorage();
    const old = legacyRemoteStateKey(SERVER, TOKEN);
    storage.setItem(old, JSON.stringify({ version: 1, sessions: [session()], pending: [session(), session()] }));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ id: 'saved' }));
    const { source } = create(fetch, storage);
    expect(await source.recent('child-1')).toHaveLength(1);
    expect(storage.getItem(old)).toBeNull();
    const keys = [...storage.items.keys()];
    expect(keys).toEqual([remoteStateKey(SERVER, TOKEN)]);
    expect(decodeURIComponent(keys[0])).not.toContain(TOKEN);
    await source.flush();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('迁移写入失败不删除旧队列', async () => {
    const storage = new MemoryStorage();
    const old = legacyRemoteStateKey(SERVER, TOKEN);
    const value = JSON.stringify({ version: 1, sessions: [session()], pending: [session()] });
    storage.setItem(old, value);
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(create(undefined, storage).source.recent('child-1')).rejects.toBeInstanceOf(StorageError);
    expect(storage.getItem(old)).toBe(value);
  });
  it('同时迁移其它旧身份，保留未上传记录，不借用当前 token 上传', async () => {
    const storage = new MemoryStorage();
    const otherServer = 'http://192.168.1.3:4310';
    const otherToken = 'other-legacy-token';
    const old = legacyRemoteStateKey(otherServer, otherToken);
    storage.setItem(old, JSON.stringify({ version: 1, sessions: [session()], pending: [session()] }));
    const { source, fetch } = create(undefined, storage);
    expect(await source.recent('child-1')).toEqual([]);
    expect(storage.getItem(old)).toBeNull();
    expect(JSON.parse(storage.getItem(remoteStateKey(otherServer, otherToken))!).pending).toHaveLength(1);
    expect([...storage.items.keys()].some((key) => decodeURIComponent(key).includes(otherToken))).toBe(false);
    await source.flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('预览拒绝设备/记录接口并且不读写传入或浏览器存储', async () => {
    const storage = new MemoryStorage();
    const reads = vi.spyOn(storage, 'getItem');
    const writes = vi.spyOn(storage, 'setItem');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json([]));
    const source = new RemoteSource(SERVER, 'preview-only', { preview: true, storage, fetch });
    await source.lexicon();
    await source.flush();
    await expect(source.bootstrap()).rejects.toMatchObject({ code: 'preview-read-only' });
    await expect(source.selectChild('child-1')).rejects.toMatchObject({ code: 'preview-read-only' });
    await expect(source.saveSession(session())).rejects.toMatchObject({ code: 'preview-read-only' });
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('不从外部 baseUrl 加载媒体或音频', async () => {
    const { source, fetch } = create();
    fetch.mockResolvedValueOnce(json(bootstrapWithExternalPack()));
    await expect(source.bootstrap()).rejects.toMatchObject({ code: 'invalid-asset' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

function bootstrapWithExternalPack() {
  return { ...bootstrap(), packs: [pack({ baseUrl: 'https://external.test/packs/core/' })] };
}

describe('RemoteSource 待传时长保护', () => {
  it('today/screen 增加本日、本孩子的 pending 时长，到达上限禁止继续', async () => {
    const { source, fetch } = create();
    fetch.mockRejectedValue(new TypeError('offline'));
    await source.saveSession(session({ clientId: 'current', durationSec: 200 }));
    await source.saveSession(session({ clientId: 'other', childId: 'child-2', durationSec: 500 }));
    const yesterday = new Date(NOW); yesterday.setDate(yesterday.getDate() - 1);
    await source.saveSession(session({ clientId: 'yesterday', startedAt: yesterday.toISOString(), endedAt: yesterday.toISOString(), durationSec: 500 }));
    fetch.mockImplementation(async (url) => String(url).endsWith('/today')
      ? json(plan(screen({ usedSec: 450 })))
      : json(screen({ usedSec: 450 })));
    expect((await source.today('child-1')).screen).toMatchObject({ usedSec: 650, allowedNow: false, reason: 'daily-limit' });
    expect(await source.screen('child-1')).toMatchObject({ usedSec: 650, allowedNow: false, reason: 'daily-limit' });
    expect(await source.screen('child-1')).toMatchObject({ usedSec: 650 });
  });

  it('重建实例仍计入 pending；上传确认后不再叠加到包含这条记录的服务端时长', async () => {
    const { source, fetch, storage } = create();
    fetch.mockRejectedValue(new TypeError('offline'));
    await source.saveSession(session({ durationSec: 200 }));
    const restarted = create(fetch, storage).source;
    fetch.mockImplementation(async (url) => String(url).endsWith('/screen')
      ? json(screen({ usedSec: 100 }))
      : json({ id: 'saved' }));
    expect((await restarted.screen('child-1')).usedSec).toBe(300);
    await restarted.flush();
    fetch.mockImplementation(async () => json(screen({ usedSec: 300 })));
    expect((await restarted.screen('child-1')).usedSec).toBe(300);
  });

  it('服务端返回旧缓存也不能减少本机当日时长，新 session 持续增量', async () => {
    const { source, fetch } = create();
    fetch.mockImplementation(async (url) => String(url).endsWith('/screen')
      ? json(screen({ usedSec: 450 }))
      : json({ id: 'saved' }));
    expect((await source.screen('child-1')).usedSec).toBe(450);
    await source.saveSession(session({ durationSec: 100 }));
    fetch.mockImplementation(async (url) => String(url).endsWith('/screen')
      ? json(screen({ usedSec: 100 }))
      : json({ id: 'saved' }));
    expect((await source.screen('child-1')).usedSec).toBe(550);
    await source.saveSession(session({ clientId: 'next', durationSec: 60 }));
    expect(await source.screen('child-1')).toMatchObject({ usedSec: 610, allowedNow: false });
  });

  it('已缓存当天策略后断网仍计时，并通过 core 重新检查使用窗口', async () => {
    let now = new Date(NOW);
    const boot = bootstrap();
    boot.child!.screen.windows = [{ start: '08:00', end: '11:00' }];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (String(url).endsWith('/bootstrap')) return json(boot);
      if (String(url).endsWith('/today')) return json(plan(screen({ usedSec: 100 })));
      return json(screen({ usedSec: 100 }));
    });
    const source = new RemoteSource(SERVER, TOKEN, { storage: new MemoryStorage(), fetch, now: () => now });
    await source.bootstrap();
    await source.today('child-1');
    fetch.mockRejectedValue(new TypeError('offline'));
    await source.saveSession(session({ durationSec: 200 }));
    expect((await source.today('child-1')).screen.usedSec).toBe(300);
    now = new Date(2026, 9, 2, 12);
    expect(await source.screen('child-1')).toMatchObject({ usedSec: 300, allowedNow: false, reason: 'outside-window', nextWindow: '08:00' });
    now = new Date(2026, 9, 3, 10);
    await expect(source.screen('child-1')).rejects.toMatchObject({ code: 'network' });
  });

  it('未缓存策略不能凭空生成宽松状态，401/403 也不使用离线缓存绕过鉴权', async () => {
    const { source, fetch } = create();
    fetch.mockRejectedValueOnce(new TypeError('offline'));
    await expect(source.screen('child-1')).rejects.toMatchObject({ code: 'network' });
    fetch.mockResolvedValueOnce(json(bootstrap())).mockResolvedValueOnce(json(screen()));
    await source.bootstrap();
    await source.screen('child-1');
    fetch.mockImplementation(async () => errorResponse(403));
    await expect(source.screen('child-1')).rejects.toMatchObject({ status: 403 });
  });
});
