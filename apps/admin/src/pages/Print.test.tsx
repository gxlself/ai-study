// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { initialData } from '../mocks/fixtures';
import { useLessonDocuments } from '../features/print/useLessonDocuments';
import PrintRoutes from './Print';

vi.mock('../lib/hooks', () => ({ useResource: () => ({ data: initialData().concepts, loading: false, error: null }) }));
vi.mock('../features/print/useLessonDocuments', () => ({ useLessonDocuments: vi.fn() }));

describe('打印页面', () => {
  it('多课程今日打印去重，完整显示材料和顶部使用建议', () => {
    const fixture = initialData();
    vi.mocked(useLessonDocuments).mockReturnValue({
      data: fixture.lessons.slice(0, 2).map((lesson) => ({
        lesson: { ...lesson, printables: [{ kind: 'contrast', title: '黑白卡', patterns: ['circle'], palette: 'bw' }] },
        packId: 'sprout.core', baseUrl: '/', issues: [],
      })), loading: false, error: null, key: '', reload: vi.fn(),
    });
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/print/lesson/core.a?lessonId=core.b&lessonId=core.a']}><PrintRoutes /></MemoryRouter>);
    expect(vi.mocked(useLessonDocuments).mock.lastCall?.[0]).toEqual(['core.a', 'core.b']);
    expect(html).toContain('打印今天的卡片');
    for (const text of ['A4', '实际大小', '厚纸或过塑', '剪圆角', '由成人拿取', '20–30 厘米', '慢慢移动', '每次几分钟']) expect(html).toContain(text);
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelectorAll('.print-contrast-page')).toHaveLength(2);
    expect(container.querySelector('.print-help')).not.toBeNull();
  });
});
