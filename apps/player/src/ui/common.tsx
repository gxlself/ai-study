import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Home, Leaf, LoaderCircle, Printer, Settings } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp } from '../state/AppContext';
import type { NavKey } from '../../../../packages/plugin-sdk/src/types';
import type { LessonSummary, OfflineActivity } from '@sprout/schema';
import { DOMAIN_LABELS } from '@sprout/schema';
import { createResources } from '../host';

export function useScope(onBack?: () => void, onKey?: (key: NavKey) => boolean) {
  const { navigation } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ onBack, onKey });
  latest.current = { onBack, onKey };
  useLayoutEffect(() => {
    if (!ref.current) return;
    return navigation.pushScope(ref.current, {
      onBack: () => latest.current.onBack?.(),
      onKey: (key) => latest.current.onKey?.(key) ?? false,
    });
  }, [navigation]);
  return ref;
}

export function Page({ children, className = '', onBack, onKey }: { children: ReactNode; className?: string; onBack?: () => void; onKey?: (key: NavKey) => boolean }) {
  const ref = useScope(onBack, onKey);
  return <div className={`page ${className}`} ref={ref}>{children}</div>;
}

export function Brand() {
  return <div className="brand"><Leaf aria-hidden="true" /><span>芽芽成长<small>SPROUT</small></span></div>;
}

export function IconButton({ label, children, onClick, className = '' }: { label: string; children: ReactNode; onClick(): void; className?: string }) {
  return <button className={`icon-button ${className}`} data-focusable aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

export function BackButton({ onClick, home = false }: { onClick(): void; home?: boolean }) {
  return <IconButton label={home ? '回到首页' : '返回'} onClick={onClick}>{home ? <Home /> : <ArrowLeft />}</IconButton>;
}

export function ParentButton() {
  const app = useApp();
  const navigate = useNavigate();
  async function open() {
    if (await app.askParent()) { app.setParentAccess(true); navigate('/parent'); }
  }
  return <IconButton label="家长菜单" className="parent-button" onClick={() => void open()}><Settings /></IconButton>;
}

export function Loading({ text = '小旅程准备中' }: { text?: string }) {
  return <div className="loading" role="status"><LoaderCircle aria-hidden="true" /><p>{text}</p></div>;
}

export function Problem({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="problem" role="alert"><h2>稍等一下</h2><p>{message}</p>{retry && <button className="primary" data-focusable onClick={retry}>再试一次</button>}</div>;
}

export function LessonCard({ lesson, compact = false, offlineOnly = false, adult = offlineOnly || lesson.audience === 'parent' }: { lesson: LessonSummary; compact?: boolean; adult?: boolean; offlineOnly?: boolean }) {
  const { source, concepts } = useApp();
  const navigate = useNavigate();
  const resources = createResources({ packId: lesson.packId, concepts, resolveAsset: (packId, path) => source?.resolveAsset(packId, path) ?? path });
  const image = lesson.cover?.imageUrl
    ? resources.resolveAsset(lesson.cover.imageUrl)
    : lesson.cover?.image ? resources.resolveAsset(lesson.cover.image)
      : lesson.cover?.concept ? resources.concept(lesson.cover.concept)?.imageUrl : undefined;
  const domain = DOMAIN_LABELS[lesson.domains[0]];
  return <button
    className={`lesson-card ${compact ? 'compact' : ''} ${adult ? 'adult-card' : ''}`} data-focusable data-lesson-id={lesson.id} onClick={() => navigate(`/lesson/${encodeURIComponent(lesson.id)}`, { state: { offlineOnly } })}
    style={{ '--domain-color': domain.color } as React.CSSProperties}
  >
    <div className="lesson-picture">{image ? <img src={image} alt="" /> : <Leaf aria-hidden="true" />}<span className="domain-label">{domain.zh}</span></div>
    <div className="lesson-caption"><h3>{lesson.title.zh}</h3>{adult && lesson.summary ? <p>{lesson.summary.zh}</p> : lesson.title.en && <p lang="en">{lesson.title.en}</p>}<small>{adult ? `家长阅读 · ${lesson.durationMin} 分钟` : `${lesson.durationMin} 分钟`}</small>
      {offlineOnly && <span className="offline-badge"><Leaf aria-hidden="true" />线下版</span>}
      {lesson.hasPrintables && <span className="printable-note"><Printer aria-hidden="true" />可在后台打印卡片</span>}
    </div>
  </button>;
}

export function OfflineCards({ items }: { items: OfflineActivity[] }) {
  return <div className="offline-list">{items.map((item, index) => <article className="offline-card" key={`${item.title}-${index}`}>
    <div className="offline-heading"><Leaf aria-hidden="true" /><h3>{item.title}</h3>{item.minutes && <small>{item.minutes} 分钟</small>}</div>
    {item.materials?.length ? <p className="materials">准备：{item.materials.join('、')}</p> : null}
    <ol>{item.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
    {item.question && <p className="offline-question"><strong>一起想一想</strong>{item.question}</p>}
    {item.levels && <dl className="offline-levels">
      {item.levels.easier && <div><dt>简单一点</dt><dd>{item.levels.easier}</dd></div>}
      <div><dt>一起试试</dt><dd>按上面的步骤，跟随宝宝的节奏。</dd></div>
      {item.levels.harder && <div><dt>挑战一下</dt><dd>{item.levels.harder}</dd></div>}
    </dl>}
    {item.safety && <p className="safety">安全提醒：{item.safety}</p>}
  </article>)}</div>;
}

export function useMinuteRefresh() {
  const { refresh } = useApp();
  useEffect(() => {
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);
}
