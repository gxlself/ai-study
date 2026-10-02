import type { InputMode, NavKey } from '../../../../packages/plugin-sdk/src/types';

export type Direction = Extract<NavKey, 'up' | 'down' | 'left' | 'right'>;

export interface ScopeOptions {
  onKey?: (key: NavKey) => boolean;
  onBack?: () => void;
}

export interface NavigationRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const KEY_NAMES: Readonly<Record<string, NavKey>> = {
  ArrowUp: 'up', Up: 'up', ArrowDown: 'down', Down: 'down',
  ArrowLeft: 'left', Left: 'left', ArrowRight: 'right', Right: 'right',
  Enter: 'ok', NumpadEnter: 'ok', ' ': 'ok', Space: 'ok', Spacebar: 'ok',
  Escape: 'back', Esc: 'back', Backspace: 'back', GoBack: 'back', BrowserBack: 'back',
};

const KEY_CODES: Readonly<Record<number, NavKey>> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  19: 'up', 20: 'down', 21: 'left', 22: 'right',
  13: 'ok', 23: 'ok', 32: 'ok', 66: 'ok',
  4: 'back', 8: 'back', 27: 'back',
};

export function normalizeNavKey(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'keyCode'>,
): NavKey | undefined {
  return KEY_NAMES[event.key] ?? KEY_NAMES[event.code] ?? KEY_CODES[event.keyCode];
}

function center(rect: NavigationRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** 仅考虑目标方向的半平面；同分保留 DOM 顺序。 */
export function spatialScore(
  origin: NavigationRect,
  candidate: NavigationRect,
  direction: Direction,
): number {
  const from = center(origin);
  const to = center(candidate);
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const primary = (horizontal ? to.x - from.x : to.y - from.y) * sign;
  const secondary = Math.abs(horizontal ? to.y - from.y : to.x - from.x);
  return primary > 0 ? primary + 2 * secondary : Infinity;
}

export function findSpatialTarget<T extends { getBoundingClientRect(): NavigationRect }>(
  current: T,
  candidates: readonly T[],
  direction: Direction,
): T | null {
  const origin = current.getBoundingClientRect();
  let best: T | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (candidate === current) continue;
    const score = spatialScore(origin, candidate.getBoundingClientRect(), direction);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

interface Scope {
  element: HTMLElement;
  options: ScopeOptions;
  focused: HTMLElement | null;
  lastRect: NavigationRect | null;
}

export class NavigationManager {
  private readonly scopes: Scope[] = [];
  private readonly modeListeners = new Set<(mode: InputMode) => void>();
  private mode: InputMode = 'dpad';
  private focused: HTMLElement | null = null;
  private candidates: HTMLElement[] = [];
  private observer: MutationObserver | null = null;
  private users = 0;
  private cursorStyle: HTMLStyleElement | null = null;
  private previousModeAttribute: string | null = null;

  readonly input: { readonly mode: InputMode; onChange(cb: (mode: InputMode) => void): () => void };

  constructor(private readonly doc: Document = document) {
    const manager = this;
    this.input = {
      get mode() { return manager.mode; },
      onChange(cb) {
        manager.modeListeners.add(cb);
        return () => { manager.modeListeners.delete(cb); };
      },
    };
  }

  start(): () => void {
    this.users += 1;
    if (this.users === 1) {
      this.doc.addEventListener('keydown', this.onKeyDown);
      this.doc.addEventListener('pointerdown', this.onPointerDown, true);
      this.doc.addEventListener('focusin', this.onFocusIn);
      this.doc.defaultView?.addEventListener('resize', this.refresh);
      const Observer = this.doc.defaultView?.MutationObserver;
      if (Observer) {
        this.observer = new Observer(() => this.refresh());
        this.observer.observe(this.doc.documentElement, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            'data-focusable', 'disabled', 'aria-disabled', 'aria-hidden',
            'hidden', 'inert', 'style', 'class', 'open', 'tabindex',
          ],
        });
      }
      this.previousModeAttribute = this.doc.documentElement.getAttribute('data-sprout-input');
      this.cursorStyle = this.doc.createElement('style');
      this.cursorStyle.textContent =
        '[data-sprout-input="dpad"],[data-sprout-input="dpad"] *{cursor:none!important}';
      (this.doc.head ?? this.doc.documentElement).append(this.cursorStyle);
      this.updateModeAttribute();
      this.refresh();
    }
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.users -= 1;
      if (this.users !== 0) return;
      this.doc.removeEventListener('keydown', this.onKeyDown);
      this.doc.removeEventListener('pointerdown', this.onPointerDown, true);
      this.doc.removeEventListener('focusin', this.onFocusIn);
      this.doc.defaultView?.removeEventListener('resize', this.refresh);
      this.observer?.disconnect();
      this.observer = null;
      this.cursorStyle?.remove();
      this.cursorStyle = null;
      if (this.previousModeAttribute === null) {
        this.doc.documentElement.removeAttribute('data-sprout-input');
      } else {
        this.doc.documentElement.setAttribute('data-sprout-input', this.previousModeAttribute);
      }
      this.focused?.classList.remove('sp-focused');
    };
  }

  pushScope(element: HTMLElement, options: ScopeOptions = {}): () => void {
    const scope: Scope = { element, options, focused: null, lastRect: null };
    // React 子组件先提交 layout effect，父作用域不能覆盖已挂载的活动。
    const descendant = this.scopes.findIndex((existing) => element !== existing.element && element.contains(existing.element));
    if (descendant >= 0) this.scopes.splice(descendant, 0, scope);
    else this.scopes.push(scope);
    this.refresh();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const index = this.scopes.indexOf(scope);
      if (index === -1) return;
      this.scopes.splice(index, 1);
      this.refresh();
    };
  }

  refresh = (): void => {
    for (let i = this.scopes.length - 1; i >= 0; i -= 1) {
      if (!this.scopes[i].element.isConnected) this.scopes.splice(i, 1);
    }
    const scope = this.top();
    this.candidates = scope ? this.collect(scope) : [];
    if (!scope) {
      this.setFocused(null);
      return;
    }
    let next = scope.focused;
    if (!next || !this.candidates.includes(next)) {
      const active = this.doc.activeElement as HTMLElement | null;
      next = active && this.candidates.includes(active) ? active : this.nearest(scope.lastRect);
    }
    this.setFocused(next);
  };

  focus = (element: HTMLElement | null): void => {
    const scope = this.top();
    if (element && (!scope || !this.eligible(element, scope))) return;
    this.setFocused(element);
  };

  current = (): HTMLElement | null => {
    const scope = this.top();
    return this.focused && scope && this.eligible(this.focused, scope) ? this.focused : null;
  };

  /** 原生返回键等外部输入也走同一分发路径，不依赖 Capacitor。 */
  dispatch(key: NavKey): boolean {
    this.setMode('dpad');
    this.refresh();
    const scope = this.top();
    if (!scope) return false;
    if (scope.options.onKey?.(key)) return true;
    if (key === 'back') {
      // 活动可只提供 onKey，返回处理沿作用域栈交给页面。
      const handler = [...this.scopes].reverse().find((item) => item.options.onBack)?.options.onBack;
      if (!handler) return false;
      handler();
      return true;
    }
    this.refresh();
    if (key === 'ok') {
      const current = this.current();
      if (!current) return false;
      current.click();
      return true;
    }
    if (this.focused) {
      const next = findSpatialTarget(this.focused, this.candidates, key);
      if (next) this.setFocused(next);
    }
    return true;
  }

  private top(): Scope | undefined {
    return this.scopes[this.scopes.length - 1];
  }

  private collect(scope: Scope): HTMLElement[] {
    const elements = Array.from(scope.element.querySelectorAll<HTMLElement>('[data-focusable]'));
    if (scope.element.matches('[data-focusable]')) elements.unshift(scope.element);
    return elements.filter((element) => this.eligible(element, scope));
  }

  private eligible(element: HTMLElement, scope: Scope): boolean {
    if (!element.isConnected || !scope.element.contains(element) ||
        !element.matches('[data-focusable]') || element.dataset.focusable === 'false' ||
        element.hasAttribute('disabled') || element.matches(':disabled')) return false;
    if (element.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = this.doc.defaultView?.getComputedStyle(ancestor);
      if (style && (style.display === 'none' || style.visibility === 'hidden' ||
          style.visibility === 'collapse' || style.opacity === '0' ||
          style.contentVisibility === 'hidden')) return false;
    }
    return true;
  }

  private nearest(rect: NavigationRect | null): HTMLElement | null {
    if (!rect) return this.candidates[0] ?? null;
    const origin = center(rect);
    let result: HTMLElement | null = null;
    let distance = Infinity;
    for (const candidate of this.candidates) {
      const point = center(candidate.getBoundingClientRect());
      const next = Math.abs(point.x - origin.x) + Math.abs(point.y - origin.y);
      if (next < distance) {
        distance = next;
        result = candidate;
      }
    }
    return result;
  }

  private setFocused(element: HTMLElement | null, native = true): void {
    const previous = this.focused;
    if (previous !== element) previous?.classList.remove('sp-focused');
    this.focused = element;
    const scope = this.top();
    if (scope) {
      scope.focused = element;
      if (element) scope.lastRect = element.getBoundingClientRect();
    }
    if (element) {
      const show = this.mode === 'dpad';
      if (element.classList.contains('sp-focused') !== show) {
        element.classList.toggle('sp-focused', show);
      }
      if (native && this.doc.activeElement !== element) {
        if (!element.hasAttribute('tabindex') &&
            !element.matches('button,input,select,textarea,a[href],[contenteditable]')) {
          element.tabIndex = -1;
        }
        element.focus({ preventScroll: true });
      }
      if (native && previous !== element) {
        element.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    } else if (previous && this.doc.activeElement === previous) {
      previous.blur();
    }
  }

  private setMode(mode: InputMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.updateModeAttribute();
    if (this.focused) this.setFocused(this.focused, false);
    for (const listener of this.modeListeners) listener(mode);
  }

  private updateModeAttribute(): void {
    if (this.users > 0) this.doc.documentElement.setAttribute('data-sprout-input', this.mode);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Tab') {
      const scope = this.top();
      if (!scope) return;
      event.preventDefault();
      this.setMode('dpad');
      this.refresh();
      const index = this.candidates.indexOf(this.doc.activeElement as HTMLElement);
      const count = this.candidates.length;
      if (count) {
        const next = index < 0 ? (event.shiftKey ? count - 1 : 0) :
          (index + (event.shiftKey ? -1 : 1) + count) % count;
        this.setFocused(this.candidates[next]);
      } else {
        this.focusScope(scope);
      }
      return;
    }
    const key = normalizeNavKey(event);
    if (!key) return;
    this.setMode('dpad');
    const target = event.composedPath()[0] as HTMLElement | undefined;
    if (target?.closest && this.top()?.element.contains(target)) {
      const editable = target.closest<HTMLElement>(
        'input:not([type="button"]):not([type="submit"]):not([type="reset"]),' +
        'textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
      );
      const backspace = event.key === 'Backspace' || event.code === 'Backspace' || event.keyCode === 8;
      if (editable) {
        if (editable.tagName === 'SELECT' && (key === 'left' || key === 'right')) {
          event.preventDefault();
          this.changeSelection(editable as HTMLSelectElement, key === 'left' ? -1 : 1);
          return;
        }
        if (key === 'left' || key === 'right') return;
        const inputType = editable.tagName === 'INPUT' ? (editable as HTMLInputElement).type : '';
        const textual = editable.tagName !== 'SELECT' &&
          !['range', 'checkbox', 'radio', 'color', 'file'].includes(inputType);
        const space = event.key === ' ' || event.code === 'Space' || event.keyCode === 32;
        const multiline = editable.tagName === 'TEXTAREA' ||
          editable.matches('[contenteditable]:not([contenteditable="false"])');
        if ((textual && backspace) ||
            (space && editable.tagName !== 'SELECT' && inputType !== 'range') ||
            (multiline && (event.key === 'Enter' || event.code === 'NumpadEnter'))) return;
      }
    }
    if (event.repeat && (key === 'ok' || key === 'back')) {
      event.preventDefault();
      return;
    }
    if (this.dispatch(key)) event.preventDefault();
  };

  private changeSelection(select: HTMLSelectElement, direction: -1 | 1): void {
    if (select.disabled) return;
    const options = Array.from(select.options);
    for (let index = select.selectedIndex + direction; index >= 0 && index < options.length; index += direction) {
      const option = options[index];
      if (option.disabled || option.hidden || option.parentElement?.matches('optgroup:disabled')) continue;
      select.selectedIndex = index;
      const EventConstructor = this.doc.defaultView?.Event ?? Event;
      select.dispatchEvent(new EventConstructor('input', { bubbles: true }));
      select.dispatchEvent(new EventConstructor('change', { bubbles: true }));
      return;
    }
  }

  private focusScope(scope: Scope): void {
    if (!scope.element.hasAttribute('tabindex')) scope.element.tabIndex = -1;
    scope.element.focus({ preventScroll: true });
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.setMode(event.pointerType === 'touch' ? 'touch' : 'pointer');
    const target = event.composedPath()[0] as HTMLElement | undefined;
    const element = target?.closest?.<HTMLElement>('[data-focusable]');
    const scope = this.top();
    if (element && scope && this.eligible(element, scope)) this.setFocused(element, false);
  };

  private onFocusIn = (event: FocusEvent): void => {
    const target = event.target as HTMLElement | null;
    const scope = this.top();
    if (!target || !scope) return;
    if (!scope.element.contains(target)) {
      if (this.current()) this.focused?.focus({ preventScroll: true });
      else this.focusScope(scope);
      return;
    }
    const element = target.closest<HTMLElement>('[data-focusable]');
    if (element && this.eligible(element, scope)) this.setFocused(element, false);
  };
}
