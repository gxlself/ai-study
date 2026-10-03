import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeMediaQuery, requestDeadline } from './compat';

afterEach(() => vi.useRealTimers());

describe('旧 WebView 请求取消', () => {
  it('请求超时中止，并能释放计时器', () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deadline = requestDeadline(parent.signal, 100);
    vi.advanceTimersByTime(99);
    expect(deadline.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(deadline.signal.aborted).toBe(true);
    deadline.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])('同步传递父信号（已中止=%s），清理监听', (aborted) => {
    vi.useFakeTimers();
    const parent = new AbortController();
    if (aborted) parent.abort();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const deadline = requestDeadline(parent.signal, 100);
    if (!aborted) parent.abort();
    expect(deadline.signal.aborted).toBe(true);
    deadline.dispose();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('成功请求释放资源后，不再响应父取消或超时', () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deadline = requestDeadline(parent.signal, 100);
    deadline.dispose();
    parent.abort();
    vi.advanceTimersByTime(100);
    expect(deadline.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('旧 Safari 媒体查询订阅', () => {
  it.each([true, false])('支持新旧两套监听并正确退订（新版=%s）', (modern) => {
    const add = vi.fn();
    const remove = vi.fn();
    const query = (modern ? { addEventListener: add, removeEventListener: remove }
      : { addListener: add, removeListener: remove }) as unknown as MediaQueryList;
    const change = vi.fn();
    const dispose = observeMediaQuery(query, change);
    expect(add).toHaveBeenCalledWith(...(modern ? ['change', change] : [change]));
    dispose();
    expect(remove).toHaveBeenCalledWith(...(modern ? ['change', change] : [change]));
  });
});
