import { describe, expect, it } from 'vitest';
import { localDateString, planToday } from '../src';
import { deepFreeze, localDate, makeChild, makeIndex, makePlan, makeRoute, makeStage, makeSummary, makeTheme } from './fixtures';

const date = localDate('2026-10-03');
const route = makeRoute([
  makeStage({
    id: 'first', ageRange: [6, 8],
    themes: [makeTheme('first.theme', ['first.a', 'first.b']), makeTheme('first.later', ['first.c'])],
  }),
  makeStage({ id: 'middle', ageRange: [9, 29], themes: [makeTheme('middle.theme', ['middle'])] }),
  makeStage({ id: 'last', ageRange: [30, 36], themes: [makeTheme('last.theme', ['last.a', 'last.b'])] }),
]);
const lessons = makeIndex(
  ...['first.a', 'first.b', 'first.c'].map((id) => makeSummary(id, { audience: 'parent', ageRange: [6, 8] })),
  makeSummary('middle', { audience: 'parent', ageRange: [9, 29] }),
  makeSummary('last.a', { audience: 'child', ageRange: [30, 36] }),
  makeSummary('last.b', { audience: 'child', ageRange: [30, 36] }),
  makeSummary('external', { audience: 'parent', ageRange: [6, 8] }),
);

function input(months: number) {
  const child = makeChild({
    birthday: localDateString(new Date(date.getFullYear(), date.getMonth() - months, date.getDate())),
    plan: makePlan(),
  });
  child.screen.mode = 'co-view';
  return { route, lessons, child, date, history: [], usedSec: 0 };
}

describe('路线范围外的今日计划', () => {
  it.each([0, 3, 5])('%i 月龄从首阶段首主题排家长指引，不给宝宝屏幕课', (months) => {
    const request = input(months);
    request.child.plan = makePlan({ themeId: 'last.theme', pinned: ['middle', 'external', 'last.a'] });
    const frozen = deepFreeze(request);
    const before = structuredClone(frozen);
    const plan = planToday(frozen);
    expect(plan.child.ageMonths).toBe(months);
    expect(plan.notice).toBe('before-first-stage');
    expect(plan.screen.mode).toBe('parent-only');
    expect(plan.stage?.id).toBe('first');
    expect(plan.theme).toMatchObject({ id: 'first.theme', weekIndex: 0 });
    expect(plan.items).toHaveLength(2);
    expect(plan.items.every((item) => item.lesson.audience === 'parent' && !item.offlineOnly)).toBe(true);
    expect(plan.items.map((item) => item.lessonId).sort()).toEqual(['first.a', 'first.b']);
    expect(frozen).toEqual(before);
  });

  it('6 月龄正常排课，不显示范围外说明，也不放宽其他课程下限', () => {
    const request = input(6);
    request.lessons = { ...lessons, 'first.a': { ...lessons['first.a'], ageRange: [7, 8] } };
    const plan = planToday(request);
    expect(plan.child.ageMonths).toBe(6);
    expect(plan).not.toHaveProperty('notice');
    expect(plan.items.map((item) => item.lessonId)).toEqual(['first.b', 'first.c']);
  });

  it('40 月龄沿用末阶段内容，忽略过往手动主题，但不放宽过往/扩展课上限', () => {
    const request = input(40);
    request.child.plan = makePlan({ themeId: 'first.theme', pinned: ['first.a', 'external'] });
    const plan = planToday(request);
    expect(plan.child.ageMonths).toBe(40);
    expect(plan.notice).toBe('after-last-stage');
    expect(plan.stage?.id).toBe('last');
    expect(plan.theme?.id).toBe('last.theme');
    expect(plan.items.map((item) => item.lessonId).sort()).toEqual(['last.a', 'last.b']);
  });

  it.each([36, 39])('%i 月龄仍在既有末阶段宽限范围内，不显示 notice', (months) => {
    const plan = planToday(input(months));
    expect(plan).not.toHaveProperty('notice');
    expect(plan.items).toHaveLength(2);
  });

  it('提前学也遵守跳过和去重，缺少家长课时不转成 child 线下版', () => {
    const request = input(0);
    request.child.plan = makePlan({ pinned: ['first.a', 'first.a'], skipped: ['first.b', 'first.c'] });
    expect(planToday(request).items.map((item) => item.lessonId)).toEqual(['first.a']);
    request.lessons = Object.fromEntries(Object.entries(lessons).map(([id, lesson]) => [id, { ...lesson, audience: 'child' }]));
    expect(planToday(request).items).toEqual([]);
  });
});
