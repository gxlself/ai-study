// @vitest-environment jsdom
import { act, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, ConfigProvider } from 'antd';
import { ConfirmedSwitch, FilePicker } from './shared';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

async function render(content: ReactNode) {
  await act(async () => {
    root.render(<ConfigProvider theme={{ token: { motion: false } }}><App>{content}</App></ConfigProvider>);
  });
}

async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => {
    (element as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function button(text: string) {
  return [...document.querySelectorAll('button')].find((element) =>
    element.textContent?.replace(/\s/g, '') === text,
  ) ?? null;
}

describe('启停确认', () => {
  it('点击停用只打开确认，取消时不更改状态或发起请求', async () => {
    const change = vi.fn(async () => true);
    await render(
      <ConfirmedSwitch checked label="内容包开关" title="停用内容包？" description="相关课程将不可用" onChange={change} />,
    );
    await click(container.querySelector('button[aria-label="内容包开关"]'));
    expect(change).not.toHaveBeenCalled();
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('停用内容包？');
    await click(button('取消'));
    expect(change).not.toHaveBeenCalled();
  });

  it('确认后才提交停用', async () => {
    const change = vi.fn(async () => true);
    await render(
      <ConfirmedSwitch checked label="内容包开关" title="停用内容包？" description="相关课程将不可用" onChange={change} />,
    );
    await click(container.querySelector('button[aria-label="内容包开关"]'));
    await click(button('确认停用'));
    expect(change).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('第三方插件从停用切换启用也必须确认', async () => {
    const change = vi.fn(async () => true);
    await render(
      <ConfirmedSwitch checked={false} confirmEnable label="插件开关" title="信任插件？" description="网络访问风险" onChange={change} />,
    );
    await click(container.querySelector('button[aria-label="插件开关"]'));
    expect(change).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('网络访问风险');
    await click(button('信任并启用'));
    expect(change).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('未要求信任确认的内容包可以直接启用', async () => {
    const change = vi.fn(async () => true);
    await render(
      <ConfirmedSwitch checked={false} label="内容包开关" title="确认" description="确认" onChange={change} />,
    );
    await click(container.querySelector('button[aria-label="内容包开关"]'));
    expect(change).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('请求失败不会在界面上提前改变开关', async () => {
    const change = vi.fn(async () => false);
    await render(
      <ConfirmedSwitch checked label="内容包开关" title="停用内容包？" description="相关课程将不可用" onChange={change} />,
    );
    await click(container.querySelector('button[aria-label="内容包开关"]'));
    await click(button('确认停用'));
    expect(change).toHaveBeenCalledExactlyOnceWith(false);
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('备份文件选择', () => {
  it('选择无效文件后清除原选择，避免误恢复先前的备份', async () => {
    function Picker() {
      const [file, setFile] = useState<File | null>(null);
      return (
        <>
          <FilePicker file={file} extension="json" onChange={setFile} />
          <output>{file?.name || '未选择'}</output>
        </>
      );
    }
    await render(<Picker />);
    async function choose(file: File) {
      const input = container.querySelector('input[type="file"]');
      expect(input).not.toBeNull();
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      await act(async () => {
        input!.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    await choose(new File(['{"schemaVersion":1}'], 'family.json', { type: 'application/json' }));
    expect(container.querySelector('output')?.textContent).toBe('family.json');
    await choose(new File(['not a backup'], 'wrong.txt', { type: 'text/plain' }));
    expect(container.querySelector('output')?.textContent).toBe('未选择');
    expect(container.textContent).toContain('请选择 JSON 备份文件');
  });
});
