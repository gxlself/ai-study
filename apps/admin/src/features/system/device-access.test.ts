import type { DeviceInfo } from '@sprout/schema';
import { describe, expect, it } from 'vitest';
import { deviceAccessBody, deviceDraft } from './device-access';

const device: DeviceInfo = {
  id: 'tv', name: '客厅电视', kind: 'tv', childId: 'child-a',
  createdAt: '2026-10-03T00:00:00Z', lastSeenAt: null,
};

describe('设备孩子访问范围', () => {
  it('新设备和旧版未设置范围的设备默认只允许绑定孩子', () => {
    expect(deviceDraft(undefined, 'child-a').allowedChildIds).toEqual(['child-a']);
    expect(deviceAccessBody(deviceDraft(device, 'child-b'))).toEqual({
      name: '客厅电视', childId: 'child-a', allowedChildIds: ['child-a'],
    });
  });
  it('null 表示全部孩子，空数组表示不允许任何孩子', () => {
    expect(deviceAccessBody(deviceDraft({ ...device, allowedChildIds: null }, undefined)).allowedChildIds).toBeNull();
    expect(deviceAccessBody(deviceDraft({ ...device, childId: null, allowedChildIds: [] }, undefined)).allowedChildIds).toEqual([]);
  });
  it('范围独立复制并去重，不改服务端对象', () => {
    const original = { ...device, allowedChildIds: ['child-a'] };
    const draft = deviceDraft(original, undefined);
    draft.allowedChildIds.push('child-b', 'child-b');
    expect(deviceAccessBody(draft).allowedChildIds).toEqual(['child-a', 'child-b']);
    expect(original.allowedChildIds).toEqual(['child-a']);
  });
  it('绑定孩子在范围外时不能提交，解除绑定或勾选全部可以提交', () => {
    const draft = { ...deviceDraft(device, undefined), allowedChildIds: [] };
    expect(() => deviceAccessBody(draft)).toThrow('绑定孩子必须在允许范围内');
    expect(deviceAccessBody({ ...draft, childId: '' }).childId).toBeNull();
    expect(deviceAccessBody({ ...draft, allChildren: true }).allowedChildIds).toBeNull();
  });
  it('没有孩子的新家庭不隐式授权以后添加的孩子', () => {
    expect(deviceAccessBody(deviceDraft(undefined, undefined))).toEqual({
      name: '', childId: null, allowedChildIds: [],
    });
  });
});
