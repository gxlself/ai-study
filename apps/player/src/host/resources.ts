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

function localMedia(path: string): boolean {
  if (/^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|audio\/[\w.+-]+)[;,]/i.test(path)) return true;
  if (!path.startsWith('blob:')) return false;
  try { return new URL(path).origin === globalThis.location?.origin; } catch { return false; }
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
    if (localMedia(path)) return path;
    try { return options.resolveAsset(packId, path); } catch { return ''; }
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
export const PRELOAD_MAX_BYTES = 2 * 1024 * 1024;
export const PRELOAD_MAX_TOTAL_BYTES = 8 * 1024 * 1024;

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
          if (typeof url !== 'string' || !url.trim() || /^(data:|blob:)/i.test(url)) continue;
          const resolved = helpers.resolveAsset(url);
          if (resolved && urls.size < 64) urls.add(resolved);
        }
      } catch {
        // 单个插件预加载失败不阻塞其它步骤。
      }
    }
    if (signal.aborted) {
      finish();
      return;
    }
    const queue = [...urls];
    let total = 0;
    const worker = async () => {
      while (queue.length && !controller.signal.aborted) {
        const url = queue.shift()!;
        try {
          const response = await fetch(url, {
            signal: controller.signal, cache: 'force-cache', redirect: 'error',
            credentials: 'omit', referrerPolicy: 'no-referrer',
          });
          const expected = new URL(url, globalThis.location?.href ?? 'http://localhost/').href;
          const length = Number(response.headers?.get('content-length'));
          if (!response.ok || response.redirected || (response.url && response.url !== expected) ||
            (Number.isFinite(length) && length > PRELOAD_MAX_BYTES)) {
            await response.body?.cancel();
            continue;
          }
          // 不使用无界 arrayBuffer；旧浏览器没有流接口时放弃预加载。
          const reader = response.body?.getReader();
          if (!reader) continue;
          let bytes = 0;
          try {
            while (!controller.signal.aborted) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              total += chunk.value.byteLength;
              if (bytes > PRELOAD_MAX_BYTES || total > PRELOAD_MAX_TOTAL_BYTES) break;
            }
          } finally { await reader.cancel().catch(() => {}); }
        } catch {
          // 网络与素材错误不阻止开始活动。
        }
      }
    };
    void Promise.allSettled(Array.from({ length: Math.min(4, queue.length) }, worker)).then(finish);
  });
}
