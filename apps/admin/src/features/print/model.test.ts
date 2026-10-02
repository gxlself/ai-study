import { describe, expect, it } from 'vitest';
import { initialData } from '../../mocks/fixtures';
import { buildPrintPages, resolvePrintConcept, type PrintBlock } from './model';

describe('实体卡 A4 分页', () => {
  const fixture = initialData();
  it.each([['large', 2], ['medium', 4], ['small', 8]] as const)('%s 每页 %i 张，不漏尾页', (size, count) => {
    const block: PrintBlock = { lesson: fixture.lessons[0], packId: 'sprout.core', printable: {
      kind: 'cards', title: '实体卡', items: Array.from({ length: 9 }, () => 'bear'), size, showText: true, showEnglish: true,
    } };
    const pages = buildPrintPages([block]);
    expect(pages).toHaveLength(Math.ceil(9 / count));
    expect(pages[0]).toMatchObject({ kind: 'cards', items: Array.from({ length: count }, () => 'bear') });
    expect(pages.flatMap((page) => page.kind === 'cards' ? page.items : [])).toHaveLength(9);
  });
  it('每个高对比图案独占一页，主题合并不丢课程来源', () => {
    const blocks: PrintBlock[] = [
      { lesson: fixture.lessons[0], packId: 'sprout.core', printable: { kind: 'contrast', title: '黑白卡', palette: 'bw', patterns: ['circle', 'face'] } },
      { lesson: fixture.lessons[1], packId: 'sprout.core', printable: { kind: 'cards', title: '形状卡', items: ['circle'], size: 'large', showText: true, showEnglish: false } },
    ];
    const pages = buildPrintPages(blocks);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toMatchObject({ kind: 'contrast', pattern: 'circle', block: { lesson: { id: fixture.lessons[0].id } } });
  });
  it('同名词条优先课程本包，内联图片以对应包解析，缺失不伪造', () => {
    const core = fixture.concepts[0];
    const custom = { ...core, packId: 'sprout.custom', zh: '我的小熊' };
    expect(resolvePrintConcept('bear', 'sprout.custom', [core, custom])?.zh).toBe('我的小熊');
    expect(resolvePrintConcept({ zh: '奶奶', image: 'assets/grandma.png' }, 'sprout.custom', []))
      .toEqual({ zh: '奶奶', en: undefined, imageUrl: '/packs/sprout.custom/assets/grandma.png' });
    expect(resolvePrintConcept('missing', 'sprout.core', [])).toBeUndefined();
  });
});
