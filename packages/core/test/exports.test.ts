import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { LessonSummary, ScreenPolicy, ScreenStatus, Stage, TodayPlan } from '@sprout/schema';
import * as core from '../src';
import { localDate, makeChild, makeIndex, makeRoute } from './fixtures';

describe('public core contract', () => {
  it('exports every contracted pure function from the package entry point', () => {
    expect(Object.keys(core).sort()).toEqual([
      'childScreenSeconds', 'computeStats', 'currentTheme', 'findStage', 'localDateString',
      'planToday', 'resolveChildMode', 'resolveScreenPolicy', 'resolveSessionAudience', 'screenStatus', 'summarizeLesson',
    ]);
    expectTypeOf(core.localDateString).returns.toEqualTypeOf<string>();
    expectTypeOf(core.findStage).returns.toEqualTypeOf<Stage | null>();
    expectTypeOf(core.resolveScreenPolicy).returns.toEqualTypeOf<ScreenPolicy>();
    expectTypeOf(core.screenStatus).returns.toEqualTypeOf<ScreenStatus>();
    expectTypeOf(core.summarizeLesson).returns.toEqualTypeOf<LessonSummary>();
    expectTypeOf(core.planToday).returns.toEqualTypeOf<TodayPlan>();
    expectTypeOf(core.computeStats).returns.toEqualTypeOf<core.Stats>();
  });

  it('does not consult the wall clock or randomness when planning', () => {
    const args = {
      route: makeRoute(), lessons: makeIndex('a', 'b', 'c'), child: makeChild(),
      history: [], usedSec: 0, date: localDate('2024-07-01'),
    };
    const unexpectedCall = () => { throw new Error('Unexpected nondeterministic input'); };
    const clock = vi.spyOn(Date, 'now').mockImplementation(unexpectedCall);
    const random = vi.spyOn(Math, 'random').mockImplementation(unexpectedCall);
    try {
      expect(core.planToday(args)).toEqual(core.planToday(args));
    } finally {
      clock.mockRestore();
      random.mockRestore();
    }
  });
});
