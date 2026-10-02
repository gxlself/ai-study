// @vitest-environment node
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_ACTIVITY_TYPES, ChooseProps, CountProps, PatternProps, SortProps, SubitizeProps,
  PHRASES, type Speech,
} from '@sprout/schema';
import { createMockContext, type ActivityInstance, type ActivityPlugin, type NavKey } from '@sprout/plugin-sdk';
import { builtinActivities, chooseActivity, countActivity, patternActivity, sortActivity, subitizeActivity } from './index';
import { concepts, samples } from '../dev/samples';
import { quantityPositions } from './QuantityField';
import { subitizeChoices } from './activities/subitize';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: { instance: ActivityInstance; root: HTMLElement }[] = [];

async function mount<P>(plugin: ActivityPlugin<P>, props: P, speak = vi.fn(async (_speech: Speech | string) => {})) {
  const controller = new AbortController();
  const ctx = createMockContext(props, {
    concepts, signal: controller.signal, speak: (speech) => speak(speech), reducedMotion: true,
    stopSpeaking: vi.fn(), complete: vi.fn(), log: vi.fn(),
  });
  vi.spyOn(ctx, 'stopSpeaking');
  vi.spyOn(ctx, 'log');
  const root = document.createElement('div');
  document.body.append(root);
  let instance!: ActivityInstance;
  await act(async () => { instance = await plugin.mount(root, ctx); });
  mounted.push({ instance, root });
  return { ctx, root, instance, controller, speak };
}
async function key(instance: ActivityInstance, value: NavKey) {
  await act(async () => { instance.onKey?.(value); });
}
async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => { (element as HTMLElement).click(); });
}
async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    for (const { root, instance } of mounted.splice(0)) {
      instance.unmount();
      root.remove();
    }
  });
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('内置活动注册与生命周期', () => {
  it('注册顺序与唯一契约一致', () => {
    expect(builtinActivities.map((plugin) => plugin.type)).toEqual(BUILTIN_ACTIVITY_TYPES);
  });
  it.each(BUILTIN_ACTIVITY_TYPES)('%s 可挂载、获取资源和短语、动态输入、暂停、中止与幂等卸载', async (type) => {
    const plugin = builtinActivities.find((activity) => activity.type === type)!;
    const value = await mount(plugin, samples[type]);
    expect(value.root.querySelector('.spa-stage')).not.toBeNull();
    expect(plugin.preload?.(samples[type], value.ctx)).toBeInstanceOf(Array);
    expect(plugin.speeches?.(samples[type])).toBeInstanceOf(Array);
    expect(value.instance.onKey?.('back')).toBe(false);
    await act(async () => { value.ctx.mock.setInputMode('touch'); });
    expect(value.root.textContent).toContain('点一点');
    await act(async () => { value.instance.pause?.(); });
    expect(value.root.querySelector('.spa-stage')?.getAttribute('data-paused')).toBe('true');
    await act(async () => { value.instance.resume?.(); value.controller.abort(); });
    await tick(60_000);
    expect(value.ctx.mock.completions).toEqual([]);
    expect(value.ctx.stopSpeaking).toHaveBeenCalled();
    expect(value.root.childElementCount).toBe(0);
    await act(async () => { value.instance.unmount(); value.instance.unmount(); });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('资源收集包括词库引用、内联图片、场景精灵、字幕和封面', () => {
    const ctx = createMockContext({}, { concepts, resolveAsset: (path) => `/packs/test/${path}` });
    const props = ChooseProps.parse({ rounds: [{
      prompt: PHRASES.howMany,
      options: ['apple', { id: 'inline', concept: { zh: '球', image: 'ball.svg' }, image: 'custom.svg' }],
      answer: 'apple',
    }] });
    const assets = chooseActivity.preload!(props, ctx);
    expect(assets).toContain(concepts[0].imageUrl);
    expect(assets).toContain('/packs/test/ball.svg');
    expect(assets).toContain('/packs/test/custom.svg');
    expect(new Set(assets).size).toBe(assets.length);
  });
});

describe('数一数', () => {
  it('唱数使用一二三，数量使用两，等待显式确认才结束', async () => {
    const value = await mount(countActivity, CountProps.parse({ rounds: [{ item: 'apple', count: 2 }] }));
    await key(value.instance, 'ok');
    await key(value.instance, 'ok');
    expect(value.speak.mock.calls.map(([speech]) => speech)).toEqual([
      { zh: '一', en: 'one' }, { zh: '二', en: 'two' }, { zh: '一共两个苹果', en: 'Two apples!' },
    ]);
    expect(value.ctx.mock.completions).toHaveLength(0);
    expect(value.root.querySelector('.spa-numeral')?.textContent).toBe('2');
    await key(value.instance, 'ok');
    expect(value.ctx.mock.completions).toEqual([{ data: { rounds: 1, counts: [2] } }]);
  });
  it('多轮与触屏任意物体仍然从下一个开始', async () => {
    const value = await mount(countActivity, CountProps.parse({
      rounds: [{ item: 'flower', count: 3 }, { item: 'apple', count: 1 }], cardinality: false,
    }));
    for (let i = 0; i < 3; i++) await click(value.root.querySelectorAll('.spa-quantity')[2]);
    await key(value.instance, 'ok');
    await key(value.instance, 'ok');
    expect(value.speak.mock.calls.map(([speech]) => speech)).toEqual([
      { zh: '一', en: 'one' }, { zh: '二', en: 'two' }, { zh: '三', en: 'three' }, { zh: '一', en: 'one' },
    ]);
  });
  it('自动唱数只按有效时长运行，暂停与中止停止计时', async () => {
    const value = await mount(countActivity, CountProps.parse({
      rounds: [{ item: 'apple', count: 3 }], mode: 'auto', cardinality: false,
    }));
    await tick(1500);
    expect(value.speak).toHaveBeenCalledTimes(1);
    await act(async () => { value.instance.pause?.(); });
    await tick(20_000);
    expect(value.speak).toHaveBeenCalledTimes(1);
    await act(async () => { value.instance.resume?.(); });
    await tick(1500);
    expect(value.speak).toHaveBeenCalledTimes(2);
    await act(async () => { value.controller.abort(); });
    await tick(10_000);
    expect(value.speak).toHaveBeenCalledTimes(2);
  });
  it('等待不结束的朗读时中止，不能再播基数或完成', async () => {
    const speak = vi.fn((_speech: Speech | string) => new Promise<void>(() => {}));
    const value = await mount(countActivity, CountProps.parse({ rounds: [{ item: 'apple', count: 1 }] }), speak);
    await key(value.instance, 'ok');
    await act(async () => { value.controller.abort(); });
    await tick(10_000);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(value.ctx.mock.completions).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('选择、分拣和规律', () => {
  it('错两次触发提示；accuracy仅计每轮首次答对并无孩子分数显示', async () => {
    const value = await mount(chooseActivity, ChooseProps.parse({ rounds: [
      { prompt: { zh: '找苹果' }, options: ['apple', 'ball'], answer: 'apple' },
      { prompt: { zh: '找皮球' }, options: ['apple', 'ball'], answer: 'ball' },
    ] }));
    await click(value.root.querySelectorAll('.spa-choose-card')[1]);
    await click(value.root.querySelectorAll('.spa-choose-card')[1]);
    expect(value.speak).toHaveBeenCalledWith(PHRASES.tryAgain);
    expect(value.root.querySelectorAll('.spa-choose-card')[0].classList.contains('is-hint')).toBe(true);
    await click(value.root.querySelectorAll('.spa-choose-card')[0]);
    expect(value.ctx.mock.completions).toHaveLength(0);
    await key(value.instance, 'ok');
    await key(value.instance, 'right');
    await key(value.instance, 'ok');
    await key(value.instance, 'ok');
    expect(value.ctx.mock.completions).toEqual([{ accuracy: 0.5, data: { rounds: 2, firstCorrect: 1 } }]);
    expect(value.root.textContent).not.toContain('0.5');
  });
  it('触屏点非当前篮子一次即可分拣；中止后不再自动推进', async () => {
    const value = await mount(sortActivity, SortProps.parse({
      prompt: { zh: '放进去' }, bins: [{ id: 'a', label: { zh: '苹果' } }, { id: 'b', label: { zh: '皮球' } }],
      items: [{ item: 'ball', bin: 'b' }, { item: 'apple', bin: 'a' }],
    }));
    await click(value.root.querySelectorAll('.spa-sort-bin')[1]);
    expect(value.ctx.log).toHaveBeenCalledWith('sort:correct', { index: 0, bin: 'b' });
    await tick(950);
    expect(value.root.querySelector('.spa-sort-item img')?.getAttribute('alt')).toBe('苹果');
    await click(value.root.querySelectorAll('.spa-sort-bin')[0]);
    await act(async () => { value.controller.abort(); });
    await tick(5000);
    expect(value.ctx.mock.completions).toHaveLength(0);
  });
  it('展示完整规律再追加空位，填对后完整朗读', async () => {
    const value = await mount(patternActivity, PatternProps.parse({
      rounds: [{ sequence: ['apple', 'ball', 'apple'], options: ['apple', 'ball'], answer: 'ball' }],
    }));
    expect(value.root.querySelectorAll('.spa-pattern-cell')).toHaveLength(4);
    await click(value.root.querySelectorAll('.spa-pattern-option')[0]);
    expect(value.speak).toHaveBeenCalledWith(PHRASES.tryAgain);
    await click(value.root.querySelectorAll('.spa-pattern-option')[1]);
    await tick(2200);
    expect(value.speak.mock.calls.slice(-4).map(([speech]) => speech)).toEqual([
      { zh: '苹果', en: 'apple' }, { zh: '皮球', en: 'ball' }, { zh: '苹果', en: 'apple' }, { zh: '皮球', en: 'ball' },
    ]);
    await key(value.instance, 'ok');
    expect(value.ctx.mock.completions).toHaveLength(1);
  });
});

describe('瞬时数感和布局', () => {
  it.each([1, 2, 3, 4, 5, 6])('%i 总有三个不同圆点卡选项，包含正确数', (count) => {
    const options = subitizeChoices(count);
    expect(options).toHaveLength(3);
    expect(new Set(options).size).toBe(3);
    expect(options).toContain(count);
  });
  it('错答重现物体，正答后逐个数一遍', async () => {
    const value = await mount(subitizeActivity, SubitizeProps.parse({ rounds: [{ count: 1 }], showSec: 2 }));
    await tick(2600);
    await click(value.root.querySelector('[aria-label="2"]'));
    expect(value.root.querySelector('.spa-subitize-field')?.classList.contains('is-hidden')).toBe(false);
    expect(value.speak).toHaveBeenCalledWith(PHRASES.lookAgain);
    await click(value.root.querySelector('[aria-label="1"]'));
    await tick(1000);
    expect(value.speak.mock.calls.slice(-1)[0][0]).toEqual({ zh: '一', en: 'one' });
    await key(value.instance, 'ok');
    expect(value.ctx.mock.completions).toHaveLength(1);
  });
  it('无选项模式按一二三顺序回数', async () => {
    const value = await mount(subitizeActivity, SubitizeProps.parse({ rounds: [{ count: 3 }], choices: false, showSec: 2 }));
    await tick(5200);
    expect(value.speak.mock.calls.slice(-3).map(([speech]) => speech)).toEqual([
      { zh: '一', en: 'one' }, { zh: '二', en: 'two' }, { zh: '三', en: 'three' },
    ]);
  });
  it('骰子点位无重叠，散布用确定网格保持间距', () => {
    for (let count = 1; count <= 10; count++) {
      for (const layout of ['row', 'dice', 'scatter', 'ten-frame'] as const) {
        const positions = quantityPositions(count, layout);
        expect(positions).toHaveLength(count);
        expect(new Set(positions.map((position) => position.join(','))).size).toBe(count);
        expect(positions.every(([x, y]) => x > 0 && x < 100 && y > 0 && y < 100)).toBe(true);
      }
    }
  });
});
