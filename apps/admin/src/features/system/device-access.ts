import type { DeviceInfo } from '@sprout/schema';

export interface DeviceDraft {
  code?: string;
  name: string;
  childId: string;
  allChildren: boolean;
  allowedChildIds: string[];
}

export function deviceDraft(device: DeviceInfo | undefined, childId: string | undefined): DeviceDraft {
  const bound = device ? device.childId ?? '' : childId ?? '';
  return {
    name: device?.name ?? '', childId: bound,
    allChildren: device?.allowedChildIds === null,
    allowedChildIds: device?.allowedChildIds ? [...device.allowedChildIds] : bound ? [bound] : [],
  };
}

export function deviceAccessBody(draft: DeviceDraft) {
  const allowedChildIds = draft.allChildren ? null : [...new Set(draft.allowedChildIds)];
  if (draft.childId && allowedChildIds && !allowedChildIds.includes(draft.childId)) {
    throw new Error('绑定孩子必须在允许范围内，请勾选该孩子或解除绑定。');
  }
  return { name: draft.name.trim(), childId: draft.childId || null, allowedChildIds };
}
