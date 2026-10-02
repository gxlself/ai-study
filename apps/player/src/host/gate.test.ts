import { describe, expect, it, vi } from 'vitest';
import { advanceGate, createGateSequence, GATE_DIRECTIONS, isGateExpired, PARENT_GATE_IDLE_MS } from './gate';
import type { Direction } from './navigation';

describe('parent gate', () => {
  it('generates exactly three directions from the injected random source', () => {
    const random = vi.fn<() => number>()
      .mockReturnValueOnce(0).mockReturnValueOnce(0.5).mockReturnValueOnce(0.9999);
    expect(createGateSequence(random)).toEqual(['up', 'left', 'right']);
    expect(random).toHaveBeenCalledTimes(3);
  });

  it.each(GATE_DIRECTIONS)('permits repeated %s directions', (direction) => {
    const value = GATE_DIRECTIONS.indexOf(direction) / 4;
    expect(createGateSequence(() => value)).toEqual([direction, direction, direction]);
  });

  it('advances without mutating the sequence and passes only on the third correct direction', () => {
    const sequence: Direction[] = ['left', 'left', 'right'];
    Object.freeze(sequence);
    expect(advanceGate(sequence, 0, 'left')).toBe(1);
    expect(advanceGate(sequence, 1, 'left')).toBe(2);
    expect(advanceGate(sequence, 2, 'right')).toBe('passed');
    expect(advanceGate(sequence, 3, 'right')).toBe('passed');
    expect(sequence).toEqual(['left', 'left', 'right']);
  });

  it('reports wrong without reusing part of a failed attempt', () => {
    const sequence: Direction[] = ['up', 'down', 'right'];
    expect(advanceGate(sequence, 0, 'down')).toBe('wrong');
    expect(advanceGate(sequence, 1, 'up')).toBe('wrong');
    expect(advanceGate(sequence, 2, 'left')).toBe('wrong');
  });

  it('rejects invalid generator/progress input instead of accidentally passing', () => {
    for (const value of [-1, 1, NaN, Infinity]) expect(() => createGateSequence(() => value)).toThrow();
    expect(() => advanceGate([], 0, 'left')).toThrow();
    expect(() => advanceGate(['up', 'up', 'up'], -1, 'up')).toThrow();
    expect(() => advanceGate(['up', 'up', 'up'], 4, 'up')).toThrow();
  });

  it('expires after exactly 30 seconds of inactivity, with an explicit caller clock', () => {
    expect(PARENT_GATE_IDLE_MS).toBe(30_000);
    expect(isGateExpired(1_000, 30_999)).toBe(false);
    expect(isGateExpired(1_000, 31_000)).toBe(true);
    expect(isGateExpired(20_000, 31_000)).toBe(false);
  });
});
