import { describe, expect, it } from 'vitest';
import { pinAgeWarning } from './lesson-age';

describe('置顶课程月龄提示', () => {
  it.each([24, 30, 36])('建议范围内 %i 个月不提示', (months) => {
    expect(pinAgeWarning(months, [24, 36])).toBeUndefined();
  });
  it.each([18, 23, 40])('不适龄的 %i 个月明确提示不会安排', (months) => {
    expect(pinAgeWarning(months, [24, 36])).toContain('即使置顶也不会排入今日计划');
  });
  it.each([37, 38, 39])('保留 %i 个月的 3 个月复习延展', (months) => {
    expect(pinAgeWarning(months, [24, 36])).toContain('仍可在 3 个月的复习延展范围内安排');
    expect(pinAgeWarning(months, [24, 36])).not.toContain('不会排入');
  });
});
