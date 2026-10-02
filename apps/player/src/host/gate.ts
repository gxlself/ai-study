import type { Direction } from './navigation';

export const PARENT_GATE_IDLE_MS = 30_000;
export const GATE_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

/** 可注入随机源，函数不持有题目或进度状态。 */
export function createGateSequence(random: () => number = Math.random): Direction[] {
  return Array.from({ length: 3 }, () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('random must return a number in [0, 1)');
    }
    return GATE_DIRECTIONS[Math.floor(value * GATE_DIRECTIONS.length)];
  });
}

/** wrong 时调用方生成新题并归零；返回数字即下一进度。 */
export function advanceGate(
  sequence: Direction[],
  progress: number,
  key: Direction,
): 'wrong' | 'passed' | number {
  if (sequence.length !== 3) throw new RangeError('sequence must have three directions');
  if (!Number.isInteger(progress) || progress < 0 || progress > sequence.length) {
    throw new RangeError('progress must be an integer in [0, 3]');
  }
  if (progress === sequence.length) return 'passed';
  if (key !== sequence[progress]) return 'wrong';
  const next = progress + 1;
  return next === sequence.length ? 'passed' : next;
}

export function isGateExpired(lastInputAt: number, now: number): boolean {
  return now - lastInputAt >= PARENT_GATE_IDLE_MS;
}
