import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildInput, type LessonSummary, type TodayPlan } from '@sprout/schema';
import { Home } from './Home';

const app = vi.hoisted(() => ({
  bootstrap: null as unknown,
  plan: null as unknown,
  lessons: [] as unknown[],
  concepts: [],
  source: { recent: vi.fn(async () => []), resolveAsset: vi.fn((_pack: string, path: string) => path) },
  refresh: vi.fn(async () => undefined),
  error: '',
  navigation: { pushScope: vi.fn(() => vi.fn()) },
}));
vi.mock('../state/AppContext', () => ({ useApp: () => app }));

function installHome(mode: 'parent-only' | 'co-view', ageMonths: number, count: number) {
  const birthday = ageMonths === 30 ? '2024-04-03' : '2026-03-03';
  const child = { ...ChildInput.parse({ name: '芽芽', birthday, screen: { mode } }), id: 't27-child' };
  const lessons: LessonSummary[] = Array.from({ length: count }, (_, index) => ({
    id: `t27.lesson-${index}`, packId: 'sprout.core', title: { zh: `一起玩 ${index + 1}` },
    summary: { zh: '跟着宝宝的节奏一起玩。' }, ageRange: [ageMonths, ageMonths + 3],
    domains: ['motor'], durationMin: 2, coView: 'required',
    audience: mode === 'parent-only' ? 'parent' : 'child', stepTypes: ['guide'],
  }));
  const plan: TodayPlan = {
    date: '2026-10-03', child: { id: child.id, name: child.name, ageMonths, ageDays: ageMonths * 30 },
    route: { id: 'sprout.core.route', title: { zh: '成长路线' } }, stage: null, theme: null,
    items: lessons.map((lesson) => ({ lessonId: lesson.id, lesson, reason: 'theme' })),
    screen: { mode, usedSec: 0, dailyMaxSec: 1200, sessionMaxSec: 600, allowedNow: true, coView: 'required' },
  };
  app.bootstrap = { child };
  app.plan = plan;
  app.lessons = lessons;
  localStorage.setItem(`sprout.coViewNotice:${child.id}`, '1');
  return { child, lessons, plan };
}

describe('首页今日卡片布局', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it.each([
    ['parent-only', 7, 2], ['parent-only', 7, 3], ['co-view', 30, 2], ['co-view', 30, 3],
  ] as const)('%s（%i 月龄，%i 张）按今日卡片数量分配列，保留可聚焦入口', async (mode, ageMonths, count) => {
    installHome(mode, ageMonths, count);
    await act(async () => root.render(<MemoryRouter><Home /></MemoryRouter>));
    const grid = container.querySelector<HTMLElement>('.today-grid')!;
    expect(grid.style.getPropertyValue('--lesson-count')).toBe(String(count));
    expect(grid.querySelectorAll('button[data-focusable]')).toHaveLength(count);
    expect(grid.closest(mode === 'parent-only' ? '.parent-journey' : '.journey')).not.toBeNull();
    expect(container.querySelector('.parent-button[data-focusable]')).not.toBeNull();
  });

  it('共看首页没有家长指引时不渲染整个分区或空提示', async () => {
    installHome('co-view', 30, 2);
    await act(async () => root.render(<MemoryRouter><Home /></MemoryRouter>));
    expect(container.querySelector('.parent-guide-section')).toBeNull();
    expect(container.textContent).not.toContain('当前内容包暂无适龄的家长指引课。');
    expect(container.querySelectorAll('.journey .lesson-card')).toHaveLength(2);
  });

  it('只有不适龄或已跳过的家长课时，同样隐藏家长指引分区', async () => {
    const { child, lessons } = installHome('co-view', 30, 2);
    const parent: LessonSummary = { ...lessons[0], id: 'parent.skipped', audience: 'parent' };
    child.plan.skipped = [parent.id];
    app.lessons = [
      ...lessons, parent,
      { ...parent, id: 'parent.younger', ageRange: [6, 17] },
      { ...parent, id: 'parent.older', ageRange: [31, 36] },
    ];
    await act(async () => root.render(<MemoryRouter><Home /></MemoryRouter>));
    expect(container.querySelector('.parent-guide-section')).toBeNull();
  });

  it('适龄家长课出现时显示分区，同一课程在计划与目录中只展示一次', async () => {
    const { lessons, plan } = installHome('co-view', 30, 2);
    const parent: LessonSummary = { ...lessons[0], id: 'parent.available', audience: 'parent', hasPrintables: true };
    app.lessons = [...lessons, parent];
    plan.items.push({ lessonId: parent.id, lesson: parent, reason: 'balance' });
    await act(async () => root.render(<MemoryRouter><Home /></MemoryRouter>));
    const section = container.querySelector('.parent-guide-section')!;
    expect(section.querySelector('h2')?.textContent).toBe('家长指引');
    expect(section.querySelectorAll('.adult-card[data-focusable]')).toHaveLength(1);
    expect(section.querySelector('.printable-note')?.textContent).toBe('可在后台打印卡片');
    expect(section.querySelector('.printable-note svg')).not.toBeNull();
  });

  it('仅家长首页没有课程时保留原有空状态与家长菜单', async () => {
    installHome('parent-only', 7, 0);
    await act(async () => root.render(<MemoryRouter><Home /></MemoryRouter>));
    expect(container.querySelector('.parent-journey .empty')?.textContent).toContain('这个阶段的家长指引正在准备');
    expect(container.querySelector('.parent-button[data-focusable]')).not.toBeNull();
  });
});
