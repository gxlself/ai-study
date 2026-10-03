import { useState } from 'react';
import { Check, Users } from 'lucide-react';
import { Page } from './common';

export const CO_VIEW_NOTICE = '中国卫健委/教育部对 0–3 岁的建议更严格（不接触/禁用视屏类产品）；本 App 的共看课是可选的、短时的、必须陪同的；您可以随时在后台切换为『仅家长指引』，课程会以线下版继续。';

export function coViewNoticeRead(childId: string): boolean {
  try { return localStorage.getItem(`sprout.coViewNotice:${childId}`) === '1'; }
  catch { return false; }
}

export function CoViewNotice({ childId }: { childId: string }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (dismissed === childId || coViewNoticeRead(childId)) return null;
  const close = () => {
    try { localStorage.setItem(`sprout.coViewNotice:${childId}`, '1'); } catch { /* 本次阅读仍可关闭。 */ }
    setDismissed(childId);
  };
  return <Page className="co-view-notice" onBack={close}>
    <section role="dialog" aria-modal="true" aria-labelledby="co-view-notice-title">
      <Users aria-hidden="true" />
      <h2 id="co-view-notice-title">关于亲子共看</h2>
      <p>{CO_VIEW_NOTICE}</p>
      <button data-focusable className="primary" onClick={close}><Check />已了解</button>
    </section>
  </Page>;
}
