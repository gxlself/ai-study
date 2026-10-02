import { describe, expect, it, vi } from 'vitest';
import { summarizeLesson } from '../src';
import { deepFreeze, makeLesson } from './fixtures';

describe('summarizeLesson', () => {
  it('preserves public metadata, resolves a pack-relative cover and deduplicates step types in order', () => {
    const lesson = deepFreeze(makeLesson({
      summary: { zh: 'Summary', en: 'Summary' },
      themeId: 'test.theme',
      tags: ['one', 'two'],
      cover: { image: 'assets/cover.svg', concept: 'cover-concept', bg: '#fff' },
      domains: ['language', 'math'],
      steps: [
        { type: 'word-cards', props: {} },
        { type: 'calm', props: {} },
        { type: 'word-cards', props: {} },
        { type: 'test.plugin', props: {} },
      ],
    }));
    expect(summarizeLesson(lesson, 'test.pack')).toEqual({
      id: lesson.id,
      packId: 'test.pack',
      title: lesson.title,
      summary: lesson.summary,
      ageRange: lesson.ageRange,
      domains: lesson.domains,
      themeId: 'test.theme',
      durationMin: 4,
      coView: 'required',
      audience: 'child',
      hasPrintables: false,
      tags: ['one', 'two'],
      cover: { ...lesson.cover, imageUrl: '/packs/test.pack/assets/cover.svg' },
      stepTypes: ['word-cards', 'calm', 'test.plugin'],
    });
  });

  it('uses the caller resolver for offline pack assets', () => {
    const resolve = vi.fn((path: string) => `offline/${path}`);
    const lesson = makeLesson({ cover: { image: 'assets/cover.svg' } });
    expect(summarizeLesson(lesson, 'test.pack', resolve).cover?.imageUrl).toBe('offline/assets/cover.svg');
    expect(resolve).toHaveBeenCalledExactlyOnceWith('assets/cover.svg');
  });

  it.each(['https://example.test/cover.svg', '/packs/other/cover.svg', 'data:image/svg+xml,test', 'blob:cover'])(
    'does not prepend a pack URL to an already resolved cover: %s',
    (image) => {
      expect(summarizeLesson(makeLesson({ cover: { image } }), 'test.pack').cover?.imageUrl).toBe(image);
    },
  );

  it('keeps concept-only covers without inventing an image path', () => {
    const resolver = vi.fn();
    expect(summarizeLesson(makeLesson({ cover: { concept: 'one', bg: '#fff' } }), 'test.pack', resolver).cover)
      .toEqual({ concept: 'one', bg: '#fff' });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('omits absent optional fields and excludes lesson detail payloads', () => {
    const summary = summarizeLesson(makeLesson(), 'test.pack');
    expect(Object.keys(summary).sort()).toEqual([
      'ageRange', 'audience', 'coView', 'domains', 'durationMin', 'hasPrintables', 'id', 'packId', 'stepTypes', 'title',
    ]);
  });

  it('does not alias mutable summary metadata back to the lesson', () => {
    const lesson = makeLesson({
      summary: { zh: 'Summary' }, cover: { image: 'cover.svg' }, tags: ['original'],
    });
    const original = structuredClone(lesson);
    const summary = summarizeLesson(lesson, 'test.pack');
    summary.title.zh = 'Changed';
    summary.summary!.zh = 'Changed';
    summary.ageRange[0] = 0;
    summary.domains.push('math');
    summary.tags!.push('new');
    summary.cover!.image = 'other.svg';
    expect(lesson).toEqual(original);
  });
});
