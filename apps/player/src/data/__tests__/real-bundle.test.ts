// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalSource } from '../index';
import { childInput, json, MemoryStorage, NOW } from './fixtures';

const candidates = [
  ['播放端真实开发夹具', new URL('../../../dev-fixtures/sprout.core/bundle.json', import.meta.url)],
  ['生产内容 bundle', new URL('../../../../../content/packs/sprout-core/bundle.json', import.meta.url)],
] as const;

describe('真实内容包集成', () => {
  for (const [name, path] of candidates) {
    it.skipIf(!existsSync(path))(`${name} 能校验、排课、解析课程/词库/路线/音频`, async () => {
      const input: unknown = JSON.parse(readFileSync(path, 'utf8'));
      const source = new LocalSource({
        storage: new MemoryStorage(), fetch: async () => json(input), now: () => new Date(NOW),
      });
      const child = await source.saveChild(childInput());
      const [boot, routes, lessons, words, manifests] = await Promise.all([
        source.bootstrap(), source.routes(), source.lessons(), source.lexicon(), source.audioManifests(),
      ]);
      expect(boot.packs[0].lessonCount).toBe(lessons.length);
      expect(boot.packs[0].conceptCount).toBe(words.length);
      if (!routes.length) {
        expect(lessons).toEqual([]);
        await expect(source.today(child.id)).rejects.toMatchObject({ code: 'route-not-found' });
        return;
      }
      const plan = await source.today(child.id);
      expect(plan.items.length).toBeGreaterThan(0);
      const detail = await source.lesson(plan.items[0].lessonId);
      expect(detail.lesson.offline.length).toBeGreaterThan(0);
      expect(detail.lesson.steps.length).toBeGreaterThan(0);
      expect(plan.screen).toEqual(await source.screen(child.id));
      expect(words.every((word) => word.imageUrl.startsWith('./bundled/packs/sprout.core/'))).toBe(true);
      expect(manifests.every((entry) => entry.manifest.schemaVersion === 1)).toBe(true);
    });
  }
});
