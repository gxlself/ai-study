import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeStages } from '../merge-route';
import { CORE_PACK } from '../lib/io';

const stages = await Promise.all(Array.from({ length: 6 }, async (_, index) =>
  JSON.parse(await readFile(path.join(CORE_PACK, `routes/_stages/s${index + 1}.json`), 'utf8'))));

describe('核心路线合并', () => {
  it('排序六个源阶段，完整覆盖 6–36 月，不修改输入', () => {
    const reversed = structuredClone(stages).reverse();
    const before = structuredClone(reversed);
    const route = mergeStages(reversed);
    expect(route.id).toBe('sprout.core.route');
    expect(route.title).toEqual({ zh: '芽芽成长路线', en: 'Sprout Growth Route' });
    expect(route.stages.map((stage) => stage.ageRange)).toEqual([[6, 8], [9, 11], [12, 17], [18, 23], [24, 29], [30, 36]]);
    expect(reversed).toEqual(before);
  });
  it.each([8, 10])('拒绝重叠或缺失月份：s2 从 %s 月开始', (min) => {
    const input = structuredClone(stages);
    input[1].ageRange[0] = min;
    expect(() => mergeStages(input)).toThrow('缺口或重叠');
  });
  it('拒绝不完整范围、缺失阶段、重复 id 和无效数据', () => {
    const input = structuredClone(stages);
    input[5].ageRange[1] = 35;
    expect(() => mergeStages(input)).toThrow('6–36');
    expect(() => mergeStages(stages.slice(1))).toThrow('六个唯一阶段');
    expect(() => mergeStages([...stages.slice(0, 5), stages[4]])).toThrow('六个唯一阶段');
    expect(() => mergeStages([{}, ...stages.slice(1)])).toThrow();
  });
});
