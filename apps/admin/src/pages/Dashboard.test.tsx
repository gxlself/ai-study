// @vitest-environment jsdom
import { ChildInput, type ChildProfile, type TodayPlan, type TodayPlanItem } from '@sprout/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFamily } from '../context';
import { useResource } from '../lib/hooks';
import Dashboard from './Dashboard';

vi.mock('../context', () => ({ useFamily: vi.fn() }));
vi.mock('../lib/hooks', () => ({ useResource: vi.fn() }));
vi.mock('../components/LessonDetail', () => ({ default: () => null }));

const child: ChildProfile = {
  ...ChildInput.parse({ name: '小芽', birthday: '2024-04-03', screen: { mode: 'parent-only' } }),
  id: 'child-a', createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z',
};
let plan: TodayPlan;

function item(id: string, audience?: TodayPlanItem['lesson']['audience'], offlineOnly?: boolean): TodayPlanItem {
  return {
    lessonId: id, reason: 'theme', offlineOnly,
    lesson: {
      id, packId: 'sprout.core', title: { zh: id }, ageRange: [24, 36], domains: ['language'],
      durationMin: 3, coView: 'required', audience, hasPrintables: true, stepTypes: ['guide'],
    },
  };
}

function lessonCards() {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<MemoryRouter><Dashboard /></MemoryRouter>);
  return [...container.querySelectorAll('article.family-lesson-item')];
}

beforeEach(() => {
  plan = {
    date: '2026-10-03', child: { id: child.id, name: child.name, ageMonths: 30, ageDays: 913 },
    route: { id: 'sprout.core.route', title: { zh: '芽芽成长路线' } },
    stage: null, theme: null, items: [],
    screen: { usedSec: 0, dailyMaxSec: 1200, sessionMaxSec: 600, allowedNow: true, coView: 'required', mode: 'parent-only' },
  };
  vi.mocked(useFamily).mockReturnValue({
    child, childId: child.id, children: [child], loading: false,
    refreshChildren: vi.fn(async () => {}), selectChild: vi.fn(),
  });
  vi.mocked(useResource).mockImplementation((path) => ({
    data: path?.endsWith('/today') ? plan : undefined,
    loading: false, error: null, reload: vi.fn(),
  }));
});

describe('今日计划课程类型', () => {
  it.each(['child', undefined] as const)('offlineOnly 优先显示线下版，兼容 audience=%s', (audience) => {
    plan.items = [item('offline-lesson', audience, true)];
    const card = lessonCards()[0];
    const badges = card.querySelector('.lesson-type-tags')?.textContent;
    expect(badges).toContain('线下版');
    expect(badges).not.toContain('亲子共看课');
    expect(badges).not.toContain('家长指引课');
    expect(badges).toContain('可打印');
    expect(card.textContent).toContain('主题');
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/print/lesson/offline-lesson');
  });

  it.each([undefined, false])('offlineOnly=%s 不把普通课程误标为线下版', (offlineOnly) => {
    plan.items = [item('child-lesson', 'child', offlineOnly), item('parent-lesson', 'parent', offlineOnly)];
    const cards = lessonCards();
    expect(cards[0].querySelector('.lesson-type-tags')?.textContent).toContain('亲子共看课');
    expect(cards[1].querySelector('.lesson-type-tags')?.textContent).toContain('家长指引课');
    expect(cards.every((card) => !card.textContent?.includes('线下版'))).toBe(true);
  });
});
