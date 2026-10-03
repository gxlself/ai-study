// @vitest-environment node
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChooseProps, PatternProps, SortProps, SubitizeProps } from '@sprout/schema';
import { createMockContext, type ActivityInstance, type ActivityPlugin, type NavKey } from '@sprout/plugin-sdk';
import { chooseActivity } from './activities/choose';
import { patternActivity } from './activities/pattern';
import { sortActivity } from './activities/sort';
import { subitizeActivity } from './activities/subitize';
import { createStageFocus } from '../dev/navigation';
import { concepts } from '../dev/samples';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: { instance: ActivityInstance; root: HTMLElement }[] = [];

async function mount<P>(plugin: ActivityPlugin<P>, props: P, readyMs = 0) {
  const root = document.createElement('div');
  document.body.append(root);
  const ctx = createMockContext(props, {
    concepts, focus: createStageFocus(root), reducedMotion: true,
    speak: vi.fn(async () => {}), log: vi.fn(),
  });
  let instance!: ActivityInstance;
  await act(async () => { instance = await plugin.mount(root, ctx); });
  mounted.push({ instance, root });
  if (readyMs) await tick(readyMs);
  return { ctx, root, instance };
}

async function key(instance: ActivityInstance, value: NavKey) {
  let handled: boolean | undefined;
  await act(async () => { handled = instance.onKey?.(value); });
  return handled;
}

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function options(root: HTMLElement, selector: string) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>(`${selector} > button`)];
  expect(buttons).toHaveLength(3);
  return buttons;
}

const bins = ['apple', 'ball', 'star'].map((id) => ({ id, label: { zh: id }, concept: id }));
const activities = [
  {
    name: 'choose', selector: '.spa-choose-options', indexAttribute: 'data-round-index',
    mount: () => mount(chooseActivity, ChooseProps.parse({ rounds: [
      { prompt: { zh: 'Find the ball' }, options: ['apple', 'ball', 'star'], answer: 'ball' },
    ] })),
    correct: { type: 'choose:correct', data: { round: 0, option: 'ball', firstTry: true } },
  },
  {
    name: 'pattern', selector: '.spa-pattern-options', indexAttribute: 'data-round-index',
    mount: () => mount(patternActivity, PatternProps.parse({ rounds: [
      { sequence: ['apple', 'ball', 'apple'], options: ['apple', 'ball', 'star'], answer: 'ball' },
    ] })),
    correct: { type: 'pattern:correct', data: { round: 0, value: 'ball' } },
  },
  {
    name: 'subitize', selector: '.spa-subitize-choices', indexAttribute: 'data-round-index',
    mount: () => mount(subitizeActivity, SubitizeProps.parse({ rounds: [{ count: 3 }], showSec: 2 }), 2600),
    correct: { type: 'subitize:correct', data: { round: 0, answer: 3 } },
  },
  {
    name: 'sort', selector: '.spa-sort-bins', indexAttribute: 'data-item-index',
    mount: () => mount(sortActivity, SortProps.parse({
      prompt: { zh: 'Sort the objects' }, bins,
      items: [{ item: 'ball', bin: 'ball' }, { item: 'apple', bin: 'apple' }],
    })),
    correct: { type: 'sort:correct', data: { index: 0, bin: 'ball' } },
  },
];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
  await act(async () => {
    for (const { instance, root } of mounted.splice(0)) {
      instance.unmount();
      root.remove();
    }
  });
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('option navigation follows synchronous host focus', () => {
  it.each(activities)('$name keeps both rapid right moves in one act batch', async (activity) => {
    const { ctx, root, instance } = await activity.mount();
    const buttons = options(root, activity.selector);
    expect(root.querySelector(activity.selector)?.getAttribute(activity.indexAttribute)).toBe('0');
    expect(ctx.focus.current()).toBe(buttons[0]);

    await act(async () => {
      expect(instance.onKey?.('right')).toBe(true);
      expect(ctx.focus.current()).toBe(buttons[1]);
      expect(document.activeElement).toBe(buttons[1]);
      expect(instance.onKey?.('right')).toBe(true);
      expect(ctx.focus.current()).toBe(buttons[2]);
      expect(document.activeElement).toBe(buttons[2]);
      expect(buttons[2].classList.contains('sp-focused')).toBe(true);
    });

    expect(ctx.focus.current()).toBe(buttons[2]);
    expect(ctx.mock.logs.some((event) => event.type.endsWith(':correct') || event.type.endsWith(':retry'))).toBe(false);
  });

  it.each(activities)('$name wraps left and OK picks the new highlight before a render', async (activity) => {
    const { ctx, root, instance } = await activity.mount();
    const buttons = options(root, activity.selector);
    expect(ctx.focus.current()).toBe(buttons[0]);

    await act(async () => {
      expect(instance.onKey?.('left')).toBe(true);
      expect(ctx.focus.current()).toBe(buttons[2]);
      expect(instance.onKey?.('left')).toBe(true);
      expect(ctx.focus.current()).toBe(buttons[1]);
      expect(buttons[1].classList.contains('sp-focused')).toBe(true);
      expect(instance.onKey?.('ok')).toBe(true);
    });

    expect(ctx.mock.logs).toContainEqual(activity.correct);
    expect(ctx.mock.logs.some((event) => event.type.endsWith(':retry'))).toBe(false);
    expect(ctx.mock.completions).toHaveLength(0);
  });

  it.each(activities)('$name uses the state fallback only when host focus has no option', async (activity) => {
    const { ctx, root, instance } = await activity.mount();
    const buttons = options(root, activity.selector);
    await key(instance, 'right');
    expect(ctx.focus.current()).toBe(buttons[1]);

    vi.spyOn(ctx.focus, 'current').mockReturnValueOnce(null);
    await key(instance, 'right');

    expect(ctx.focus.current()).toBe(buttons[2]);
    expect(document.activeElement).toBe(buttons[2]);
  });

  it.each(activities)('$name leaves paused input and back handling unchanged', async (activity) => {
    const { ctx, root, instance } = await activity.mount();
    const buttons = options(root, activity.selector);
    const logs = [...ctx.mock.logs];
    expect(await key(instance, 'back')).toBe(false);
    await act(async () => { instance.pause?.(); });

    await act(async () => {
      expect(instance.onKey?.('right')).toBe(true);
      expect(instance.onKey?.('left')).toBe(true);
      expect(instance.onKey?.('ok')).toBe(true);
      expect(instance.onKey?.('back')).toBe(false);
    });

    expect(ctx.focus.current()).toBe(buttons[0]);
    expect(ctx.mock.logs).toEqual(logs);
    expect(ctx.mock.completions).toHaveLength(0);
    await act(async () => { instance.resume?.(); });
    expect(await key(instance, 'right')).toBe(true);
    expect(ctx.focus.current()).toBe(buttons[1]);
  });

  it('pattern OK follows a reused option key at its new round index', async () => {
    const { ctx, root, instance } = await mount(patternActivity, PatternProps.parse({ rounds: [
      { sequence: ['apple', 'ball', 'apple'], options: ['apple', 'ball', 'star'], answer: 'ball' },
      { sequence: ['star', 'ball', 'star'], options: ['ball', 'star', 'apple'], answer: 'ball' },
    ] }));
    const first = options(root, '.spa-pattern-options');
    await key(instance, 'right');
    expect(ctx.focus.current()).toBe(first[1]);
    await key(instance, 'ok');
    await tick(2200);
    expect(root.querySelector<HTMLButtonElement>('.spa-action')?.disabled).toBe(false);
    await key(instance, 'ok');

    const second = options(root, '.spa-pattern-options');
    expect(root.querySelector('.spa-pattern-options')?.getAttribute('data-round-index')).toBe('1');
    expect(second[0]).toBe(first[1]);
    expect(ctx.focus.current()).toBe(second[0]);
    expect(second[0].classList.contains('sp-focused')).toBe(true);
    await key(instance, 'ok');

    expect(ctx.mock.logs).toContainEqual({ type: 'pattern:correct', data: { round: 1, value: 'ball' } });
    expect(ctx.mock.logs.some((event) => event.type === 'pattern:retry')).toBe(false);
    await tick(2200);
    await key(instance, 'ok');
    expect(ctx.mock.completions).toEqual([{ data: { rounds: 2 } }]);
  });

  it('subitize follows highlighted choices after a round replaces its buttons', async () => {
    const { ctx, root, instance } = await mount(subitizeActivity, SubitizeProps.parse({
      rounds: [{ count: 1 }, { count: 3 }], showSec: 2,
    }), 2600);
    const first = options(root, '.spa-subitize-choices');
    await act(async () => {
      instance.onKey?.('right');
      instance.onKey?.('right');
    });
    expect(ctx.focus.current()).toBe(first[2]);
    ctx.focus.focus(first[0]);
    expect(ctx.focus.current()).toBe(first[0]);
    await key(instance, 'ok');
    expect(ctx.mock.logs).toContainEqual({ type: 'subitize:correct', data: { round: 0, answer: 1 } });
    await tick(1000);
    expect(root.querySelector<HTMLButtonElement>('.spa-action')?.disabled).toBe(false);
    await key(instance, 'ok');

    expect(root.querySelector('.spa-subitize-choices')?.getAttribute('data-round-index')).toBe('1');
    expect(root.querySelectorAll('.spa-number-choice')).toHaveLength(0);
    await tick(2600);
    const second = options(root, '.spa-subitize-choices');
    expect(second.map((button) => button.getAttribute('aria-label'))).toEqual(['2', '3', '4']);
    expect(ctx.focus.current()).toBe(second[0]);
    await act(async () => {
      expect(instance.onKey?.('right')).toBe(true);
      expect(ctx.focus.current()).toBe(second[1]);
      expect(second[1].classList.contains('sp-focused')).toBe(true);
      expect(instance.onKey?.('ok')).toBe(true);
    });

    expect(ctx.mock.logs).toContainEqual({ type: 'subitize:correct', data: { round: 1, answer: 3 } });
    expect(ctx.mock.logs.some((event) => event.type === 'subitize:retry')).toBe(false);
    await tick(2600);
    await key(instance, 'ok');
    expect(ctx.mock.completions).toEqual([{ data: { rounds: 2 } }]);
  });

  it('sort confirms rapid right moves and exposes the next item after the drop delay', async () => {
    const { ctx, root, instance } = await mount(sortActivity, SortProps.parse({
      prompt: { zh: 'Sort the objects' }, bins,
      items: [{ item: 'star', bin: 'star' }, { item: 'apple', bin: 'apple' }],
    }));
    const buttons = options(root, '.spa-sort-bins');
    expect(ctx.focus.current()).toBe(buttons[0]);
    await act(async () => {
      expect(instance.onKey?.('right')).toBe(true);
      expect(ctx.focus.current()).toBe(buttons[1]);
      expect(instance.onKey?.('right')).toBe(true);
      expect(ctx.focus.current()).toBe(buttons[2]);
      expect(buttons[2].classList.contains('sp-focused')).toBe(true);
      expect(instance.onKey?.('ok')).toBe(true);
    });

    expect(ctx.mock.logs).toContainEqual({ type: 'sort:correct', data: { index: 0, bin: 'star' } });
    expect(root.querySelector('.spa-sort-bins')?.getAttribute('data-item-index')).toBe('0');
    await tick(800);
    expect(root.querySelector('.spa-sort-bins')?.getAttribute('data-item-index')).toBe('0');
    await tick(150);
    expect(root.querySelector('.spa-sort-bins')?.getAttribute('data-item-index')).toBe('1');
    expect(ctx.focus.current()).toBe(buttons[0]);
    expect(buttons[0].classList.contains('sp-focused')).toBe(true);
    await key(instance, 'ok');

    expect(ctx.mock.logs).toContainEqual({ type: 'sort:correct', data: { index: 1, bin: 'apple' } });
    expect(ctx.mock.logs.some((event) => event.type === 'sort:retry')).toBe(false);
    await tick(1900);
    expect(ctx.mock.completions).toEqual([{ data: { items: 2 } }]);
  });
});
