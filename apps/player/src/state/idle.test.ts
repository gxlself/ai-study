import { describe, expect, it } from 'vitest';
import { IDLE_PAUSE_MS, InteractionWatch } from './idle';

describe('无交互保护', () => {
  it('满三分钟触发，输入后重新累计', () => {
    let now = 0;
    const watch = new InteractionWatch(() => now);
    now = IDLE_PAUSE_MS - 1;
    expect(watch.expired()).toBe(false);
    now += 1;
    expect(watch.expired()).toBe(true);
    watch.touch();
    expect(watch.expired()).toBe(false);
    now += IDLE_PAUSE_MS;
    expect(watch.expired()).toBe(true);
  });
});
