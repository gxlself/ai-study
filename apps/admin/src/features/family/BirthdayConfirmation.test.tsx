// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BirthdayWarning, useBirthdayConfirmation } from './BirthdayConfirmation';

let root: Root;
let container: HTMLDivElement;
const save = vi.fn();

function Harness({ birthday }: { birthday: string }) {
  const confirmBirthday = useBirthdayConfirmation();
  const value = dayjs(birthday);
  return <><BirthdayWarning birthday={value} /><button onClick={() => void confirmBirthday(value).then((confirmed) => {
    if (confirmed) save(birthday);
  })}>保存档案</button></>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 3, 10));
  save.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(birthday: string) {
  await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}><App>
    <Harness birthday={birthday} />
  </App></ConfigProvider>));
}
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.replace(/\s/g, '') === text);
  expect(button).toBeDefined();
  await act(async () => { button!.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
}

describe('生日二次确认', () => {
  it.each(['2026-10-03', '2026-09-04'])('%s 显示黄色提示，取消后不保存，确认后才保存', async (birthday) => {
    await render(birthday);
    expect(container.querySelector('.ant-alert-warning')?.textContent).toContain('请确认宝宝生日（当前为');
    await click('保存档案');
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(birthday);
    await click('返回修改');
    expect(save).not.toHaveBeenCalled();
    await click('保存档案');
    await click('确认生日并保存');
    expect(save).toHaveBeenCalledExactlyOnceWith(birthday);
  });

  it('满 1 个月无需确认，未来日期提示修改且不能保存', async () => {
    await render('2026-09-03');
    expect(container.querySelector('.ant-alert-warning')).toBeNull();
    await click('保存档案');
    expect(save).toHaveBeenCalledExactlyOnceWith('2026-09-03');
    save.mockClear();
    await render('2026-10-04');
    expect(container.querySelector('.ant-alert-warning')?.textContent).toContain('当前为 -1 天');
    expect(container.textContent).toContain('生日晚于今天');
    await click('保存档案');
    expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
