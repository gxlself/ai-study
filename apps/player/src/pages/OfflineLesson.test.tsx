import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { Lesson } from '@sprout/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineLesson } from './OfflineLesson';
import { CoViewNotice, coViewNoticeRead } from '../ui/CoViewNotice';
import { LessonCard } from '../ui/common';
import { LessonPlayer } from './LessonPlayer';

const app = vi.hoisted(() => ({
  source: { saveSession: vi.fn(async () => undefined), lesson: vi.fn(), screen: vi.fn() },
  bootstrap: { child: { id: 'child-qa' } },
  speech: { stopSpeaking: vi.fn() },
  gateOpen: false,
  refresh: vi.fn(async () => undefined),
  navigation: { pushScope: vi.fn(() => vi.fn()) },
  concepts: [],
}));
vi.mock('../state/AppContext', () => ({ useApp: () => app }));

const lesson = Lesson.parse({
  schemaVersion: 1, id: 'test.offline', title: { zh: '一起线下玩' }, ageRange: [24, 36],
  domains: ['math'], durationMin: 2, coView: 'required', objectives: [{ zh: '一起找形状' }],
  parentGuide: { intro: '读完就去玩实物。', phrases: [{ zh: '圆圆的。', en: 'It is round.' }] },
  offline: [{ title: '找一找', steps: ['找一个圆形。'], question: '还有什么是圆的？', levels: { easier: '看一个。', harder: '找两个。' } }],
  steps: [{ type: 'word-cards', props: { items: ['circle'] } }],
});

describe('仅线下版与共看知情提示', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    localStorage.clear();
    app.bootstrap.child = { id: 'child-qa' };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it('只呈现家长导语、短语与线下玩法，完成记录不挂载活动且 audience=parent', async () => {
    await act(async () => root.render(<MemoryRouter><OfflineLesson data={{ lesson, packId: 'sprout.core', baseUrl: '/' }} /></MemoryRouter>));
    expect(container.textContent).toContain('线下版');
    expect(container.textContent).toContain('It is round.');
    expect(container.textContent).toContain('还有什么是圆的？');
    expect(container.textContent).toContain('找两个。');
    expect(container.querySelector('.activity-stage')).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('.primary')!.click());
    expect(app.source.saveSession).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      childId: 'child-qa', lessonId: 'test.offline', audience: 'parent', completed: true, stepsCompleted: 0, stepsTotal: 0,
    }));
  });
  it('关闭说明后同一个孩子不再显示，换孩子仍显示', async () => {
    await act(async () => root.render(<CoViewNotice childId="child-qa" />));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(coViewNoticeRead('child-qa')).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => root.render(<CoViewNotice childId="child-other" />));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(coViewNoticeRead('child-other')).toBe(false);
  });
  it('线下版卡片把选择标记带入路由，避免设置刷新竞态变成共看', async () => {
    function LocationState() {
      const location = useLocation();
      return <output>{JSON.stringify(location.state)}</output>;
    }
    await act(async () => root.render(<MemoryRouter>
      <LessonCard lesson={{ ...lesson, packId: 'sprout.core', stepTypes: ['word-cards'] }} offlineOnly />
      <LocationState />
    </MemoryRouter>));
    await act(async () => container.querySelector<HTMLButtonElement>('.lesson-card')!.click());
    expect(container.querySelector('output')!.textContent).toBe('{"offlineOnly":true}');
  });
  it('已选择线下版时直接读取家长内容，不请求共看状态或挂载活动', async () => {
    app.source.lesson.mockResolvedValue({ lesson, packId: 'sprout.core', baseUrl: '/' });
    app.source.screen.mockResolvedValue({ mode: 'co-view', allowedNow: true });
    await act(async () => root.render(<MemoryRouter initialEntries={[{
      pathname: '/lesson/test.offline', state: { offlineOnly: true },
    }]}>
      <Routes><Route path="/lesson/:id" element={<LessonPlayer />} /></Routes>
    </MemoryRouter>));
    expect(container.querySelector('.offline-lesson')).not.toBeNull();
    expect(container.querySelector('.activity-stage')).toBeNull();
    expect(app.source.screen).not.toHaveBeenCalled();
  });
});
