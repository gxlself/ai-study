import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Setup } from './Setup';

const app = vi.hoisted(() => ({
  bootstrap: null, loading: false, source: null, error: '',
  useLocal: vi.fn(async () => undefined),
  useRemote: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  navigation: { pushScope: vi.fn(() => vi.fn()) },
}));
vi.mock('../state/AppContext', () => ({ useApp: () => app }));

describe('setup 安全区页面入口', () => {
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

  async function render(path = '/setup') {
    await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Setup /></MemoryRouter>));
  }
  async function click(selector: string) {
    await act(async () => container.querySelector<HTMLElement>(selector)!.click());
  }

  it('两个选项保留独立焦点，并可进入离线建档和返回', async () => {
    await render();
    expect(container.querySelectorAll('.setup-options > button[data-focusable]')).toHaveLength(2);
    await click('.setup-option.local');
    expect(container.querySelector('.setup-local .child-form')).not.toBeNull();
    expect(container.querySelector('.child-form > .primary[data-focusable]')).not.toBeNull();
    await click('button[aria-label="返回"]');
    expect(container.querySelector('.setup-choose .setup-options')).not.toBeNull();
  });

  it('配对输入双栏保留全部数字键和可编辑的完整地址', async () => {
    await render('/setup?connect=1');
    expect(container.querySelector('.pairing-entry .pairing-details')).not.toBeNull();
    expect(container.querySelectorAll('.numeric-keypad > button[data-focusable]')).toHaveLength(14);
    expect(container.querySelector('.pairing-details input[aria-label="完整服务器地址"]')).not.toBeNull();
    await click('.numeric-keypad > button');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="服务器 IP"]')!.value).toBe('192.168.1');
    await click('button[aria-label="删除一位"]');
    expect(container.querySelector<HTMLInputElement>('input[aria-label="服务器 IP"]')!.value).toBe('192.168.');
  });

  it('离线保存仍提交真实出生年月和缺省小名', async () => {
    await render('/setup?offline=1');
    await click('.child-form > .primary');
    expect(app.useLocal).toHaveBeenCalledOnce();
    expect(app.useLocal.mock.calls[0]).toEqual([expect.objectContaining({
      name: '芽芽', birthday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })]);
  });
});
