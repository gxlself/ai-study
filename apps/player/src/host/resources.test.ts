import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lesson, ResolvedConcept } from '@sprout/schema';
import type { ActivityPlugin } from '../../../../packages/plugin-sdk/src/types';
import { createResources, preloadLesson, PRELOAD_TIMEOUT_MS, PRELOAD_MAX_BYTES } from './resources';
import { joinAsset } from '../data/assets';

function concept(packId: string, id = 'apple', patch: Partial<ResolvedConcept> = {}): ResolvedConcept {
  return {
    id, packId, category: 'fruits', zh: '苹果', en: 'apple',
    image: `assets/${id}.svg`, imageUrl: '', ...patch,
  };
}

function lesson(types: string[]): Lesson {
  return {
    schemaVersion: 1, id: 'host.test', title: { zh: '一起看看' }, ageRange: [6, 36],
    domains: ['language'], durationMin: 2, coView: 'required',
    objectives: [{ zh: '认识身边的事物' }], parentGuide: { intro: '一起看看' },
    offline: [{ title: '看看实物', steps: ['和家长一起看看实物'] }],
    steps: types.map((type) => ({ type, props: { items: ['apple'] } })),
  };
}

const helpers = createResources({
  packId: 'local', concepts: [concept('local')], resolveAsset: (packId, path) => {
    if (path.startsWith('/packs/')) return path;
    return joinAsset(`/packs/${packId}/`, path);
  },
});

function registry(preloads: Record<string, ActivityPlugin['preload']>) {
  return {
    get(type: string): ActivityPlugin | undefined {
      const preload = preloads[type];
      return preload ? {
        type, version: '1.0.0', name: { zh: '测试活动' }, preload, mount: () => ({ unmount() {} }),
      } : undefined;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resources', () => {
  it('prioritizes the current pack, then core, then other packs, regardless of input ordering', () => {
    const concepts = [
      concept('other', 'apple', { zh: '其它包' }),
      concept('sprout.core', 'apple', { zh: '内置包' }),
      concept('local', 'apple', { zh: '本课包' }),
      concept('other', 'ball', { zh: '其它包的球' }),
      concept('sprout.core', 'ball', { zh: '内置包的球' }),
      concept('other', 'flower', { zh: '其它包的花' }),
    ];
    const resolveAsset = vi.fn((packId: string, path: string) => `/packs/${packId}/${path}`);
    const resources = createResources({ packId: 'local', concepts, resolveAsset });
    expect(resources.concept('apple')?.zh).toBe('本课包');
    expect(resources.concept('ball')?.zh).toBe('内置包的球');
    expect(resources.concept('flower')?.zh).toBe('其它包的花');
    expect(resources.concept('ball')?.imageUrl).toBe('/packs/sprout.core/assets/ball.svg');
    expect(resolveAsset).toHaveBeenCalledWith('sprout.core', 'assets/ball.svg');
    expect(concepts[0].zh).toBe('其它包');
  });

  it('preserves stable order among fallback packs', () => {
    const resources = createResources({
      packId: 'local',
      concepts: [concept('first', 'apple', { zh: '第一个包' }), concept('second', 'apple', { zh: '第二个包' })],
      resolveAsset: (_packId, path) => path,
    });
    expect(resources.concept('apple')?.zh).toBe('第一个包');
  });

  it('routes absolute and root-relative URLs through the source security resolver', () => {
    const resolveAsset = vi.fn((_packId: string, path: string) => {
      if (path.startsWith('https://media.test')) throw new Error('untrusted source');
      return `https://home.test${path}`;
    });
    const resources = createResources({
      packId: 'local',
      concepts: [
        concept('local', 'apple', { imageUrl: 'https://media.test/apple.svg' }),
        concept('sprout.core', 'ball', { imageUrl: '/packs/sprout.core/assets/ball.svg' }),
      ],
      resolveAsset,
    });
    expect(resources.concept('apple')?.imageUrl).toBe('');
    expect(resolveAsset).toHaveBeenCalledWith('local', 'https://media.test/apple.svg');
    expect(resources.concept('ball')?.imageUrl).toBe('https://home.test/packs/sprout.core/assets/ball.svg');
    expect(resolveAsset).toHaveBeenCalledWith('sprout.core', '/packs/sprout.core/assets/ball.svg');
  });

  it('resolves inline concepts without English and keeps optional concept metadata', () => {
    const inline = { zh: '家里的苹果', image: 'assets/family-apple.svg', pinyin: 'píng guǒ' };
    const view = helpers.concept(inline);
    expect(view).toMatchObject({ zh: inline.zh, en: '', pinyin: inline.pinyin, imageUrl: '/packs/local/assets/family-apple.svg' });
    expect(view?.id).toBe(helpers.concept(inline)?.id);
    const resources = createResources({
      packId: 'local', concepts: [concept('local', 'apple', { measure: '个', plural: 'apples', color: '#ffcc44', value: 2 })],
      resolveAsset: (_pack, path) => path,
    });
    expect(resources.concept('apple')).toMatchObject({ measure: '个', plural: 'apples', color: '#ffcc44', value: 2, category: 'fruits' });
  });

  it('supports concept image references and gracefully handles missing concepts', () => {
    expect(helpers.resolveAsset('concept:apple')).toBe('/packs/local/assets/apple.svg');
    expect(helpers.concept({ zh: '苹果', image: 'concept:apple' })?.imageUrl).toBe('/packs/local/assets/apple.svg');
    expect(helpers.concept('absent')).toBeUndefined();
    expect(helpers.resolveAsset('concept:absent')).toBe('');
    expect(helpers.resolveAsset('')).toBe('');
    expect(helpers.concept('toString')).toBeUndefined();
  });

  it('only permits safe local data/blob images; external and script resources are rejected', () => {
    expect(helpers.resolveAsset('data:image/png;base64,AA==')).toBe('data:image/png;base64,AA==');
    const blob = `blob:${location.origin}/one`;
    expect(helpers.resolveAsset(blob)).toBe(blob);
    for (const url of ['https://media.test/image.svg', 'http://home.test/a.png', 'data:text/html,<script>', 'javascript:alert(1)', 'blob:https://other.test/one']) {
      expect(helpers.resolveAsset(url)).toBe('');
    }
  });
});

describe('lesson preloading', () => {
  it('calls every known step and deduplicates URLs with bounded streaming bodies', async () => {
    const preload = vi.fn((_props, resources) => [resources.resolveAsset('assets/apple.svg'), resources.concept('apple')!.imageUrl]);
    const response = new Response(new Uint8Array([1]));
    const body = vi.spyOn(response, 'arrayBuffer');
    const fetcher = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await preloadLesson(lesson(['cards', 'cards', 'absent']), registry({ cards: preload }), helpers, controller.signal);
    expect(preload).toHaveBeenCalledTimes(2);
    expect(preload).toHaveBeenCalledWith({ items: ['apple'] }, helpers);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/packs/local/assets/apple.svg');
    expect(fetcher.mock.calls[0][1].cache).toBe('force-cache');
    expect(body).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(controller.signal.aborted).toBe(false);
  });

  it('isolates plugin exceptions, unavailable steps, and HTTP/network errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false, arrayBuffer: vi.fn() }));
    const plugins = registry({
      broken: () => { throw new Error('plugin failure'); },
      available: () => ['a.png', 'b.m4a'],
    });
    await expect(preloadLesson(lesson(['broken', 'absent', 'available']), plugins, helpers, new AbortController().signal))
      .resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('enforces an overall 8-second deadline even when fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const done = vi.fn();
    const pending = preloadLesson(lesson(['cards']), registry({ cards: () => ['image.png'] }), helpers, new AbortController().signal).then(done);
    await vi.advanceTimersByTimeAsync(PRELOAD_TIMEOUT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    const requestSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toHaveBeenCalledOnce();
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds stalled response bodies', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }))));
    const pending = preloadLesson(lesson(['cards']), registry({ cards: () => ['audio.m4a'] }), helpers, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(8_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles immediately on abort and cancels all inflight requests', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const controller = new AbortController();
    const pending = preloadLesson(lesson(['cards']), registry({ cards: () => ['a.png', 'b.m4a'] }), helpers, controller.signal);
    controller.abort();
    await pending;
    for (const [, init] of vi.mocked(fetch).mock.calls) expect(init?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does no work for an already-aborted lesson and tolerates missing fetch', async () => {
    const preload = vi.fn(() => ['a.png']);
    const controller = new AbortController();
    controller.abort();
    await preloadLesson(lesson(['cards']), registry({ cards: preload }), helpers, controller.signal);
    expect(preload).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', undefined);
    await expect(preloadLesson(lesson(['cards']), registry({ cards: preload }), helpers, new AbortController().signal)).resolves.toBeUndefined();
  });
  it('does not fetch unregistered external assets, data/blob, or traversal returned by plugins', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1]))));
    await preloadLesson(lesson(['cards']), registry({
      cards: () => ['https://tracking.test/a.png', '//tracking.test/a.png', 'data:image/png;base64,AA==', 'blob:https://tracking.test/a', '../bad', '%252e%252e/bad', 'assets/good.png'],
    }), helpers, new AbortController().signal);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/packs/local/assets/good.png', expect.any(Object));
  });
  it('cancels oversized streams and does not follow changed final response URLs', async () => {
    const cancel = vi.fn();
    const oversize = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(PRELOAD_MAX_BYTES + 1)); },
      cancel,
    }));
    const redirected = new Response(new Uint8Array([1]));
    Object.defineProperty(redirected, 'url', { value: 'https://tracking.test/a.png' });
    const body = vi.spyOn(redirected, 'arrayBuffer');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(oversize).mockResolvedValueOnce(redirected));
    await preloadLesson(lesson(['cards']), registry({ cards: () => ['a.png', 'b.png'] }), helpers, new AbortController().signal);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body).not.toHaveBeenCalled();
  });
});
