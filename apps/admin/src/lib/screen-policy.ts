import type { ChildScreenSettings, ScreenPolicy, ScreenStatus } from '@sprout/schema';

export function effectiveScreenMode(
  ageMonths: number,
  requested?: ChildScreenSettings['mode'],
  childScreen?: ScreenPolicy['childScreen'],
  serverMode?: ScreenStatus['mode'],
): 'parent-only' | 'co-view' {
  if (ageMonths < 18 || childScreen === 'none' || requested === 'parent-only') return 'parent-only';
  if (serverMode) return serverMode;
  if (requested === 'co-view') return 'co-view';
  if (childScreen === 'optional' || ageMonths < 24) return 'parent-only';
  return 'co-view';
}

export function sessionHardLimit(ageMonths: number, mode: 'parent-only' | 'co-view'): number {
  if (mode === 'parent-only') return 30;
  return ageMonths < 24 ? 8 : 20;
}
