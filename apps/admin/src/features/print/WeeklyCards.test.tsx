// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme, TodayPlan } from '@sprout/schema';
import { initialData } from '../../mocks/fixtures';
import { useResource } from '../../lib/hooks';
import { useLessonDocuments } from './useLessonDocuments';
import WeeklyCards from './WeeklyCards';

vi.mock('../../lib/hooks', () => ({ useResource: vi.fn() }));
vi.mock('./useLessonDocuments', () => ({ useLessonDocuments: vi.fn() }));
const fixture = initialData();
const documents = fixture.lessons.slice(0, 2).map((lesson, index) => ({
  lesson: { ...lesson, printables: [{ kind: 'contrast' as const, title: '黑白卡', palette: 'bw' as const, patterns: [index ? 'face' as const : 'circle' as const] }] },
  packId: 'sprout.core', baseUrl: '/', issues: [],
}));
const theme: Theme = { id: 'test-theme', title: { zh: '一起看看' }, weeks: 2, domains: ['cognition'], lessons: documents.map((document) => document.lesson.id) };
let plan: TodayPlan;
let available = true;
let failed = false;

beforeEach(() => {
  available = true; failed = false;
  plan = {
    date: '2026-10-04', child: { id: 'child', name: '芽芽', ageMonths: 6, ageDays: 183 },
    route: { id: 'sprout.core.route', title: { zh: '成长路线' } },
    stage: null, theme: { ...theme, weekIndex: 0 }, items: [],
    screen: { mode: 'parent-only', usedSec: 0, dailyMaxSec: 0, sessionMaxSec: 0, allowedNow: false, coView: 'required' },
  };
  vi.mocked(useResource).mockImplementation((path) => ({
    data: path === '/api/lessons' ? documents.map((document) => ({ ...document.lesson, hasPrintables: available, packId: document.packId, stepTypes: ['guide'] })) : fixture.concepts,
    loading: false, error: null, reload: vi.fn(),
  }));
  vi.mocked(useLessonDocuments).mockImplementation((ids) => ({
    data: available ? documents.filter((document) => ids.includes(document.lesson.id)) : [],
    loading: false, error: failed ? new Error('读取卡片失败') : null, key: '', reload: vi.fn(),
  }));
});

function page(currentTheme = theme) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<WeeklyCards plan={plan} theme={currentTheme} />);
  return container;
}

describe('本周卡片入口', () => {
  it('今日无卡片但本主题有时仍显示逐张缩略图和主题打印入口', () => {
    const container = page();
    expect(container.textContent).toContain('本周卡片');
    expect(container.querySelectorAll('.family-printable-list li')).toHaveLength(2);
    const link = container.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/admin/print/theme/test-theme?routeId=sprout.core.route');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(container.textContent).not.toContain('打印今天的卡片');
  });
  it('今日课程可跨主题，打印今天合并全部卡片，主题与今日标识去重', () => {
    plan.items = documents.map((document) => ({
      lessonId: document.lesson.id, reason: 'pinned',
      lesson: { ...document.lesson, hasPrintables: true, packId: document.packId, stepTypes: ['guide'] },
    }));
    const container = page({ ...theme, lessons: [documents[0].lesson.id] });
    const link = [...container.querySelectorAll('a')].find((item) => item.textContent?.includes('打印今天的卡片'))!;
    expect(link.getAttribute('href')).toBe(`/admin/print/lesson/${documents[0].lesson.id}?lessonId=${documents[1].lesson.id}`);
    expect(link.target).toBe('_blank');
    expect(vi.mocked(useLessonDocuments).mock.lastCall?.[0]).toEqual(documents.map((document) => document.lesson.id));
  });
  it('今日与主题均无卡片时不显示空区块', () => {
    available = false;
    expect(page().textContent).toBe('');
  });
  it('没有当前主题时不会把全课程库的打印材料列成本周卡片', () => {
    plan.theme = null;
    expect(page().textContent).toBe('');
  });
  it('读取失败显示重试入口，不当作没有卡片', () => {
    failed = true;
    expect(page().textContent).toContain('读取卡片失败');
    expect(page().querySelector('button')?.textContent).toContain('重试');
  });
});
