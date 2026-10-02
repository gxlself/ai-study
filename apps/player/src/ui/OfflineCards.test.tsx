import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OfflineCards } from './common';

describe('线下玩法卡', () => {
  it('展示材料、开放问题和三档玩法，同时兼容旧课程', () => {
    const html = renderToStaticMarkup(<OfflineCards items={[{
      title: '摸摸积木', materials: ['两块大积木'], steps: ['一起摸一摸。'], question: '哪一块更高？',
      levels: { easier: '只摸一块。', harder: '试试叠在一起。' }, safety: '成人陪同。',
    }]} />);
    expect(html).toContain('哪一块更高？');
    expect(html).toContain('简单一点');
    expect(html).toContain('一起试试');
    expect(html).toContain('挑战一下');
    expect(html).toContain('成人陪同。');
    const old = renderToStaticMarkup(<OfflineCards items={[{ title: '一起说话', steps: ['面对面等宝宝回应。'] }]} />);
    expect(old).toContain('面对面等宝宝回应。');
    expect(old).not.toContain('挑战一下');
  });
});
