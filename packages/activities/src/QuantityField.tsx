import type { CSSProperties } from 'react';
import type { ConceptRef } from '@sprout/schema';
import type { ActivityContext } from '@sprout/plugin-sdk';
import { ConceptImage } from './shared';

type Layout = 'row' | 'scatter' | 'dice' | 'ten-frame' | 'line' | 'random';

export function quantityPositions(count: number, layout: Layout): [number, number][] {
  if (layout === 'line' || layout === 'row') {
    return Array.from({ length: count }, (_, i) => [100 * (i + 0.5) / count, 50]);
  }
  if (layout === 'dice' && count <= 6) {
    const patterns: Record<number, [number, number][]> = {
      1: [[50, 50]], 2: [[30, 28], [70, 72]],
      3: [[30, 28], [50, 50], [70, 72]],
      4: [[30, 28], [70, 28], [30, 72], [70, 72]],
      5: [[30, 28], [70, 28], [50, 50], [30, 72], [70, 72]],
      6: [[30, 22], [70, 22], [30, 50], [70, 50], [30, 78], [70, 78]],
    };
    return patterns[count] ?? [];
  }
  const columns = layout === 'ten-frame' ? 5 : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) => {
    const jitter = layout === 'scatter' || layout === 'random' ? ((i * 7 + count * 3) % 5) - 2 : 0;
    return [(i % columns + 0.5) * 100 / columns + jitter, (Math.floor(i / columns) + 0.5) * 100 / rows + jitter];
  });
}

export function QuantityField({ ctx, count, item, layout = 'dice', activeCount = 0, numbered = false, onTap, disabled = false }: {
  ctx: ActivityContext<any>; count: number; item?: ConceptRef; layout?: Layout;
  activeCount?: number; numbered?: boolean; onTap?(): void; disabled?: boolean;
}) {
  const width = layout === 'line' || layout === 'row' ? Math.min(24, 88 / count) : layout === 'ten-frame' ? 15 : count <= 4 ? 24 : 17;
  return <div className={`spa-quantities spa-layout-${layout}`} style={{ '--spa-object-width': `${width}%` } as CSSProperties}>
    {layout === 'ten-frame' && <div className="spa-ten-frame" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => <span key={i} />)}
    </div>}
    {quantityPositions(count, layout).map(([left, top], index) => {
      const contents = <>
        <ConceptImage ctx={ctx} concept={item} />
        {numbered && index < activeCount && <span className="spa-count-badge">{index + 1}</span>}
      </>;
      const className = `spa-quantity ${index < activeCount ? 'is-counted' : ''} ${index === activeCount - 1 ? 'is-current' : ''}`;
      const style = { left: `${left}%`, top: `${top}%` };
      return onTap
        ? <button key={index} type="button" data-focusable className={className} style={style}
          aria-label={String(index + 1)} disabled={disabled} onClick={onTap}>{contents}</button>
        : <span key={index} className={className} style={style}>{contents}</span>;
    })}
  </div>;
}
