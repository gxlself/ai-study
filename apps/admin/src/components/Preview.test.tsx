// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFamily } from '../context';
import { api } from '../lib/api';
import { initialData } from '../mocks/fixtures';
import Preview from './Preview';

vi.mock('../context', () => ({ useFamily: vi.fn() }));
vi.mock('antd', () => ({
  Alert: ({ title, description, action }: { title: string; description: string; action: React.ReactNode }) =>
    <div role="alert">{title}{description}{action}</div>,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    <button onClick={onClick}>{children}</button>,
  Spin: () => <span />,
}));

let root: Root;
let container: HTMLDivElement;
const credential = () => ({ token: 'readonly-preview-token', expiresAt: new Date(Date.now() + 600000).toISOString() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const { children } = initialData();
  vi.mocked(useFamily).mockReturnValue({
    child: children[0], childId: children[0].id, children, loading: false,
    selectChild: vi.fn(), refreshChildren: vi.fn(async () => {}),
  });
  vi.spyOn(api, 'post').mockImplementation(async () => credential() as never);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(id = 'custom.preview') {
  await act(async () => root.render(<Preview lessonId={id} />));
}
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe('只读预览令牌生命周期', () => {
  it('申请完成前不加载 iframe，完成后只使用 previewToken', async () => {
    let resolve!: (value: never) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    sessionStorage.setItem('sprout.adminToken', 'admin-secret-never-in-preview');
    await render();
    expect(api.post).toHaveBeenCalledWith('/api/preview/token', undefined, { signal: expect.any(AbortSignal) });
    expect(container.querySelector('iframe')).toBeNull();
    await act(async () => resolve(credential() as never));
    const source = container.querySelector('iframe')!.src;
    expect(source).toContain('previewToken=readonly-preview-token');
    expect(source).not.toContain('admin-secret');
    expect(new URLSearchParams(new URL(source).hash.split('?')[1]).has('token')).toBe(false);
    sessionStorage.clear();
  });
  it('申请失败不使用管理员 token 回退，允许重新申请', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('预览接口暂不可用'));
    await render();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('预览接口暂不可用');
    await click('重试');
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(container.querySelector('iframe')).not.toBeNull();
  });
  it('超时取消请求，离开组件时也取消请求', async () => {
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(() => {}));
    await render();
    const signal = vi.mocked(api.post).mock.calls[0][2]!.signal!;
    await act(async () => vi.advanceTimersByTime(10000));
    expect(signal.aborted).toBe(true);
    expect(container.textContent).toContain('申请预览凭据超时');
    expect(container.querySelector('iframe')).toBeNull();
  });
  it('已过期令牌被拒绝；正在使用的令牌到期后卸载 iframe', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ token: 'expired', expiresAt: new Date(Date.now() - 1).toISOString() } as never);
    await render();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('已过期');
    vi.mocked(api.post).mockResolvedValueOnce({ token: 'brief', expiresAt: new Date(Date.now() + 1000).toISOString() } as never);
    await click('重试');
    expect(container.querySelector('iframe')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('预览凭据已过期');
  });
  it('切课取消旧申请，旧响应不能覆盖新课程', async () => {
    let resolve!: (value: never) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await render('custom.old');
    const signal = vi.mocked(api.post).mock.calls[0][2]!.signal!;
    await render('custom.new');
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ ...credential(), token: 'stale' } as never));
    expect(container.querySelector('iframe')!.src).toContain('custom.new');
    expect(container.querySelector('iframe')!.src).not.toContain('stale');
  });
  it('隐藏页面卸载预览，恢复需点击并重新申请令牌', async () => {
    await render();
    const firstSignal = vi.mocked(api.post).mock.calls[0][2]!.signal!;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.querySelector('iframe')).toBeNull();
    expect(firstSignal.aborted).toBe(true);
    expect(container.textContent).toContain('预览已暂停');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await click('继续预览');
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(container.querySelector('iframe')).not.toBeNull();
  });
  it('只向本 iframe 的确定播放端 origin 发送草稿，不接受其它窗口或 origin', async () => {
    const lesson = initialData().lessons[0];
    await act(async () => root.render(<Preview lesson={lesson} />));
    const frame = container.querySelector('iframe')!;
    const target = frame.contentWindow!;
    const send = vi.spyOn(target, 'postMessage').mockImplementation(() => {});
    const origin = new URL(frame.src).origin;
    const ready = (source: Window, from: string) => window.dispatchEvent(new MessageEvent('message', {
      source, origin: from, data: { type: 'sprout:preview:ready' },
    }));
    await act(async () => {
      ready(window, origin);
      ready(target, 'https://untrusted.example');
    });
    expect(send).not.toHaveBeenCalled();
    await act(async () => ready(target, origin));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'sprout:preview', lesson, packId: 'sprout.custom' }, origin);
    expect(send.mock.calls.some((call) => (call[1] as unknown) === '*')).toBe(false);
  });
});
