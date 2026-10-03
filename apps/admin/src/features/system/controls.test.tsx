// @vitest-environment jsdom
import { act, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, ConfigProvider } from 'antd';
import { ConfirmedSwitch, FilePicker } from './shared';
import PluginTrustDialog from './PluginTrustDialog';

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

describe('第三方插件知情确认', () => {
  const plugin = { id: 'example.puzzle', version: '1.0.0', name: { zh: '拼图' }, permissions: ['network', 'storage'] };
  const sourceUrl = 'https://plugins.example/plugin.json';
  const entryUrl = 'https://plugins.example/index.js';
  it.each(['安装', '启用'] as const)('%s 前展示权限和来源，只有勾选后才可提交', async (operation) => {
    const confirm = vi.fn();
    await render(<PluginTrustDialog plugin={plugin} sourceUrl={sourceUrl} entryUrl={entryUrl}
      operation={operation} busy={false} onCancel={vi.fn()} onConfirm={confirm} />);
    expect(document.body.textContent).toContain('插件与播放端同源运行，只安装你信任的来源');
    expect(document.body.textContent).toContain(sourceUrl);
    expect(document.body.textContent).toContain(entryUrl);
    expect(document.body.textContent).toContain('网络访问');
    expect(document.body.textContent).toContain('本地存储');
    expect((button(`信任并${operation}`) as HTMLButtonElement).disabled).toBe(true);
    await click(button(`信任并${operation}`));
    expect(confirm).not.toHaveBeenCalled();
    await click(document.querySelector('input[type="checkbox"]'));
    await click(button(`信任并${operation}`));
    expect(confirm).toHaveBeenCalledOnce();
  });
  it('权限或来源变化后必须重新勾选', async () => {
    const confirm = vi.fn();
    const props = { sourceUrl, entryUrl, operation: '启用' as const, busy: false, onCancel: vi.fn(), onConfirm: confirm };
    await render(<PluginTrustDialog {...props} plugin={plugin} />);
    await click(document.querySelector('input[type="checkbox"]'));
    expect((button('信任并启用') as HTMLButtonElement).disabled).toBe(false);
    await render(<PluginTrustDialog {...props} plugin={{ ...plugin, permissions: ['camera'] }} />);
    expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect((button('信任并启用') as HTMLButtonElement).disabled).toBe(true);
    await click(document.querySelector('input[type="checkbox"]'));
    await render(<PluginTrustDialog {...props} plugin={{ ...plugin, permissions: ['camera'] }} sourceUrl="https://another.example/plugin.json" />);
    expect((button('信任并启用') as HTMLButtonElement).disabled).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('取消不提交；服务端缺失来源入口时不能确认', async () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    await render(<PluginTrustDialog plugin={plugin} sourceUrl="未知来源" operation="启用" busy={false}
      onCancel={cancel} onConfirm={confirm} />);
    await click(document.querySelector('input[type="checkbox"]'));
    expect((button('信任并启用') as HTMLButtonElement).disabled).toBe(true);
    await click(button('取消'));
    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });
});
