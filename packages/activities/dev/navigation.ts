import type { ActivityContext, ActivityInstance, NavKey } from '@sprout/plugin-sdk';

const keyMap: Record<string, NavKey> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', Escape: 'back',
};

export function navKeyForEvent(event: KeyboardEvent): NavKey | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, select, textarea, [contenteditable="true"], [data-playground-controls]')) return;
  return keyMap[event.key];
}

export function createStageFocus(root: HTMLElement): ActivityContext['focus'] & {
  move(key: Exclude<NavKey, 'ok' | 'back'>): void;
  clear(): void;
} {
  let selected: HTMLElement | null = null;
  function candidates() {
    return [...root.querySelectorAll<HTMLElement>('[data-focusable]')].filter((element) => {
      const style = getComputedStyle(element);
      return !element.matches(':disabled, [aria-disabled="true"]')
        && !element.closest('[hidden], [aria-hidden="true"]')
        && style.display !== 'none' && style.visibility !== 'hidden';
    });
  }
  function mark(element: HTMLElement | null, native = false) {
    selected?.classList.remove('sp-focused');
    selected = element;
    selected?.classList.add('sp-focused');
    if (selected && !selected.hasAttribute('tabindex')) selected.tabIndex = 0;
    if (native) selected?.focus({ preventScroll: true });
  }
  function refresh() {
    const elements = candidates();
    if (!selected || !elements.includes(selected)) mark(elements[0] ?? null);
  }
  return {
    refresh,
    focus(element) {
      if (element === null || candidates().includes(element)) mark(element, true);
    },
    current() { refresh(); return selected; },
    clear() { mark(null); },
    move(key) {
      refresh();
      if (!selected) return;
      const elements = candidates();
      const from = selected.getBoundingClientRect();
      const horizontal = key === 'left' || key === 'right';
      const direction = key === 'left' || key === 'up' ? -1 : 1;
      let nearest: HTMLElement | undefined;
      let best = Infinity;
      for (const element of elements) {
        if (element === selected) continue;
        const to = element.getBoundingClientRect();
        const dx = to.left + to.width / 2 - from.left - from.width / 2;
        const dy = to.top + to.height / 2 - from.top - from.height / 2;
        const along = (horizontal ? dx : dy) * direction;
        const cross = Math.abs(horizontal ? dy : dx);
        const score = along + cross * 2;
        if (along > 1 && score < best) { nearest = element; best = score; }
      }
      // jsdom 或尚未布局的容器没有几何信息，按 DOM 顺序降级。
      if (!nearest && elements.every((element) => element.getBoundingClientRect().width === 0)) {
        const index = elements.indexOf(selected);
        nearest = elements[Math.max(0, Math.min(elements.length - 1, index + direction))];
      }
      if (nearest) mark(nearest, true);
    },
  };
}

export function dispatchNavigation(
  instance: ActivityInstance,
  focus: ReturnType<typeof createStageFocus>,
  key: NavKey,
): boolean {
  if (instance.onKey?.(key)) return true;
  if (key === 'back') return false;
  if (key === 'ok') focus.current()?.click();
  else focus.move(key);
  return true;
}
