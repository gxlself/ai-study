import { describe, expect, it } from 'vitest';
import { ageOf } from '@sprout/schema';
import { formatAge, formatDuration } from './format';

describe('月龄与时长', () => {
  it.each([[0, '0 个月'], [6, '6 个月'], [12, '1 岁'], [15, '1 岁 3 个月'], [36, '3 岁'], [14.8, '1 岁 2 个月']])(
    '月龄 %s 显示 %s', (age, text) => expect(formatAge(Number(age))).toBe(text),
  );
  it('未到生日当天不多算一个月', () => {
    expect(formatAge(ageOf('2025-07-03', new Date(2026, 9, 2)).months)).toBe('1 岁 2 个月');
    expect(formatAge(ageOf('2025-07-02', new Date(2026, 9, 2)).months)).toBe('1 岁 3 个月');
  });
  it('异常月龄不显示 NaN', () => {
    expect(formatAge(NaN)).toBe('月龄未知');
    expect(formatAge(-1)).toBe('月龄未知');
  });
  it.each([[0, '0 秒'], [30, '30 秒'], [60, '1 分钟'], [185, '3 分 5 秒'], [-2, '0 秒']])(
    '时长 %s 显示 %s', (seconds, text) => expect(formatDuration(Number(seconds))).toBe(text),
  );
});
