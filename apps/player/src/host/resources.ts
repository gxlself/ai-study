import type { ConceptRef, Lesson, ResolvedConcept } from '@sprout/schema';
import type { ActivityPlugin, ConceptView } from '../../../../packages/plugin-sdk/src/types';

export interface ResourceOptions {
  packId: string;
  concepts: ResolvedConcept[];
  resolveAsset: (packId: string, path: string) => string;
}

export interface ActivityResources {
  resolveAsset(path: string): string;
  concept(ref: ConceptRef): ConceptView | undefined;
}

function isAbsoluteAsset(path: string): boolean {
  return /^(https?:|data:|blob:|\/\/)/i.test(path);
}

export function createResources(options: ResourceOptions): ActivityResources {
  const concepts = new Map<string, ResolvedConcept>();
  const rank = (packId: string) => packId === options.packId ? 0 : packId === 'sprout.core' ? 1 : 2;
  for (const item of options.concepts) {
    const previous = concepts.get(item.id);
    if (!previous || rank(item.packId) < rank(previous.packId)) concepts.set(item.id, item);
  }

  function asset(packId: string, path: string): string {
    if (!path) return '';
    if (path.startsWith('concept:')) {
      const item = concepts.get(path.slice('concept:'.length));
      return item ? asset(item.packId, item.imageUrl || item.image) : '';
    }
    return isAbsoluteAsset(path) ? path : options.resolveAsset(packId, path);
  }

  return {
    resolveAsset: (path) => asset(options.packId, path),
    concept(ref) {
      if (typeof ref !== 'string') {
        return {
          id: ref.id ?? `inline:${ref.zh}:${ref.image}`,
          zh: ref.zh,
          en: ref.en ?? '',
          pinyin: ref.pinyin,
          imageUrl: asset(options.packId, ref.image),
          sound: ref.sound,
          phrase: ref.phrase,
        };
      }
      const item = concepts.get(ref);
      if (!item) return undefined;
      return {
        id: item.id,
        category: item.category,
        zh: item.zh,
        en: item.en,
        pinyin: item.pinyin,
        imageUrl: asset(item.packId, item.imageUrl || item.image),
        sound: item.sound,
        phrase: item.phrase,
        color: item.color,
        value: item.value,
        measure: item.measure,
        plural: item.plural,
      };
    },
  };
}

export const PRELOAD_TIMEOUT_MS = 8_000;

export async function preloadLesson(
  lesson: Lesson,
  registry: { get(type: string): ActivityPlugin | undefined },
  helpers: ActivityResources,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted || typeof globalThis.fetch !== 'function') return;
  await new Promise<void>((resolve) => {
    const controller = new AbortController();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      controller.abort();
      resolve();
    };
    const timeout = setTimeout(finish, PRELOAD_TIMEOUT_MS);
    signal.addEventListener('abort', finish, { once: true });
    const urls = new Set<string>();
    for (const step of lesson.steps) {
      if (signal.aborted) break;
      try {
        for (const url of registry.get(step.type)?.preload?.(step.props, helpers) ?? []) {
          if (typeof url === 'string' && url.trim()) urls.add(url);
        }
      } catch {
        // 单个插件预加载失败不阻塞其它步骤。
      }
    }
    if (signal.aborted) {
      finish();
      return;
    }
    const jobs = [...urls].map(async (url) => {
      const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
      if (response.ok) await response.arrayBuffer();
    });
    void Promise.allSettled(jobs).then(finish);
  });
}
