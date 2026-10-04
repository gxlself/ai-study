import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChildInput, type ChildProfile } from '@sprout/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildForm } from './ChildForm';

describe('离线出生年月确认', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onSave = vi.fn(async (_input: ChildInput) => undefined);
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 10));
    onSave.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
  async function click(selector: string) {
    await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
  }
  async function render(birthday?: string) {
    const child: ChildProfile | undefined = birthday ? {
      ...ChildInput.parse({ name: '芽芽', birthday }), id: 'child',
      createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z',
    } : undefined;
    await act(async () => root.render(<ChildForm child={child} onSave={onSave} />));
  }

  it('当前年月在选择时提示，首次保存不提交，确认后保留真实生日', async () => {
    await render('2026-10-01');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('请确认宝宝的出生年月：2026 年 10 月');
    await click('.child-form > .primary');
    expect(onSave).not.toHaveBeenCalled();
    await click('.birthday-confirmation button');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ birthday: '2026-10-01' }));
  });

  it('首次建档选当前年月必须确认，不默认直接保存为今天', async () => {
    await render();
    await click('button[aria-label="出生年加一"]');
    await click('button[aria-label="出生年加一"]');
    await click('.child-form > .primary');
    expect(onSave).not.toHaveBeenCalled();
    await click('.birthday-confirmation button');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ birthday: '2026-10-03' }));
  });

  it('未来年月提示纠正，不能被静默夹成今天后保存', async () => {
    await render('2026-11-01');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('所选年月晚于当前');
    await click('.child-form > .primary');
    expect(container.querySelector<HTMLButtonElement>('.birthday-confirmation button')?.disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    await click('button[aria-label="出生月减一"]');
    await click('.birthday-confirmation button');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ birthday: '2026-10-03' }));
  });

  it('过去年月可直接保存，默认出生年月没有误填今天', async () => {
    await render();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await click('.child-form > .primary');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ birthday: '2024-10-31' }));
  });
});
