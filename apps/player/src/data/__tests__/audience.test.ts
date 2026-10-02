// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Lesson } from '@sprout/schema';
import { LocalSource, RemoteSource, resolvePlaybackMode } from '../index';
import { bundleFixture, childInput, json, MemoryStorage, NOW, screen, session } from './fixtures';

describe('家长模式数据口径', () => {
  it('家长记录与共看记录都保留，但只有共看计入孩子配额', async () => {
    const bundle = bundleFixture();
    const parent = Lesson.parse({
      ...bundle.lessons[0], id: 'core.test.parent', audience: 'parent', ageRange: [6, 36],
      printables: [{ kind: 'cards', title: '打印苹果', items: ['apple'] }],
      steps: [{ type: 'guide', props: { goal: '放下屏幕后面对面玩', steps: [{ text: '摸一摸大号玩具。' }] } }],
    });
    bundle.lessons.push(parent);
    const source = new LocalSource({ storage: new MemoryStorage(), fetch: async () => json(bundle), now: () => NOW });
    const child = await source.saveChild(childInput());
    await source.saveSession(session({ childId: child.id, lessonId: parent.id, audience: 'parent', durationSec: 600, clientId: 'parent' }));
    await source.saveSession(session({ childId: child.id, durationSec: 60, clientId: 'child' }));
    expect((await source.screen(child.id)).usedSec).toBe(60);
    expect((await source.today(child.id)).screen.usedSec).toBe(60);
    expect(await source.recent(child.id)).toHaveLength(2);
    expect((await source.lessons()).find((lesson) => lesson.id === parent.id)).toMatchObject({ audience: 'parent', hasPrintables: true });
  });
  it('未补传的家长时长不会占用远程孩子配额', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => String(url).endsWith('/api/sessions') ? json({ error: { message: '离线' } }, 503) : json(screen({ mode: 'co-view' })));
    const source = new RemoteSource('http://localhost:4310', 'test-token', { storage: new MemoryStorage(), fetch, now: () => NOW });
    await source.saveSession(session({ audience: 'parent', durationSec: 600 }));
    expect((await source.screen('child-1')).usedSec).toBe(0);
  });
  it('对低月龄强制家长模式，旧服务缺省采用保守月龄规则', () => {
    expect(resolvePlaybackMode({ mode: 'co-view' }, childInput({ birthday: '2025-10-01', screen: { ...childInput().screen, mode: 'co-view' } }), NOW)).toBe('parent-only');
    expect(resolvePlaybackMode(undefined, childInput({ birthday: '2025-03-01' }), NOW)).toBe('parent-only');
    expect(resolvePlaybackMode(undefined, childInput({ birthday: '2025-03-01', screen: { ...childInput().screen, mode: 'co-view' } }), NOW)).toBe('co-view');
    expect(resolvePlaybackMode({ mode: 'parent-only' }, childInput(), NOW)).toBe('parent-only');
    expect(resolvePlaybackMode(undefined, childInput(), NOW)).toBe('co-view');
    expect(resolvePlaybackMode({ mode: 'co-view' }, { ...childInput(), birthday: 'invalid' }, NOW)).toBe('parent-only');
  });
});
