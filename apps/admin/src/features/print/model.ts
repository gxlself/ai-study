import type { ConceptRef, Lesson, Printable, ResolvedConcept } from '@sprout/schema';
import { assetUrl, preferredConcepts } from '../content/model';

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
