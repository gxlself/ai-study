// @vitest-environment node
import * as core from '@sprout/core';
import { ChildInput, type PackBundle } from '@sprout/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BundleValidationError, LocalSource, StorageError } from '../index';
import { bundleFixture, childInput, json, MemoryStorage, NOW, session } from './fixtures';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function create(bundle: unknown = bundleFixture(), storage = new MemoryStorage()) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => json(bundle));
  const source = new LocalSource({ storage, fetch, now: () => new Date(NOW) });
  return { source, fetch, storage };
}

describe('LocalSource', () => {
  it('默认使用浏览器 storage/fetch，初始化无孩子时保持空状态', async () => {
    const storage = new MemoryStorage();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json(bundleFixture()));
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetch);
    const source = new LocalSource();
    const boot = await source.bootstrap();
    expect(source.kind).toBe('local');
    expect(boot.child).toBeNull();
    expect(boot.children).toEqual([]);
    expect(boot.device.childId).toBeNull();
    expect(boot.packs[0]).toMatchObject({ lessonCount: 3, conceptCount: 6, enabled: true, source: 'builtin' });
    expect(boot.plugins[0].activities).toHaveLength(17);
    expect(fetch.mock.calls[0][0]).toBe('./bundled/packs/sprout.core/bundle.json');
  });

  it('持久化孩子、切换孩子并保留更新时的 id/createdAt', async () => {
    const { source, storage } = create();
    const first = await source.saveChild(ChildInput.parse({ name: '芽芽', birthday: '2024-10-01' }));
    const second = await source.saveChild(childInput({ name: '小禾' }));
    expect((await source.bootstrap()).child?.id).toBe(first.id);
    await source.selectChild(second.id);
    const later = new Date(NOW.getTime() + 60_000);
    const restarted = new LocalSource({ storage, fetch: async () => json(bundleFixture()), now: () => later });
    expect((await restarted.bootstrap()).child?.id).toBe(second.id);
    const updated = await restarted.saveChild({ ...second, name: '禾禾', languageMode: 'en' }, second.id);
    expect(updated).toMatchObject({ id: second.id, createdAt: second.createdAt, updatedAt: later.toISOString(), languageMode: 'en' });
    await expect(source.selectChild('missing')).rejects.toMatchObject({ code: 'child-not-found' });
    await expect(source.saveChild(childInput(), 'missing')).rejects.toMatchObject({ code: 'child-not-found' });
    expect((await source.bootstrap()).child?.name).toBe('禾禾');
    await expect(source.saveChild(childInput({ birthday: '2026-02-31' }))).rejects.toMatchObject({ code: 'invalid-birthday' });
    await expect(source.saveChild(childInput({ birthday: '2027-01-01' }))).rejects.toMatchObject({ code: 'invalid-birthday' });
  });

  it('直接调用 core 排课，提供当前孩子近 60 天历史及本地日期今日时长', async () => {
    const { source } = create();
    const child = await source.saveChild(childInput());
    const other = await source.saveChild(childInput({ name: '另一位' }));
    const old = new Date(NOW); old.setDate(old.getDate() - 61);
    const yesterday = new Date(NOW); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(NOW); tomorrow.setDate(tomorrow.getDate() + 1);
    for (const record of [
      session({ childId: child.id, completed: false, durationSec: 120 }),
      session({ childId: other.id, clientId: 'other', durationSec: 300 }),
      session({ childId: child.id, clientId: 'yesterday', startedAt: yesterday.toISOString(), endedAt: yesterday.toISOString() }),
      session({ childId: child.id, clientId: 'old', startedAt: old.toISOString(), endedAt: old.toISOString() }),
      session({ childId: child.id, clientId: 'future', startedAt: tomorrow.toISOString(), endedAt: tomorrow.toISOString() }),
    ]) await source.saveSession(record);
    const planner = vi.spyOn(core, 'planToday');
    const summarizer = vi.spyOn(core, 'summarizeLesson');
    const dates = vi.spyOn(core, 'localDateString');
    const plan = await source.today(child.id);
    expect(planner).toHaveBeenCalledOnce();
    const args = planner.mock.calls[0][0];
    expect(args.usedSec).toBe(120);
    expect(args.child.id).toBe(child.id);
    expect(args.history).toHaveLength(2);
    expect(args.history.map((record) => record.startedAt)).not.toContain(old.toISOString());
    expect(args.date).toEqual(NOW);
    expect(Object.keys(args.lessons)).toHaveLength(3);
    expect(summarizer).toHaveBeenCalledTimes(3);
    expect(dates).toHaveBeenCalled();
    expect(plan.items).toHaveLength(2);
    expect(plan.screen.usedSec).toBe(120);
    expect(plan.date).toBe(core.localDateString(NOW));
  });

  it('screen 直接调用 core 阶段/策略/屏幕计算，不加入临时十分钟', async () => {
    const { source } = create();
    const child = await source.saveChild(childInput({
      screen: { sessionMaxMin: 2, dailyMaxMin: 1, windows: [], distanceReminder: false },
    }));
    await source.saveSession(session({ childId: child.id }));
    const stage = vi.spyOn(core, 'findStage');
    const policy = vi.spyOn(core, 'resolveScreenPolicy');
    const status = vi.spyOn(core, 'screenStatus');
    expect(await source.screen(child.id)).toMatchObject({
      usedSec: 60, dailyMaxSec: 60, sessionMaxSec: 120, allowedNow: false, reason: 'daily-limit',
    });
    expect(stage).toHaveBeenCalledWith(expect.any(Object), 24);
    expect(policy).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-stage' }), child.screen, 24);
    expect(status).toHaveBeenCalledWith(expect.objectContaining({ windows: [], usedSec: 60, now: NOW }));
  });

  it('课程、路线、词库、音频共用一次 bundle 加载，返回带默认值的副本', async () => {
    const { source, fetch } = create();
    const [lessons, routes, words, audio] = await Promise.all([
      source.lessons(), source.routes(), source.lexicon(), source.audioManifests(),
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(lessons[0].cover?.imageUrl).toBe('./bundled/packs/sprout.core/assets/apple.svg');
    expect(lessons[1].cover?.imageUrl).toBe('./bundled/packs/sprout.core/assets/block.svg');
    expect(words[0].imageUrl).toBe(source.resolveAsset('sprout.core', words[0].imageUrl));
    expect(audio[0].manifest.entries['zh:苹果']).toBe('audio/apple.m4a');
    const loaded = await source.lesson(lessons[0].id);
    expect(loaded.lesson.steps[0].props).toMatchObject({ autoAdvanceSec: null, speak: 'name' });
    loaded.lesson.title.zh = '外部修改';
    routes[0].stages = [];
    expect((await source.lesson(lessons[0].id)).lesson.title.zh).not.toBe('外部修改');
    expect((await source.routes())[0].stages).toHaveLength(1);
    await expect(source.lesson('missing')).rejects.toMatchObject({ code: 'lesson-not-found' });
  });

  it('failed fetch 后下一次重新加载，不缓存失败 Promise', async () => {
    const { source, fetch } = create();
    fetch.mockRejectedValueOnce(new TypeError('offline'));
    await expect(source.bootstrap()).rejects.toMatchObject({ code: 'network' });
    expect(await source.lessons()).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('允许 lexicon/audio 为 null，缺失必填字段不能伪装为空内容包', async () => {
    const bundle = bundleFixture();
    bundle.lexicon = null;
    bundle.audio = null;
    bundle.lessons = [];
    const { source } = create(bundle);
    expect(await source.lexicon()).toEqual([]);
    expect(await source.audioManifests()).toEqual([]);
    const { source: invalid } = create({ schemaVersion: 1 });
    await expect(invalid.bootstrap()).rejects.toBeInstanceOf(BundleValidationError);
  });

  it.each<[string, (bundle: PackBundle) => unknown]>([
    ['schemaVersion', (bundle) => ({ ...bundle, schemaVersion: 2 })],
    ['builtAt', (bundle) => ({ ...bundle, builtAt: 'invalid' })],
    ['manifest', (bundle) => ({ ...bundle, manifest: { ...bundle.manifest, version: 'latest' } })],
    ['lexicon', (bundle) => ({ ...bundle, lexicon: { schemaVersion: 1, concepts: [{ id: 'apple' }] } })],
    ['routes', (bundle) => ({ ...bundle, routes: [{ ...bundle.routes[0], stages: [] }] })],
    ['lesson structure', (bundle) => ({ ...bundle, lessons: [{ ...bundle.lessons[0], offline: [] }] })],
    ['lesson props', (bundle) => ({ ...bundle, lessons: [{ ...bundle.lessons[0], steps: [{ type: 'word-cards', props: { items: [] } }] }] })],
    ['concept reference', (bundle) => ({ ...bundle, lessons: [{ ...bundle.lessons[0], steps: [{ type: 'word-cards', props: { items: ['missing'] } }] }] })],
    ['unknown builtin', (bundle) => ({ ...bundle, lessons: [{ ...bundle.lessons[0], steps: [{ type: 'unknown', props: {} }] }] })],
    ['audio', (bundle) => ({ ...bundle, audio: { schemaVersion: 1, entries: { 'zh:你好': '../bad.mp3' } } })],
    ['duplicate concepts', (bundle) => ({ ...bundle, lexicon: { ...bundle.lexicon, concepts: [bundle.lexicon!.concepts[0], bundle.lexicon!.concepts[0]] } })],
    ['duplicate lessons', (bundle) => ({ ...bundle, lessons: [bundle.lessons[0], bundle.lessons[0]] })],
  ])('校验整个 bundle 的 %s', async (_, mutate) => {
    const { source } = create(mutate(bundleFixture()));
    await expect(source.bootstrap()).rejects.toBeInstanceOf(BundleValidationError);
  });

  it('第三方活动未安装只保留 warning，允许 Host 提供占位步骤', async () => {
    const bundle = bundleFixture();
    bundle.lessons[0].steps = [{ type: 'example.activity', props: {} }];
    const { source } = create(bundle);
    expect((await source.lesson(bundle.lessons[0].id)).lesson.steps[0].type).toBe('example.activity');
  });

  it('历史按 clientId 去重，生成的 clientId 可持久化，重复对象不会重复计时', async () => {
    const { source, storage } = create();
    const child = await source.saveChild(childInput());
    const input = session({ childId: child.id, clientId: undefined });
    await source.saveSession(input);
    await source.saveSession(input);
    const saved = (await source.recent(child.id))[0];
    expect(saved.clientId).toMatch(/^session-/);
    await source.saveSession({ ...saved, durationSec: 300 });
    expect(await source.recent(child.id)).toHaveLength(1);
    expect((await source.screen(child.id)).usedSec).toBe(60);
    const restarted = create(bundleFixture(), storage).source;
    expect(await restarted.recent(child.id)).toEqual([saved]);
    await expect(source.saveSession({ ...saved, durationSec: -1 })).rejects.toThrow();
  });

  it('仅保留最近 2000 条，按孩子过滤，损坏存储不静默清空', async () => {
    const { source, storage } = create();
    const child = await source.saveChild(childInput());
    const state = JSON.parse(storage.getItem('sprout.local.state')!);
    state.sessions = Array.from({ length: 2001 }, (_, index) => session({
      childId: child.id,
      clientId: `old-${index}`,
      startedAt: new Date(NOW.getTime() - (index + 1) * 60_000).toISOString(),
      endedAt: new Date(NOW.getTime() - index * 60_000).toISOString(),
    }));
    storage.setItem('sprout.local.state', JSON.stringify(state));
    const recent = await source.recent(child.id);
    expect(recent).toHaveLength(2000);
    expect(recent[0].clientId).toBe('old-0');
    expect(recent.at(-1)?.clientId).toBe('old-1999');
    expect(await source.recent('another-child')).toEqual([]);
    storage.setItem('sprout.local.state', '{broken');
    await expect(source.recent(child.id)).rejects.toBeInstanceOf(StorageError);
    expect(storage.getItem('sprout.local.state')).toBe('{broken');
  });

  it('自定义 bundle 地址解析资源，阻止危险路径', async () => {
    const source = new LocalSource({
      storage: new MemoryStorage(), fetch: async () => json(bundleFixture()),
      bundleUrl: 'https://content.example/core/bundle.json',
    });
    await source.bootstrap();
    expect(source.resolveAsset('sprout.core', 'assets/apple.svg')).toBe('https://content.example/core/assets/apple.svg');
    expect(source.resolveAsset('sprout.core', 'concept:apple')).toBe('https://content.example/core/assets/apple.svg');
    expect(source.resolveAsset('sprout.core', 'https://content.example/apple.svg')).toBe('https://content.example/apple.svg');
    for (const path of ['../bad', '%2e%2e/bad', '%252e%252e/bad', 'assets/%2f..', 'assets\\bad', 'javascript:alert(1)', '//other.example/a', 'https://images.example/apple.svg']) {
      expect(() => source.resolveAsset('sprout.core', path)).toThrow();
    }
  });
});
