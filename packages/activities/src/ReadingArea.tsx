import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';

export function scrollReadingArea(element: HTMLElement | null, direction: 'up' | 'down', reducedMotion = false): boolean {
  if (!element || element.scrollHeight <= element.clientHeight + 2) return false;
  const distance = Math.max(80, element.clientHeight * 0.65);
  const top = Math.max(0, Math.min(element.scrollHeight - element.clientHeight,
    element.scrollTop + (direction === 'down' ? distance : -distance)));
  if (typeof element.scrollTo === 'function') element.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  else element.scrollTop = top;
  return true;
}

export function ReadingArea({ children, areaRef, label, className = '' }: {
  children: ReactNode;
  areaRef: RefObject<HTMLDivElement | null>;
  label: string;
  className?: string;
}) {
  const [overflow, setOverflow] = useState(false);
  const [more, setMore] = useState(false);
  function measure() {
    const area = areaRef.current;
    if (!area) return;
    setOverflow(area.scrollHeight > area.clientHeight + 2);
    setMore(area.scrollHeight - area.scrollTop > area.clientHeight + 2);
  }
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    measure();
    const resize = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(measure) : null;
    resize?.observe(area);
    for (const child of Array.from(area.children)) resize?.observe(child);
    const mutation = new window.MutationObserver(measure);
    mutation.observe(area, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', measure);
    area.addEventListener('load', measure, true);
    return () => {
      resize?.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', measure);
      area.removeEventListener('load', measure, true);
    };
  }, [areaRef, children]);
  return <div className="spa-reading-viewport">
    <div ref={areaRef} className={`spa-reading-area ${className}`} role="region" aria-label={label}
      tabIndex={overflow ? 0 : undefined} data-focusable={overflow || undefined} onScroll={measure}>
      {children}
    </div>
    <p className="spa-reading-more" hidden={!more} aria-hidden="true">↓ 还有内容</p>
  </div>;
}
