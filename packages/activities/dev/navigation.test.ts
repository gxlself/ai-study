import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStageFocus, dispatchNavigation, navKeyForEvent } from './navigation';

afterEach(() => document.body.replaceChildren());

function stage() {
  const root = document.createElement('div');
  root.innerHTML = '<button data-focusable>A</button><button data-focusable disabled>B</button><button data-focusable>C</button>';
  document.body.append(root);
  return { root, focus: createStageFocus(root), buttons: [...root.querySelectorAll('button')] };
}

describe('遥控器与空间焦点', () => {
  it('映射按键，忽略组合键和表单内的事件', () => {
    expect(navKeyForEvent(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe('ok');
    expect(navKeyForEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe('back');
    expect(navKeyForEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe('right');
    expect(navKeyForEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true }))).toBeUndefined();
    const input = document.createElement('select');
    input.addEventListener('keydown', (event) => expect(navKeyForEvent(event)).toBeUndefined());
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const toolbar = document.createElement('div');
    toolbar.dataset.playgroundControls = '';
    const button = document.createElement('button');
    toolbar.append(button);
    button.addEventListener('keydown', (event) => expect(navKeyForEvent(event)).toBeUndefined());
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });

  it('只选择本容器可用目标，DOM 更新后重新定位', () => {
    const { focus, buttons } = stage();
    focus.refresh();
    expect(focus.current()).toBe(buttons[0]);
    expect(buttons[0].classList.contains('sp-focused')).toBe(true);
    focus.move('right');
    expect(focus.current()).toBe(buttons[2]);
    buttons[2].remove();
    focus.refresh();
    expect(focus.current()).toBe(buttons[0]);
    focus.clear();
    expect(buttons[0].classList.contains('sp-focused')).toBe(false);
  });

  it('有布局时按方向和距离找目标，不依赖 DOM 顺序', () => {
    const { focus, buttons } = stage();
    const rect = (x: number): DOMRect => ({
      x, y: 0, left: x, right: x + 40, top: 0, bottom: 40, width: 40, height: 40, toJSON: () => ({}),
    });
    vi.spyOn(buttons[0], 'getBoundingClientRect').mockReturnValue(rect(100));
    vi.spyOn(buttons[2], 'getBoundingClientRect').mockReturnValue(rect(10));
    focus.refresh();
    focus.move('left');
    expect(focus.current()).toBe(buttons[2]);
  });

  it('插件已处理时不双击，未处理时宿主导航/点击，返回不消费', () => {
    const { focus, buttons } = stage();
    const click = vi.fn();
    buttons[0].addEventListener('click', click);
    const instance = { unmount: vi.fn(), onKey: vi.fn(() => true) };
    expect(dispatchNavigation(instance, focus, 'ok')).toBe(true);
    expect(click).not.toHaveBeenCalled();
    instance.onKey.mockReturnValue(false);
    dispatchNavigation(instance, focus, 'ok');
    expect(click).toHaveBeenCalledTimes(1);
    expect(dispatchNavigation(instance, focus, 'back')).toBe(false);
  });
});
