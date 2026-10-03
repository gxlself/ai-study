import { ageOf, type ChildProfile, type Route, type ScreenStatus } from '@sprout/schema';
import { Alert } from 'antd';
import { useState } from 'react';
import { useResource } from '../../lib/hooks';
import { effectiveScreenMode } from '../../lib/screen-policy';
import { stageForAge } from './model';

const NOTICE_TEXT = '中国卫健委/教育部对 0–3 岁的建议更严格（不接触/禁用视屏类产品）；本 App 的共看课是可选的、短时的、必须陪同的；您可以随时在后台切换为『仅家长指引』，课程会以线下版继续。';
const noticeKey = (childId: string) => `sprout.admin.coViewNotice.v1.${encodeURIComponent(childId)}`;

function hasReadNotice(childId: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(noticeKey(childId)) === '1';
  } catch {
    return false;
  }
}

export default function CoViewNotice({ child }: { child: ChildProfile }) {
  const [dismissedChildren, setDismissedChildren] = useState<Set<string>>(() => new Set());
  const months = ageOf(child.birthday).months;
  const eligible = Number.isFinite(months) && months >= 18 && child.screen.mode !== 'parent-only'
    && !dismissedChildren.has(child.id) && !hasReadNotice(child.id);
  const screen = useResource<ScreenStatus>(eligible ? `/api/children/${encodeURIComponent(child.id)}/screen` : null);
  // 旧接口没有生效模式时，再按路线策略与月龄回退，避免加载时误报共看。
  const route = useResource<Route>(eligible && !screen.loading && !screen.data?.mode
    ? `/api/routes/${encodeURIComponent(child.plan.routeId)}` : null);
  const policy = stageForAge(route.data, months)?.screen.childScreen;
  const mode = effectiveScreenMode(months, child.screen.mode, screen.data?.mode ? undefined : policy, screen.data?.mode);

  function dismiss() {
    setDismissedChildren((current) => new Set(current).add(child.id));
    try {
      window.localStorage.setItem(noticeKey(child.id), '1');
    } catch {
      // 本地存储受限时，仍允许关闭本次页面的提示。
    }
  }

  if (!eligible || screen.loading || route.loading || mode !== 'co-view') return null;
  return <Alert type="warning" showIcon title={`${child.name}的亲子共看提示`} description={NOTICE_TEXT}
    closable={{ 'aria-label': `关闭${child.name}的亲子共看提示`, onClose: dismiss }} />;
}
