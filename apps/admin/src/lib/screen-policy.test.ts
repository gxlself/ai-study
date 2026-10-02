import { describe, expect, it } from 'vitest';
import { effectiveScreenMode, sessionHardLimit } from './screen-policy';

describe('后台屏幕模式提示', () => {
  it('18 个月以下始终是家长模式', () => {
    expect(effectiveScreenMode(17, 'co-view', 'default', 'co-view')).toBe('parent-only');
  });
  it('18–23 个月自动关闭，需要主动开启', () => {
    expect(effectiveScreenMode(18, 'auto', 'optional')).toBe('parent-only');
    expect(effectiveScreenMode(23, 'co-view', 'optional')).toBe('co-view');
  });
  it('24 个月后自动开启，但尊重家长模式和服务端最终状态', () => {
    expect(effectiveScreenMode(24, 'auto', 'default')).toBe('co-view');
    expect(effectiveScreenMode(30, 'parent-only', 'default')).toBe('parent-only');
    expect(effectiveScreenMode(24, 'auto', undefined, 'parent-only')).toBe('parent-only');
  });
  it('共看安全上限独立于仍支持 30 分钟的旧契约', () => {
    expect(sessionHardLimit(18, 'co-view')).toBe(8);
    expect(sessionHardLimit(24, 'co-view')).toBe(20);
    expect(sessionHardLimit(12, 'parent-only')).toBe(30);
  });
});
