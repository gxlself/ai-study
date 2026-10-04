import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { ChildInput, Lesson } from '@sprout/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonExperience } from './LessonPlayer';

const app = vi.hoisted(() => ({
  source: { kind: 'remote', server: 'http://192.168.1.8:4310', resolveAsset: (_pack: string, path: string) => path, saveSession: vi.fn(async () => {}) },
  bootstrap: null as unknown,
  registry: {}, concepts: [], prefs: { parentHints: false }, gateOpen: false, reducedMotion: true,
  navigation: { pushScope: vi.fn(() => vi.fn()) },
  speech: { pause: vi.fn(), resume: vi.fn(), unlock: vi.fn(async () => {}), stopSpeaking: vi.fn() },
  refresh: vi.fn(async () => {}), mounts: vi.fn(),
}));
vi.mock('../state/AppContext', () => ({ useApp: () => app }));
vi.mock('../host', () => ({
  createResources: () => ({ resolveAsset: (path: string) => path, concept: () => undefined }),
  preloadLesson: vi.fn(async () => {}),
}));
vi.mock('../compat', () => ({ tryFullscreen: vi.fn(async () => false) }));
vi.mock('../ui/ActivityStage', () => ({
  ActivityStage: ({ onLog }: { onLog: (type: string, value?: Record<string, unknown>) => void }) => {
    useEffect(() => { app.mounts(); }, []);
    return <div className="activity-stage--guide">
      <button className="play" onClick={() => onLog('guide:start', { playMin: 5 })}>陪玩</button>
      <button className="review" onClick={() => onLog('guide:review')}>再看步骤</button>
      <button className="end" onClick={() => onLog('guide:play-end')}>结束</button>
    </div>;
  },
}));

const lesson = Lesson.parse({
  schemaVersion: 1, id: 'core.s1.cards', title: { zh: '看看实体卡片' }, ageRange: [6, 9],
  domains: ['cognition'], durationMin: 3, coView: 'required', audience: 'parent',
  objectives: [{ zh: '面对面陪玩' }], parentGuide: { intro: '拿着卡片慢慢移动。' },
  offline: [{ title: '看看卡片', steps: ['由家长拿卡。'] }],
  steps: [{ type: 'guide', props: { goal: '看看卡片', steps: [{ text: '由家长拿卡。' }], playMin: 5 } }],
  printables: [{ kind: 'contrast', title: '黑白卡', patterns: ['circle'], palette: 'bw' }],
});

describe('课程打印入口', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    app.source.kind = 'remote';
    app.bootstrap = { child: { ...ChildInput.parse({ name: '芽芽', birthday: '2026-04-04' }), id: 'child' } };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const render = (value = lesson) => act(async () => root.render(<MemoryRouter><LessonExperience data={{ lesson: value, packId: 'sprout.core', baseUrl: '/' }} /></MemoryRouter>));
  const click = (selector: string) => act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());

  it('导语和 guide 页显示同一地址；陪玩时隐藏，再看步骤时恢复且不重挂活动', async () => {
    await render();
    const address = container.querySelector('.print-cards-address')?.textContent;
    expect(address).toBe('http://192.168.1.8:4310/admin/print/lesson/core.s1.cards');
    await click('.start-lesson');
    expect(container.querySelector('.guide-with-print .print-cards-address')?.textContent).toBe(address);
    await click('.play');
    expect(container.querySelector('.print-cards-prompt')).toBeNull();
    await click('.review');
    expect(container.querySelector('.print-cards-address')?.textContent).toBe(address);
    expect(container.querySelector('.guide-dim')).toBeNull();
    await click('.play');
    await click('.end');
    expect(container.querySelector('.print-cards-address')?.textContent).toBe(address);
    expect(app.mounts).toHaveBeenCalledOnce();
  });
  it('离线模式在导语和 guide 页提示连接家庭服务器', async () => {
    app.source.kind = 'local';
    await render();
    expect(container.querySelector('.print-cards-prompt')?.textContent).toContain('连接家庭服务器后可在后台打印卡片');
    await click('.start-lesson');
    expect(container.querySelector('.print-cards-prompt')?.textContent).toContain('连接家庭服务器后可在后台打印卡片');
  });
  it('没有打印材料时不显示提示', async () => {
    await render({ ...lesson, printables: [] });
    expect(container.querySelector('.print-cards-prompt')).toBeNull();
    await click('.start-lesson');
    expect(container.querySelector('.print-cards-prompt')).toBeNull();
  });
});
