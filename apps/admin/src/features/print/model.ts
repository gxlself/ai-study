import type { ConceptRef, Lesson, Printable, ResolvedConcept } from '@sprout/schema';
import { assetUrl, preferredConcepts } from '../content/model';
import { ENUM_LABELS } from '../content/schema';

export interface PrintBlock { lesson: Lesson; packId: string; printable: Printable }
export type PrintPage =
  | { kind: 'cards'; block: PrintBlock; items: ConceptRef[] }
  | { kind: 'contrast'; block: PrintBlock; pattern: Extract<Printable, { kind: 'contrast' }>['patterns'][number] };
export const CARDS_PER_PAGE = { large: 2, medium: 4, small: 8 } as const;

export function buildPrintPages(blocks: PrintBlock[]): PrintPage[] {
  return blocks.flatMap((block): PrintPage[] => {
    if (block.printable.kind === 'contrast') return block.printable.patterns.map((pattern) => ({ kind: 'contrast', block, pattern }));
    const size = CARDS_PER_PAGE[block.printable.size];
    const pages: PrintPage[] = [];
    for (let index = 0; index < block.printable.items.length; index += size) {
      pages.push({ kind: 'cards', block, items: block.printable.items.slice(index, index + size) });
    }
    return pages;
  });
}

export function resolvePrintConcept(ref: ConceptRef, packId: string, concepts: ResolvedConcept[]): {
  zh: string; en?: string; imageUrl?: string;
} | undefined {
  if (typeof ref === 'string') return preferredConcepts(concepts, packId).find((concept) => concept.id === ref);
  return { zh: ref.zh, en: ref.en, imageUrl: assetUrl(ref.image, packId, concepts) };
}

export function todayPrintPath(lessonIds: string[]): string | undefined {
  const [first, ...others] = [...new Set(lessonIds)];
  if (!first) return undefined;
  const params = new URLSearchParams();
  others.forEach((id) => params.append('lessonId', id));
  return `/admin/print/lesson/${encodeURIComponent(first)}${others.length ? `?${params}` : ''}`;
}

export interface PrintableThumbnail {
  key: string;
  name: string;
  imageUrl?: string;
  contrast?: { pattern: Extract<Printable, { kind: 'contrast' }>['patterns'][number]; palette: 'bw' | 'bwr' };
}

export function printableThumbnails(blocks: PrintBlock[], concepts: ResolvedConcept[]): PrintableThumbnail[] {
  const items = blocks.flatMap((block): PrintableThumbnail[] => {
    if (block.printable.kind === 'contrast') {
      const palette = block.printable.palette;
      return block.printable.patterns.map((pattern) => ({
        key: JSON.stringify(['contrast', pattern, palette]),
        name: `${palette === 'bw' ? '黑白' : '黑白红'}${ENUM_LABELS[pattern] ?? pattern}`,
        contrast: { pattern, palette },
      }));
    }
    return block.printable.items.map((ref) => {
      const concept = resolvePrintConcept(ref, block.packId, concepts);
      const name = concept?.zh ?? (typeof ref === 'string' ? `词条缺失：${ref}` : ref.zh);
      return { key: JSON.stringify(['cards', name, concept?.imageUrl]), name, imageUrl: concept?.imageUrl };
    });
  });
  return [...new Map(items.map((item) => [item.key, item])).values()];
}
