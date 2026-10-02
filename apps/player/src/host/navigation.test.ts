// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findSpatialTarget, NavigationManager, normalizeNavKey, spatialScore } from './navigation';
import type { NavKey } from '../../../../packages/plugin-sdk/src/types';

function rect(left: number, top: number, width = 40, height = 40): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} };
}

function control<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement, tag: K, x: number, y: number,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.setAttribute('data-focusable', '');
  vi.spyOn(element as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(x, y));
  element.scrollIntoView = vi.fn();
  parent.append(element);
  return element;
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('spatial navigation', () => {
  it('uses primary distance + twice the secondary offset, not Euclidean distance', () => {
    const origin = { getBoundingClientRect: () => rect(0, 0) };
    const diagonal = { getBoundingClientRect: () => rect(50, 30) };
    const aligned = { getBoundingClientRect: () => rect(100, 0) };
    expect(spatialScore(rect(0, 0), rect(50, 30), 'right')).toBe(110);
    expect(findSpatialTarget(origin, [origin, diagonal, aligned], 'right')).toBe(aligned);
  });

  it.each([
    ['left', -80, 0], ['right', 80, 0], ['up', 0, -80], ['down', 0, 80],
  ] as const)('only searches the %s half-plane', (direction, x, y) => {
    expect(spatialScore(rect(0, 0), rect(x, y), direction)).toBe(80);
    expect(spatialScore(rect(0, 0), rect(-x, -y), direction)).toBe(Infinity);
    expect(spatialScore(rect(0, 0), rect(0, 0), direction)).toBe(Infinity);
  });

  it('uses DOM order to break ties and does not wrap at an edge', () => {
    const origin = { getBoundingClientRect: () => rect(0, 0) };
    const first = { getBoundingClientRect: () => rect(80, -20) };
    const second = { getBoundingClientRect: () => rect(80, 20) };
    expect(findSpatialTarget(origin, [second, first], 'right')).toBe(second);
    expect(findSpatialTarget(origin, [first, second], 'left')).toBeNull();
  });
});

describe('key mapping', () => {
  const named: [string, NavKey][] = [
    ['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'],
    ['Up', 'up'], ['Down', 'down'], ['Left', 'left'], ['Right', 'right'],
    ['Enter', 'ok'], ['NumpadEnter', 'ok'], [' ', 'ok'], ['Spacebar', 'ok'], ['Space', 'ok'],
    ['Escape', 'back'], ['Esc', 'back'], ['Backspace', 'back'], ['GoBack', 'back'], ['BrowserBack', 'back'],
  ];
  it.each(named)('%s maps to %s', (key, expected) => {
    expect(normalizeNavKey({ key, code: '', keyCode: 0 })).toBe(expected);
  });
  it.each([
    [19, 'up'], [20, 'down'], [21, 'left'], [22, 'right'],
    [37, 'left'], [38, 'up'], [39, 'right'], [40, 'down'],
    [13, 'ok'], [23, 'ok'], [32, 'ok'], [66, 'ok'], [4, 'back'], [8, 'back'], [27, 'back'],
  ] as const)('legacy keyCode %d maps to %s', (keyCode, expected) => {
    expect(normalizeNavKey({ key: 'Unidentified', code: '', keyCode })).toBe(expected);
  });
  it('uses code as a fallback and ignores unrelated keys', () => {
    expect(normalizeNavKey({ key: '', code: 'NumpadEnter', keyCode: 0 })).toBe('ok');
    expect(normalizeNavKey({ key: 'a', code: 'KeyA', keyCode: 65 })).toBeUndefined();
  });
});

describe('NavigationManager', () => {
  let manager: NavigationManager;
  let page: HTMLElement;
  let stop: () => void;

  beforeEach(() => {
    document.body.replaceChildren();
    page = document.createElement('section');
    document.body.append(page);
    manager = new NavigationManager(document);
    stop = manager.start();
  });

  afterEach(() => {
    stop();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('keeps navigation within the top scope and restores the previous focus', () => {
    const first = control(page, 'button', 0, 0);
    const second = control(page, 'button', 100, 0);
    const onBack = vi.fn();
    manager.pushScope(page, { onBack });
    manager.dispatch('right');
    expect(manager.current()).toBe(second);
    const dialog = document.createElement('div');
    page.append(dialog);
    const dialogButton = control(dialog, 'button', 40, 50);
    const pop = manager.pushScope(dialog);
    expect(manager.current()).toBe(dialogButton);
    manager.dispatch('left');
    expect(manager.current()).toBe(dialogButton);
    manager.dispatch('back');
    expect(onBack).toHaveBeenCalledOnce();
    pop();
    pop();
    expect(manager.current()).toBe(second);
    expect(second.classList.contains('sp-focused')).toBe(true);
    expect(first.classList.contains('sp-focused')).toBe(false);
    expect(dialogButton.classList.contains('sp-focused')).toBe(false);
  });

  it('keeps a child-first mounted activity above its parent page', () => {
    control(page, 'button', 0, 0);
    const stage = document.createElement('div');
    page.append(stage);
    const button = control(stage, 'button', 100, 100);
    const key = vi.fn().mockReturnValue(true);
    const back = vi.fn();
    manager.pushScope(stage, { onKey: (value) => value !== 'back' && key(value) });
    manager.pushScope(page, { onBack: back });
    expect(manager.current()).toBe(button);
    manager.dispatch('ok');
    expect(key).toHaveBeenCalledWith('ok');
    manager.dispatch('back');
    expect(back).toHaveBeenCalledOnce();
  });

  it('gives onKey first refusal, including OK and back', () => {
    const button = control(page, 'button', 0, 0);
    const click = vi.fn();
    button.onclick = click;
    const onKey = vi.fn<(key: NavKey) => boolean>().mockReturnValue(true);
    const onBack = vi.fn();
    manager.pushScope(page, { onKey, onBack });
    expect(manager.dispatch('ok')).toBe(true);
    manager.dispatch('back');
    expect(click).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    onKey.mockReturnValue(false);
    manager.dispatch('ok');
    manager.dispatch('back');
    expect(click).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('filters zero-sized, hidden, inert, disabled and aria-disabled elements', () => {
    const hidden = control(page, 'button', 0, 0);
    hidden.hidden = true;
    const disabled = control(page, 'button', 10, 0);
    disabled.disabled = true;
    const aria = control(page, 'button', 20, 0);
    aria.setAttribute('aria-disabled', 'true');
    const transparent = control(page, 'button', 30, 0);
    transparent.style.opacity = '0';
    const zero = control(page, 'button', 40, 0);
    vi.mocked(zero.getBoundingClientRect).mockReturnValue(rect(40, 0, 0, 0));
    const collapsed = document.createElement('div');
    collapsed.style.display = 'none';
    page.append(collapsed);
    control(collapsed, 'button', 50, 0);
    const inert = document.createElement('div');
    inert.setAttribute('inert', '');
    page.append(inert);
    control(inert, 'button', 60, 0);
    const fieldset = document.createElement('fieldset');
    fieldset.disabled = true;
    page.append(fieldset);
    control(fieldset, 'button', 70, 0);
    const optedOut = control(page, 'button', 80, 0);
    optedOut.dataset.focusable = 'false';
    const visible = control(page, 'button', 100, 0);
    manager.pushScope(page);
    expect(manager.current()).toBe(visible);
    manager.dispatch('left');
    expect(manager.current()).toBe(visible);
    manager.focus(disabled);
    expect(manager.current()).toBe(visible);
  });

  it('recovers when focused elements are disabled, replaced, or their scope is removed', async () => {
    const first = control(page, 'button', 0, 0);
    const second = control(page, 'button', 100, 0);
    manager.pushScope(page);
    first.disabled = true;
    await vi.waitFor(() => expect(manager.current()).toBe(second));
    second.remove();
    const replacement = control(page, 'button', 100, 0);
    await vi.waitFor(() => expect(manager.current()).toBe(replacement));
    const dialog = document.createElement('section');
    document.body.append(dialog);
    control(dialog, 'button', 0, 0);
    manager.pushScope(dialog);
    dialog.remove();
    await vi.waitFor(() => expect(manager.current()).toBe(replacement));
  });

  it('supports removing a lower scope without disturbing a modal', () => {
    control(page, 'button', 0, 0);
    const removePage = manager.pushScope(page);
    const modal = document.createElement('section');
    document.body.append(modal);
    const button = control(modal, 'button', 0, 0);
    const removeModal = manager.pushScope(modal);
    removePage();
    expect(manager.current()).toBe(button);
    removeModal();
    expect(manager.current()).toBeNull();
  });

  it('switches pointer/touch/dpad mode and supports unsubscribing', () => {
    const button = control(page, 'button', 0, 0);
    manager.pushScope(page);
    const changed = vi.fn();
    const unsubscribe = manager.input.onChange(changed);
    for (const pointerType of ['mouse', 'touch']) {
      const event = new Event('pointerdown', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      button.dispatchEvent(event);
    }
    expect(manager.input.mode).toBe('touch');
    expect(button.classList.contains('sp-focused')).toBe(false);
    press(button, 'ArrowRight');
    expect(manager.input.mode).toBe('dpad');
    expect(document.documentElement.dataset.sproutInput).toBe('dpad');
    expect(changed.mock.calls.flat()).toEqual(['pointer', 'touch', 'dpad']);
    unsubscribe();
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it.each(['text', 'number', 'range'] as const)('%s input edits horizontally and exits vertically', (type) => {
    const above = control(page, 'button', 0, 0);
    const input = control(page, 'input', 0, 80);
    input.type = type;
    const below = control(page, 'button', 0, 160);
    const onBack = vi.fn();
    manager.pushScope(page, { onBack });
    manager.focus(input);
    expect(press(input, 'ArrowLeft').defaultPrevented).toBe(false);
    expect(press(input, 'ArrowRight').defaultPrevented).toBe(false);
    expect(manager.current()).toBe(input);
    if (type !== 'range') {
      expect(press(input, 'Backspace').defaultPrevented).toBe(false);
      expect(onBack).not.toHaveBeenCalled();
      expect(press(input, ' ').defaultPrevented).toBe(false);
    }
    expect(press(input, 'ArrowDown').defaultPrevented).toBe(true);
    expect(manager.current()).toBe(below);
    manager.focus(input);
    press(input, 'ArrowUp');
    expect(manager.current()).toBe(above);
    manager.focus(input);
    for (const key of ['Escape', 'GoBack']) press(input, key);
    manager.dispatch('back');
    expect(onBack).toHaveBeenCalledTimes(3);
  });

  it('changes select options horizontally, skips disabled options and exits vertically', () => {
    control(page, 'button', 0, 0);
    const select = control(page, 'select', 0, 80);
    select.innerHTML = '<option value="a">A</option><option disabled>B</option><option value="c">C</option>';
    const below = control(page, 'button', 0, 160);
    const change = vi.fn();
    select.addEventListener('change', change);
    manager.pushScope(page);
    manager.focus(select);
    expect(press(select, 'ArrowRight').defaultPrevented).toBe(true);
    expect(select.value).toBe('c');
    expect(change).toHaveBeenCalledOnce();
    press(select, 'ArrowLeft');
    expect(select.value).toBe('a');
    press(select, 'ArrowDown');
    expect(manager.current()).toBe(below);
  });

  it('traps Tab and Shift+Tab within the active modal, including empty scopes', () => {
    const background = control(page, 'button', 0, 0);
    manager.pushScope(page);
    const modal = document.createElement('div');
    page.append(modal);
    const first = control(modal, 'button', 0, 80);
    const last = control(modal, 'button', 100, 80);
    manager.pushScope(modal);
    expect(press(first, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    press(last, 'Tab');
    expect(document.activeElement).toBe(first);
    background.focus();
    expect(document.activeElement).toBe(first);
    first.remove();
    last.remove();
    expect(press(modal, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(modal);
  });

  it('scrolls only newly focused elements into view, not every refresh', () => {
    const first = control(page, 'button', 0, 0);
    const second = control(page, 'button', 100, 0);
    manager.pushScope(page);
    expect(first.scrollIntoView).toHaveBeenCalledOnce();
    manager.refresh();
    manager.refresh();
    manager.focus(first);
    expect(first.scrollIntoView).toHaveBeenCalledOnce();
    manager.dispatch('right');
    expect(second.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: 'nearest', inline: 'nearest', behavior: 'instant',
    });
    manager.refresh();
    expect(second.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('deduplicates start, handles repeat safely and cleans up document listeners', () => {
    const button = control(page, 'button', 0, 0);
    const onKey = vi.fn(() => true);
    manager.pushScope(page, { onKey });
    const stopAgain = manager.start();
    press(button, 'Enter');
    press(button, 'Enter', { repeat: true });
    press(button, 'ArrowRight', { ctrlKey: true });
    press(button, 'ArrowRight', { isComposing: true });
    expect(onKey).toHaveBeenCalledTimes(1);
    stop();
    press(button, 'Enter');
    expect(onKey).toHaveBeenCalledTimes(2);
    stopAgain();
    stopAgain();
    press(button, 'Enter');
    expect(onKey).toHaveBeenCalledTimes(2);
    expect(document.documentElement.hasAttribute('data-sprout-input')).toBe(false);
    expect(button.classList.contains('sp-focused')).toBe(false);
  });
});
