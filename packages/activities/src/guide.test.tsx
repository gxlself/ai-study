// @vitest-environment node
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuideProps } from '@sprout/schema';
import { createMockContext, type ActivityInstance, type NavKey } from '@sprout/plugin-sdk';
import { guideActivity } from './activities/guide';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounts: { root: HTMLElement; instance: ActivityInstance }[] = [];
const sample = GuideProps.parse({
  goal: '和宝宝轮流把球滚过去', materials: ['一个大皮球'],
  steps: [{ text: '坐在宝宝对面，轻轻把球滚过去。',
    say: { zh: '皮球来了！', en: 'Here comes the ball!' },
    concept: { zh: '皮球', image: 'ball.svg' } }],
  observe: ['留意宝宝是否看向皮球。'], safety: '家长全程陪同，保持地面平整。', playMin: 0.05,
});
async function mount(playMin = sample.playMin) {
  const ctx = createMockContext({ ...sample, playMin });
  const root = document.createElement('div');
  document.body.append(root);
  let instance!: ActivityInstance;
  await act(async () => { instance = await guideActivity.mount(root, ctx); });
  mounts.push({ root, instance });
  return { ctx, root, instance };
}
async function press(instance: ActivityInstance, key: NavKey) {
  let result: boolean | undefined;
  await act(async () => { result = instance.onKey?.(key); });
  return result;
}
async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => { (element as HTMLElement).click(); });
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
  await act(async () => { mounts.splice(0).forEach(({ root, instance }) => { instance.unmount(); root.remove(); }); });
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('家长活动指引', () => {
  it('完整呈现成人阅读分区、中英短句与插图，始终不朗读', async () => {
    const { root, ctx } = await mount();
    expect(root.querySelectorAll('.spa-guide-steps > li')).toHaveLength(1);
    for (const text of ['准备材料', '可以这样说', '留意宝宝的反应', '安全提醒', sample.steps[0].say!.zh!, sample.steps[0].say!.en!]) {
      expect(root.textContent).toContain(text);
    }
    expect(root.querySelector('img')?.getAttribute('src')).toBe('ball.svg');
    expect(guideActivity.preload!(sample, ctx)).toEqual(['ball.svg']);
    expect(guideActivity.speeches(sample)).toEqual([]);
    expect(ctx.mock.speeches).toEqual([]);
  });
  it('playMin=0 直接完成，不进入计时或记录反应', async () => {
    const value = await mount(0);
    expect(value.root.querySelector('.spa-guide-start')?.textContent).toBe('完成');
    await press(value.instance, 'ok');
    await press(value.instance, 'ok');
    expect(value.ctx.mock.completions).toEqual([{ data: { playMin: 0, playedSec: 0 } }]);
    expect(value.ctx.mock.logs.some((event) => event.type === 'reaction')).toBe(false);
    expect(value.ctx.mock.sfx).toEqual([]);
  });
  it('计时期间只有低亮度圆点和时间；首次按键只显示结束按钮', async () => {
    const value = await mount();
    await press(value.instance, 'ok');
    expect(value.root.querySelector('.spa-guide--play')).not.toBeNull();
    expect(value.root.querySelector('.spa-guide-end')).toBeNull();
    expect(value.root.textContent).toBe('0:03');
    expect(value.root.querySelector('.spa-guide-dot')).not.toBeNull();
    await press(value.instance, 'right');
    expect(value.root.querySelector('.spa-guide-end')?.textContent).toBe('结束陪玩');
    expect(value.root.querySelector('.spa-guide--play')).not.toBeNull();
    await press(value.instance, 'ok');
    expect(value.root.textContent).toContain('宝宝今天的反应？');
    expect(value.ctx.mock.completions).toHaveLength(0);
    await press(value.instance, 'right');
    await press(value.instance, 'ok');
    expect(value.ctx.mock.logs).toContainEqual({ type: 'reaction', data: { value: 'neutral' } });
    expect(value.ctx.mock.completions).toEqual([{ data: { reaction: 'neutral', playMin: 0.05, playedSec: 0, reason: 'manual' } }]);
    expect(value.ctx.mock.speeches).toEqual([]);
  });
  it('到时只响一次 chime，点击反应后只记录一次再结束', async () => {
    const value = await mount();
    await click(value.root.querySelector('.spa-guide-start'));
    await tick(3000);
    expect(value.ctx.mock.sfx).toEqual(['chime']);
    const buttons = value.root.querySelectorAll('.spa-guide-reactions button');
    expect([...buttons].map((button) => button.textContent)).toEqual(['很喜欢', '一般', '还不感兴趣']);
    expect(value.ctx.mock.completions).toHaveLength(0);
    await click(buttons[2]);
    await click(buttons[2]);
    expect(value.ctx.mock.logs.filter((event) => event.type === 'reaction')).toEqual([{ type: 'reaction', data: { value: 'not-yet' } }]);
    expect(value.ctx.mock.completions).toHaveLength(1);
    expect(value.ctx.mock.speeches).toEqual([]);
  });
  it('宿主暂停冻结计时；中止释放定时器且不触发铃声', async () => {
    const value = await mount();
    await press(value.instance, 'ok');
    await tick(1000);
    await act(async () => { value.instance.pause?.(); });
    await tick(10_000);
    expect(value.root.querySelector('[role="timer"]')?.textContent).toBe('0:02');
    expect(value.ctx.mock.sfx).toEqual([]);
    await act(async () => { value.instance.resume?.(); });
    await tick(1000);
    expect(value.root.querySelector('[role="timer"]')?.textContent).toBe('0:01');
    await act(async () => { value.ctx.mock.abort(); });
    await tick(10_000);
    expect(value.root.childElementCount).toBe(0);
    expect(value.ctx.mock.sfx).toEqual([]);
    expect(value.ctx.mock.completions).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('触屏可显示并确认结束，返回键始终交给宿主', async () => {
    const value = await mount();
    expect(await press(value.instance, 'back')).toBe(false);
    await click(value.root.querySelector('.spa-guide-start'));
    await click(value.root.querySelector('.spa-guide-wake'));
    expect(value.root.querySelector('.spa-guide-end')).not.toBeNull();
    expect(await press(value.instance, 'back')).toBe(false);
    await click(value.root.querySelector('.spa-guide-end'));
    await click(value.root.querySelector('.spa-guide-reactions button'));
    expect(value.ctx.mock.logs).toContainEqual({ type: 'reaction', data: { value: 'liked' } });
  });
});
