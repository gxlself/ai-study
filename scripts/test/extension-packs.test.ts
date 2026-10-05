import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { failure } from '../lib/cli';
import { REPO_ROOT } from '../lib/io';
import { inspectPack } from '../lib/validate-pack';

describe('正式无路线扩展包', () => {
  it.each([
    { directory: 'sprout-culture', id: 'sprout.culture', lessons: 20 },
    { directory: 'sprout-english', id: 'sprout.english', lessons: 12 },
  ])('$id 的严格校验无错误、无警告且音频可选', async ({ directory, id, lessons }) => {
    const result = await inspectPack(path.join(REPO_ROOT, 'content/packs', directory));
    expect(result.manifest?.id).toBe(id);
    expect(result.manifest?.routes).toEqual([]);
    expect(result.routes).toEqual([]);
    expect(result.validLessons).toHaveLength(lessons);
    expect(result.issues).toEqual([]);
    expect(failure(result.issues, true)).toBe(false);
    expect(result.audioCoverage.total).toBeGreaterThan(0);
    expect(result.audioCoverage.present).toBe(0);
    expect(result.audioCoverage.missing).toHaveLength(result.audioCoverage.total);
  });
});
