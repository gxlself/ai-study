// @vitest-environment node
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingArea, scrollReadingArea } from './ReadingArea';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('家长阅读区', () => {
  let container: HTMLDivElement;
  let root: Root;
  const areaRef = createRef<HTMLDivElement>();
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });
  async function mount() {
    await act(async () => root.render(<ReadingArea areaRef={areaRef} label="陪玩步骤"><p>和宝宝一起玩。</p></ReadingArea>));
    return areaRef.current!;
  }
  async function resize(area: HTMLElement, height: number, content: number) {
    Object.defineProperties(area, {
      clientHeight: { configurable: true, value: height },
      scrollHeight: { configurable: true, value: content },
    });
    await act(async () => window.dispatchEvent(new Event('resize')));
  }
  it('只有可滚动区域参与焦点导航，滚到底部隐藏提示，尺寸改变后重新测量', async () => {
    const area = await mount();
    expect(area.hasAttribute('data-focusable')).toBe(false);
    expect(container.querySelector('.spa-reading-more[hidden]')).not.toBeNull();
    await resize(area, 100, 350);
    expect(area.getAttribute('data-focusable')).toBe('true');
    expect(area.tabIndex).toBe(0);
    expect(container.querySelector('.spa-reading-more:not([hidden])')?.textContent).toBe('↓ 还有内容');
    area.scrollTop = 250;
    await act(async () => area.dispatchEvent(new Event('scroll')));
    expect(container.querySelector('.spa-reading-more[hidden]')).not.toBeNull();
    expect(area.hasAttribute('data-focusable')).toBe(true);
    area.scrollTop = 0;
    await resize(area, 400, 350);
    expect(area.hasAttribute('data-focusable')).toBe(false);
    expect(area.hasAttribute('tabindex')).toBe(false);
  });
  it('上下键平滑滚动并限制在内容边界，减少动画时即时滚动', async () => {
    const area = await mount();
    await resize(area, 200, 500);
    const scrollTo = vi.fn();
    Object.defineProperty(area, 'scrollTo', { configurable: true, value: scrollTo });
    expect(scrollReadingArea(area, 'down')).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 130, behavior: 'smooth' });
    area.scrollTop = 270;
    scrollReadingArea(area, 'down', true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: 'auto' });
    area.scrollTop = 10;
    scrollReadingArea(area, 'up');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
    await resize(area, 500, 500);
    expect(scrollReadingArea(area, 'down')).toBe(false);
    expect(scrollReadingArea(null, 'up')).toBe(false);
  });
  it('缺少 scrollTo 时仍可滚动，卸载移除尺寸监听', async () => {
    const area = await mount();
    await resize(area, 100, 300);
    Object.defineProperty(area, 'scrollTo', { configurable: true, value: undefined });
    scrollReadingArea(area, 'down');
    expect(area.scrollTop).toBe(80);
    const remove = vi.spyOn(window, 'removeEventListener');
    await act(async () => root.unmount());
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
