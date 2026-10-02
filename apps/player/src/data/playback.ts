import { ageOf } from '@sprout/schema';
import type { ChildProfile, ScreenStatus } from '@sprout/schema';

/**
 * 播放端的最后一道模式护栏。服务端/core 会提供 mode；旧服务或离线夹具
 * 没有该字段时按循证分龄规则保守回退。
 */
export function resolvePlaybackMode(
  screen: Pick<ScreenStatus, 'mode'> | undefined,
  child: Pick<ChildProfile, 'birthday' | 'screen'>,
  now = new Date(),
): 'parent-only' | 'co-view' {
  const ageMonths = ageOf(child.birthday, now).months;
  if (!Number.isFinite(ageMonths) || ageMonths < 18) return 'parent-only';
  if (screen?.mode === 'parent-only' || screen?.mode === 'co-view') return screen.mode;
  if (child.screen.mode === 'parent-only' || child.screen.mode === 'co-view') return child.screen.mode;
  if (ageMonths < 24) return 'parent-only';
  return 'co-view';
}
