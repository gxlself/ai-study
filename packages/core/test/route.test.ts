import { describe, expect, it } from 'vitest';
import { currentTheme, findStage } from '../src';
import { deepFreeze, localDate, makeChild, makePlan, makeRoute, makeStage, makeTheme } from './fixtures';

describe('findStage', () => {
  const stages = [
    makeStage({ id: 'first', ageRange: [6, 8] }),
    makeStage({ id: 'middle', ageRange: [9, 11] }),
    makeStage({ id: 'last', ageRange: [12, 36] }),
  ];
  const route = deepFreeze(makeRoute(stages));

  it.each([
    [-1, 'first'], [0, 'first'], [5, 'first'], [6, 'first'], [8, 'first'],
    [9, 'middle'], [11, 'middle'], [12, 'last'], [36, 'last'], [72, 'last'],
  ])('finds the stage at age %s', (age, stageId) => {
    expect(findStage(route, age)?.id).toBe(stageId);
  });

  it('returns null for an empty route', () => {
    expect(findStage(makeRoute([]), 12)).toBeNull();
  });

  it('does not invent a stage in an uncovered age gap', () => {
    expect(findStage(makeRoute([stages[0], stages[2]]), 10)).toBeNull();
  });

  it('uses route order when closed ranges overlap', () => {
    const first = makeStage({ id: 'first', ageRange: [6, 12] });
    const second = makeStage({ id: 'second', ageRange: [12, 24] });
    expect(findStage(makeRoute([first, second]), 12)).toBe(first);
  });

  it('clamps both extremes of a single-stage route', () => {
    const stage = makeStage();
    expect(findStage(makeRoute([stage]), 0)).toBe(stage);
    expect(findStage(makeRoute([stage]), 100)).toBe(stage);
  });
});

describe('currentTheme', () => {
  const themes = [makeTheme('one', ['a'], 2), makeTheme('two', ['b'], 1), makeTheme('three', ['c'], 3)];
  const stage = deepFreeze(makeStage({ ageRange: [6, 36], themes }));
  const route = deepFreeze(makeRoute([stage]));
  const child = deepFreeze(makeChild({ birthday: '2024-01-15' }));

  it.each([
    ['2023-12-01', 'one', 0],
    ['2024-07-14', 'one', 0],
    ['2024-07-15', 'one', 0],
    ['2024-07-21', 'one', 0],
    ['2024-07-22', 'one', 1],
    ['2024-07-28', 'one', 1],
    ['2024-07-29', 'two', 0],
    ['2024-08-04', 'two', 0],
    ['2024-08-05', 'three', 0],
    ['2024-08-12', 'three', 1],
    ['2024-08-19', 'three', 2],
    ['2024-08-26', 'one', 0],
    ['2024-09-09', 'two', 0],
  ])('uses accumulated weeks and cycles at %s', (date, themeId, weekIndex) => {
    const result = currentTheme(route, stage, child, localDate(date));
    expect(result).toEqual({ theme: themes.find((theme) => theme.id === themeId), weekIndex });
  });

  it('does not advance a week until the local date changes', () => {
    expect(currentTheme(route, stage, child, localDate('2024-07-21', 23, 59, 59))?.weekIndex).toBe(0);
    expect(currentTheme(route, stage, child, localDate('2024-07-22', 0))?.weekIndex).toBe(1);
  });

  it('honors a valid manual theme anywhere in the route with weekIndex zero', () => {
    const manual = makeTheme('manual');
    const other = makeStage({ id: 'other', ageRange: [37, 48], themes: [manual] });
    const result = currentTheme(makeRoute([stage, other]), stage, {
      birthday: child.birthday, plan: makePlan({ themeId: 'manual' }),
    }, localDate('2024-07-22'));
    expect(result).toEqual({ theme: manual, weekIndex: 0 });
  });

  it('falls back to automatic progression when the manual id is absent', () => {
    expect(currentTheme(route, stage, {
      birthday: child.birthday, plan: makePlan({ themeId: 'absent' }),
    }, localDate('2024-07-22'))).toEqual({ theme: themes[0], weekIndex: 1 });
  });

  it('supports empty runtime theme arrays without dividing by zero', () => {
    const empty = makeStage({ themes: [] });
    expect(currentTheme(makeRoute([empty]), empty, child, localDate('2024-07-22'))).toBeNull();
  });

  it.each([
    ['2024-01-31', 1, '2024-03-06', 0],
    ['2024-01-31', 1, '2024-03-07', 1],
    ['2023-01-31', 1, '2023-03-06', 0],
    ['2023-01-31', 1, '2023-03-07', 1],
    ['2024-08-31', 6, '2025-03-06', 0],
    ['2024-08-31', 6, '2025-03-07', 1],
    ['2024-02-29', 12, '2025-03-07', 1],
    ['2024-08-31', 18, '2026-03-07', 1],
    ['2023-12-31', 4, '2024-05-07', 1],
  ])('clamps month-end birthday %s + %s months at %s', (birthday, minAge, date, weekIndex) => {
    const monthEndStage = makeStage({ ageRange: [minAge, 36], themes: [makeTheme('month-end', ['a'], 8)] });
    expect(currentTheme(makeRoute([monthEndStage]), monthEndStage, {
      birthday, plan: makePlan(),
    }, localDate(date))?.weekIndex).toBe(weekIndex);
  });
});
