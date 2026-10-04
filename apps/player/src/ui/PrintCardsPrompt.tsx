import { Printer } from 'lucide-react';
import type { DataSource } from '../data';

export function lessonPrintAddress(source: DataSource | null, lessonId: string): string | undefined {
  if (source?.kind !== 'remote' || !('server' in source) || typeof source.server !== 'string') return undefined;
  return new URL(`admin/print/lesson/${encodeURIComponent(lessonId)}`, `${source.server.replace(/\/+$/, '')}/`).href;
}

export function PrintCardsPrompt({ source, lessonId }: { source: DataSource | null; lessonId: string }) {
  const address = lessonPrintAddress(source, lessonId);
  return <aside className="print-cards-prompt" aria-label="打印卡片">
    <strong><Printer aria-hidden="true" />打印卡片</strong>
    {address ? <>
      <p>宝宝看的是实体卡片：用手机或电脑打开下面地址打印</p>
      <span className="print-cards-address">{address}</span>
    </> : <p>连接家庭服务器后可在后台打印卡片</p>}
  </aside>;
}
