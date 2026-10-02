import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { PackRegistry, resolveStaticPath } from '../src/content/registry';
import { RegistryError, compareVersions } from '../src/content/files';
import { ZIP_LIMITS } from '../src/content/zip';
import {
  concept, image, json, lesson, manifest, packFiles, packZip, patchFirstZipSize, renameZipEntry, route, writeFiles,
} from './fixtures/content';

let root: string, content: string, data: string;
const create = (extra: Partial<ConstructorParameters<typeof PackRegistry>[0]> = {}) =>
  new PackRegistry({ dataDir: data, contentDirs: [content], ...extra });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sprout-content-'));
  content = join(root, 'content'); data = join(root, 'data');
  writeFiles(join(content, 'core'), packFiles({
    manifest: manifest('sprout.core', { routes: ['routes/mini.json'] }),
    extra: { 'routes/mini.json': json(route()), 'bundle.json': strToU8('{bad stale bundle') },
  }));
});
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

describe('PackRegistry source loading and indexing', () => {
  it('filters audience, validates parent-only activities and excludes invalid printable references', () => {
    const guide = lesson('mini.guide', {
      audience: 'parent', ageRange: [6, 17],
      steps: [{ type: 'guide', props: { goal: '实物陪玩', steps: [{ text: '一起看苹果', concept: 'apple' }] } }],
      printables: [{ kind: 'cards', title: '苹果卡', items: ['apple'], size: 'large', showText: true, showEnglish: true }],
    });
    writeFiles(join(content, 'core'), {
      'lessons/guide.json': json(guide),
      'lessons/too-young.json': json(lesson('mini.too-young', { ageRange: [17, 24] })),
      'lessons/bad-parent.json': json(lesson('mini.bad-parent', { audience: 'parent' })),
      'lessons/bad-print.json': json({ ...guide, id: 'mini.bad-print', printables: [{ kind: 'cards', title: '卡', items: ['missing'] }] }),
    });
    const registry = create();
    expect(registry.listLessons({ audience: 'parent' })).toHaveLength(1);
    expect(registry.listLessons({ audience: 'child' })).toHaveLength(1);
    expect(registry.lessonIndex()['mini.guide']).toMatchObject({ audience: 'parent', hasPrintables: true });
    expect(registry.lessonIndex()['mini.first']).toMatchObject({ audience: 'child', hasPrintables: false });
    expect(registry.getLesson('mini.too-young')).toBeUndefined();
    expect(registry.getLesson('mini.bad-parent')).toBeUndefined();
    expect(registry.getLesson('mini.bad-print')).toBeUndefined();
    expect(registry.validate('sprout.core').some((issue) => issue.path.includes('printables'))).toBe(true);
  });
  it('creates custom and loads only source lessons, with props defaults and route metadata', () => {
    const registry = create();
    expect(registry.list().map((pack) => pack.id)).toEqual(['sprout.core', 'sprout.custom']);
    const custom = registry.getPack('sprout.custom')!;
    expect(custom.info.source).toBe('custom');
    expect(custom.manifest.ageRange).toEqual([0, 72]);
    for (const path of ['pack.json', 'lexicon.json', 'lessons', 'assets/uploads', 'audio/manifest.json']) expect(existsSync(join(custom.dir, path))).toBe(true);
    expect(registry.lessonIndex()['mini.first'].cover?.imageUrl).toBe('/packs/sprout.core/assets/apple.svg');
    expect(registry.getLesson('mini.first')?.lesson.steps[0].props.show).toEqual({ text: true, english: true, pinyin: false });
    expect(registry.listRoutes()).toEqual([{ id: 'mini.route', title: { zh: '迷你路线' }, packId: 'sprout.core' }]);
    expect(registry.getRoute('mini.route')?.stages).toHaveLength(1);
    expect(registry.getRoute('missing')).toBeUndefined();
    expect(registry.validate('sprout.core')).toEqual([]);
  });

  it('accepts a contentDirs entry pointing directly at one pack', () => {
    expect(create({ contentDirs: [join(content, 'core')] }).listLessons()).toHaveLength(1);
  });

  it('filters lessons and concepts and returns defensive copies', () => {
    const registry = create();
    expect(registry.listLessons({ age: 18, domain: 'math', themeId: 'mini.theme', q: 'APPLE', packId: 'sprout.core' })).toHaveLength(1);
    expect(registry.listLessons({ age: 24 })).toHaveLength(1);
    expect(registry.listLessons({ age: 25 })).toEqual([]);
    expect(registry.listLessons({ domain: 'art' })).toEqual([]);
    expect(registry.listLessons({ themeId: 'missing' })).toEqual([]);
    expect(registry.listConcepts({ category: 'fruits', q: '苹果', packId: 'sprout.core' })[0].imageUrl).toBe('/packs/sprout.core/assets/apple.svg');
    expect(registry.listConcepts({ category: 'colors' })).toEqual([]);
    registry.getLesson('mini.first')!.lesson.title.zh = 'changed';
    registry.getPack('sprout.core')!.info.enabled = false;
    registry.listConcepts()[0].zh = 'changed';
    expect(registry.getLesson('mini.first')!.lesson.title.zh).toBe('看看苹果');
    expect(registry.listConcepts()[0].zh).toBe('苹果');
    expect(registry.getPack('sprout.core')!.info.enabled).toBe(true);
  });

  it('resolves concepts in own/core/enabled-other order and revalidates when another pack is disabled', () => {
    writeFiles(join(content, 'extra'), packFiles({
      manifest: manifest('acme.extra'), concepts: [concept('pear'), concept('apple', { image: 'assets/local.svg' })],
      lessons: [lesson('extra.first', { cover: { concept: 'apple' } })],
    }));
    writeFiles(join(content, 'dependent'), packFiles({
      manifest: manifest('acme.dependent'), concepts: [concept('banana')],
      lessons: [lesson('dependent.first', { steps: [{ type: 'word-cards', props: { items: ['banana', 'apple', 'pear'] } }] })],
    }));
    const registry = create();
    expect(registry.lessonIndex()['extra.first'].cover?.imageUrl).toBe('/packs/acme.extra/assets/local.svg');
    expect(registry.getLesson('dependent.first')).toBeDefined();
    registry.setEnabled('acme.extra', false);
    expect(registry.getLesson('dependent.first')).toBeUndefined();
    expect(registry.getPack('acme.dependent')!.info.errors?.join()).toContain('pear');
    registry.setEnabled('acme.extra', true);
    registry.setEnabled('sprout.core', false);
    expect(registry.getLesson('dependent.first')).toBeDefined();
    expect(registry.getLesson('mini.first')).toBeUndefined();
    expect(registry.listRoutes()).toEqual([]);
    expect(registry.listConcepts().some((item) => item.packId === 'sprout.core')).toBe(false);
    expect(create().getPack('sprout.core')!.info.enabled).toBe(false);
  });

  it('keeps invalid lessons out of the index but records JSON, schema and semantic issues', () => {
    writeFiles(join(content, 'core'), {
      'lessons/invalid.json': json(lesson('mini.invalid', { steps: [{ type: 'word-cards', props: { items: ['unknown'] } }] })),
      'lessons/broken.json': strToU8('{'),
      'lessons/constructor.json': json(lesson('mini.prototype', { steps: [{ type: 'constructor', props: {} }] })),
      'lessons/schema.json': json({ id: 'mini.missing' }),
    });
    const registry = create();
    expect(Object.keys(registry.lessonIndex())).toEqual(['mini.first']);
    expect(registry.getPack('sprout.core')!.info.errors?.length).toBeGreaterThanOrEqual(4);
    expect(registry.validate('sprout.core').some((issue) => issue.path.includes('broken.json'))).toBe(true);
    expect(registry.validate('sprout.core').some((issue) => issue.message.includes('unknown'))).toBe(true);
  });

  it('excludes every duplicate lesson id within a pack and tolerates an invalid manifest', () => {
    writeFiles(join(content, 'core'), { 'lessons/copy.json': json(lesson()) });
    writeFiles(join(content, 'broken'), { 'pack.json': strToU8('{') });
    const registry = create();
    expect(registry.getLesson('mini.first')).toBeUndefined();
    expect(registry.getPack('broken')!.info.errors?.length).toBeGreaterThan(0);
    expect(registry.listLessons()).toEqual([]);
  });

  it('retains warnings and validates enabled third-party props', () => {
    let valid: boolean | null = null;
    writeFiles(join(content, 'core'), {
      'lessons/plugin.json': json(lesson('mini.external', { steps: [{ type: 'acme.touch', props: {} }] })),
    });
    const registry = create({ validateExternal: () => valid === null ? null : valid ? [] :
      [{ path: 'title', level: 'error', message: '标题必填' }] });
    expect(registry.getLesson('mini.external')?.issues[0].level).toBe('warning');
    valid = false; registry.reload();
    expect(registry.getLesson('mini.external')).toBeUndefined();
    valid = true; registry.reload();
    expect(registry.getLesson('mini.external')?.issues).toEqual([]);
  });

  it('does not parse unchanged files again but detects changes and external enabled flags', () => {
    const flags = new Map<string, boolean>();
    const registry = create({ getEnabled: (id) => flags.get(id) ?? true, setEnabled: (id, enabled) => { flags.set(id, enabled); } });
    const spy = vi.spyOn(registry as unknown as { readPack: () => unknown }, 'readPack');
    const signature = registry.diskSignature();
    registry.reload(); registry.reload();
    expect(spy).not.toHaveBeenCalled();
    writeFiles(join(content, 'core'), { 'lessons/new.json': json(lesson('mini.new')) });
    expect(registry.diskSignature()).not.toBe(signature);
    registry.reload();
    expect(registry.getLesson('mini.new')).toBeDefined();
    flags.set('sprout.core', false); registry.reload();
    expect(registry.listLessons()).toEqual([]);
    registry.setEnabled('sprout.core', true);
    expect(flags.get('sprout.core')).toBe(true);
  });
});

describe('custom lessons and lexicon', () => {
  it('creates, updates and deletes custom lessons, including automatic ids', () => {
    const registry = create(), saved = registry.saveLesson(lesson('my.lesson'));
    expect(saved.lesson.id).toBe('custom.my.lesson');
    expect(saved.packId).toBe('sprout.custom');
    expect(saved.baseUrl).toBe('/packs/sprout.custom/');
    expect(existsSync(join(data, 'custom/lessons/custom.my.lesson.json'))).toBe(true);
    const updated = registry.saveLesson({ ...saved.lesson, title: { zh: '新的课程' } }, saved.lesson.id);
    expect(updated.lesson.title.zh).toBe('新的课程');
    const { id: _, ...withoutId } = lesson();
    expect(registry.saveLesson(withoutId).lesson.id).toMatch(/^custom\./);
    registry.deleteLesson(saved.lesson.id);
    expect(registry.getLesson(saved.lesson.id)).toBeUndefined();
  });

  it('never overwrites existing data on invalid saves and protects non-custom lessons', () => {
    const registry = create(), saved = registry.saveLesson(lesson());
    const file = join(data, 'custom/lessons', `${saved.lesson.id}.json`);
    const before = readFileSync(file, 'utf8');
    expect(() => registry.saveLesson({ ...saved.lesson, offline: [] }, saved.lesson.id)).toThrow(RegistryError);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(() => registry.saveLesson(lesson())).toThrow(expect.objectContaining({ statusCode: 409 }));
    expect(() => registry.saveLesson(lesson(), 'mini.first')).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => registry.deleteLesson('mini.first')).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => registry.saveLesson(lesson('../escape'))).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => registry.saveLesson(null)).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => registry.deleteLesson('missing')).toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it('can repair a malformed custom source by its valid id', () => {
    const registry = create();
    writeFiles(join(data, 'custom'), { 'lessons/broken.json': json({ id: 'custom.broken' }) });
    registry.reload();
    expect(registry.getLesson('custom.broken')).toBeUndefined();
    expect(registry.saveLesson(lesson('custom.broken'), 'custom.broken').lesson.id).toBe('custom.broken');
  });

  it('creates and updates concepts, refuses unsafe paths and prevents dangling deletions', () => {
    const registry = create();
    const saved = registry.saveConcept(concept('custom-pear'));
    expect(saved.imageUrl).toBe('/packs/sprout.custom/assets/custom-pear.svg');
    expect(registry.saveConcept({ ...saved, zh: '梨子' }, saved.id).zh).toBe('梨子');
    expect(() => registry.saveConcept(concept('custom-pear'))).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => registry.saveConcept(concept('apple'), 'apple')).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => registry.saveConcept(concept('bad', { image: '..\\outside' }))).toThrow(expect.objectContaining({ statusCode: 400 }));
    registry.saveLesson(lesson('pear', { cover: { concept: 'custom-pear' }, steps: [{ type: 'word-cards', props: { items: ['custom-pear'] } }] }));
    expect(() => registry.deleteConcept(saved.id)).toThrow(expect.objectContaining({ statusCode: 400, issues: expect.any(Array) }));
    registry.deleteLesson('custom.pear');
    registry.deleteConcept(saved.id);
    expect(registry.listConcepts({ packId: 'sprout.custom' })).toEqual([]);
  });

  it('duplicates a lesson with isolated images and concept references', () => {
    const registry = create(), copy = registry.duplicateLesson('mini.first');
    expect(copy.lesson.id).toMatch(/^custom\./);
    expect(copy.lesson.title.zh).toContain('副本');
    const ref = (copy.lesson.steps[0].props.items as string[])[0];
    expect(ref).toMatch(/^custom\./);
    const saved = registry.listConcepts({ packId: 'sprout.custom' }).find((item) => item.id === ref)!;
    expect(readFileSync(join(data, 'custom', saved.image), 'utf8')).toBe(image);
    registry.setEnabled('sprout.core', false);
    expect(registry.getLesson(copy.lesson.id)).toBeDefined();
    expect(copy.lesson.cover?.concept).toBe(ref);
  });

  it('copies parent guide printable concepts and assets independently of the source pack', () => {
    writeFiles(join(content, 'core'), { 'lessons/parent.json': json(lesson('mini.printable', {
      audience: 'parent', ageRange: [6, 17],
      steps: [{ type: 'guide', props: { goal: '实物陪玩', steps: [{ text: '一起观察', concept: 'apple' }] } }],
      printables: [
        { kind: 'cards', title: '苹果卡', items: ['apple', { zh: '苹果', en: 'apple', image: 'assets/apple.svg' }], size: 'large', showText: true, showEnglish: true },
        { kind: 'contrast', title: '对比卡', patterns: ['circle'], palette: 'bw' },
      ],
      offline: [{ title: '陪玩', steps: ['找找实物'], question: '在哪儿？', levels: { easier: '一张', harder: '两张' } }],
    })) });
    const registry = create();
    const copy = registry.duplicateLesson('mini.printable');
    expect(copy.lesson.audience).toBe('parent');
    const cards = copy.lesson.printables![0];
    expect(cards.kind).toBe('cards');
    if (cards.kind !== 'cards') throw new Error('缺少卡片');
    expect(cards.items[0]).toMatch(/^custom\./);
    const inline = cards.items[1];
    if (typeof inline === 'string') throw new Error('缺少内联卡片');
    expect(readFileSync(join(data, 'custom', inline.image), 'utf8')).toBe(image);
    expect(copy.lesson.offline[0]).toMatchObject({ question: '在哪儿？', levels: { easier: '一张', harder: '两张' } });
    rmSync(join(content, 'core'), { recursive: true });
    registry.reload();
    expect(registry.getLesson(copy.lesson.id)).toBeDefined();
    expect(registry.lessonIndex()[copy.lesson.id].hasPrintables).toBe(true);
  });

  it('preserves choose option ids and pattern answers when duplicating', () => {
    writeFiles(join(content, 'core'), { 'lessons/choice.json': json(lesson('mini.choice', {
      steps: [
        { type: 'choose', props: { rounds: [{ prompt: { zh: '找苹果' }, options: [{ id: 'apple', concept: 'apple' }, 'apple'], answer: 'apple' }] } },
        { type: 'pattern', props: { rounds: [{ sequence: ['apple', 'apple', 'apple'], options: ['apple', 'apple'], answer: 'apple' }] } },
      ],
    })) });
    const registry = create(), copy = registry.duplicateLesson('mini.choice');
    expect(copy.issues).toEqual([]);
    const round = (copy.lesson.steps[1].props.rounds as { answer: string; options: string[] }[])[0];
    expect(round.options).toContain(round.answer);
  });

  it('validates all snapshot content before writing and never uses the stale custom lexicon', () => {
    const registry = create();
    registry.saveConcept(concept('pear'));
    registry.saveLesson(lesson('pear', { steps: [{ type: 'word-cards', props: { items: ['pear'] } }] }));
    const before = registry.customSnapshot();
    expect(() => registry.restoreCustom({ ...before, lexicon: { schemaVersion: 1, concepts: [] } })).toThrow(RegistryError);
    expect(registry.customSnapshot()).toEqual(before);
    expect(() => registry.restoreCustom({ ...before, lessons: [lesson('not-custom')] })).toThrow(RegistryError);
    expect(() => registry.restoreCustom({ ...before, lessons: [before.lessons[0], before.lessons[0]] })).toThrow(RegistryError);
    expect(registry.customSnapshot()).toEqual(before);
    const good = { lessons: [lesson('custom.restored')], lexicon: { schemaVersion: 1 as const, concepts: [] } };
    expect(registry.validateCustomSnapshot(good).lessons[0].steps[0].props.show).toBeDefined();
    writeFiles(join(data, 'custom'), { 'assets/uploads/keep.svg': strToU8(image) });
    registry.restoreCustom(good);
    expect(registry.getLesson('custom.pear')).toBeUndefined();
    expect(registry.getLesson('custom.restored')).toBeDefined();
    expect(existsSync(join(data, 'custom/assets/uploads/keep.svg'))).toBe(true);
    expect(create().getLesson('custom.restored')).toBeDefined();
  });
});

describe('pack ZIP import and export', () => {
  const extra = (version = '1.0.0') => ({
    manifest: manifest('acme.pack', { version }), lessons: [lesson('extra.lesson')],
  });

  it('imports a wrapped ZIP, exports source and assets, persists across reload and deletes installed only', () => {
    const registry = create(), info = registry.importZip(packZip(extra(), 'wrapper/'));
    expect(info).toMatchObject({ id: 'acme.pack', source: 'installed', lessonCount: 1, enabled: true });
    expect(registry.getPack(info.id)?.dir).toBe(realpathSync(join(data, 'packs/acme.pack')));
    expect(Object.keys(unzipSync(registry.exportZip(info.id)))).toContain('assets/apple.svg');
    expect(create().getLesson('extra.lesson')).toBeDefined();
    expect(() => registry.deletePack('sprout.core')).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => registry.deletePack('sprout.custom')).toThrow(expect.objectContaining({ statusCode: 403 }));
    registry.deletePack(info.id);
    expect(existsSync(join(data, 'packs/acme.pack'))).toBe(false);
    expect(registry.getPack(info.id)).toBeUndefined();
  });

  it('replaces only with a greater semver and preserves disabled state', () => {
    const registry = create();
    registry.importZip(packZip(extra('1.0.0-beta.2')));
    registry.setEnabled('acme.pack', false);
    expect(registry.importZip(packZip(extra('1.0.0-beta.11'))).enabled).toBe(false);
    expect(registry.importZip(packZip(extra('1.0.0'))).version).toBe('1.0.0');
    expect(() => registry.importZip(packZip(extra()))).toThrow(expect.objectContaining({ statusCode: 409 }));
    expect(() => registry.importZip(packZip(extra('1.0.0-beta.99')))).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  it('leaves the old directory and index intact if the new package is invalid', () => {
    const registry = create();
    registry.importZip(packZip(extra()));
    const before = readFileSync(join(data, 'packs/acme.pack/pack.json'), 'utf8');
    const invalid = { ...extra('2.0.0'), lessons: [lesson('extra.lesson', { steps: [{ type: 'word-cards', props: { items: ['missing'] } }] })] };
    expect(() => registry.importZip(packZip(invalid))).toThrow(expect.objectContaining({ statusCode: 400, issues: expect.any(Array) }));
    expect(readFileSync(join(data, 'packs/acme.pack/pack.json'), 'utf8')).toBe(before);
    expect(registry.getLesson('extra.lesson')).toBeDefined();
    expect(() => registry.importZip(packZip({ manifest: manifest('sprout.custom', { version: '10.0.0' }) }))).toThrow(RegistryError);
    expect(() => registry.importZip(packZip({ ...extra('2.0.0'), lessons: [lesson()] }))).toThrow(RegistryError);
  });

  it.each(['../outside', '/absolute', 'C:/drive', 'dir\\file', 'dir/../file', 'dir/%2e%2e/file'])('rejects unsafe ZIP path %s before extracting', (path) => {
    const registry = create();
    expect(() => registry.importZip(zipSync({ ...packFiles(extra()), [path]: strToU8('x') }))).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(registry.getPack('acme.pack')).toBeUndefined();
    expect(existsSync(join(data, 'outside'))).toBe(false);
  });

  it('rejects exact duplicate paths, case collisions, file-parent collisions and links', () => {
    const registry = create(), files = packFiles(extra());
    const duplicate = renameZipEntry(zipSync({ ...files, 'same-a': strToU8('a'), 'same-b': strToU8('b') }), 'same-b', 'same-a');
    expect(() => registry.importZip(duplicate)).toThrow(RegistryError);
    expect(() => registry.importZip(zipSync({ ...files, 'same-A': strToU8('a'), 'same-a': strToU8('b') }))).toThrow(RegistryError);
    expect(() => registry.importZip(zipSync({ ...files, 'parent': strToU8('a'), 'parent/child': strToU8('b') }))).toThrow(RegistryError);
    expect(() => registry.importZip(zipSync({ ...files, link: [strToU8('../../outside'), { os: 3, attrs: 0o120777 << 16 }] }))).toThrow(RegistryError);
  });

  it('limits advertised and actual expanded sizes, verifies checksums, and rejects invalid archive shapes', () => {
    const registry = create();
    expect(() => registry.importZip(patchFirstZipSize(packZip(extra()), ZIP_LIMITS.fileBytes + 1))).toThrow(expect.objectContaining({ statusCode: 413 }));
    expect(() => registry.importZip(patchFirstZipSize(packZip(extra()), 1))).toThrow(expect.objectContaining({ statusCode: 400 }));
    const corrupt = Buffer.from(packZip(extra()));
    const central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const local = corrupt.readUInt32LE(central + 42);
    corrupt.writeUInt32LE(123, central + 16); corrupt.writeUInt32LE(123, local + 14);
    expect(() => registry.importZip(corrupt)).toThrow(RegistryError);
    expect(() => registry.importZip(new Uint8Array())).toThrow(RegistryError);
    expect(() => registry.importZip(packZip(extra(), 'a/b/'))).toThrow(RegistryError);
    expect(() => registry.importZip(zipSync({ 'no-manifest': strToU8('a') }))).toThrow(RegistryError);
  });

  it('rejects filesystem symlinks for import destination, export and static paths', () => {
    const registry = create(), outside = join(root, 'secret.txt');
    writeFileSync(outside, 'private');
    symlinkSync(outside, join(content, 'core/assets/link.txt'));
    expect(() => registry.exportZip('sprout.core')).toThrow(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    expect(() => resolveStaticPath(join(content, 'core'), 'assets/link.txt')).toThrow(expect.objectContaining({ code: 'UNSAFE_PATH' }));
    symlinkSync(join(content, 'core'), join(data, 'packs/acme.pack'));
    expect(() => registry.importZip(packZip(extra()))).toThrow(expect.objectContaining({ code: 'UNSAFE_PATH' }));
  });
});

describe('static path helper and semver', () => {
  it.each(['../secret', '/absolute', 'a\\b', '%2e%2e/secret', '%252e%252e/secret', 'a/%2fsecret', 'C:/drive', 'a%00b', '%ZZ'])('rejects %s', (path) => {
    expect(() => resolveStaticPath(join(content, 'core'), path)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
  it('returns a safe existing path and undefined for missing paths or directories', () => {
    expect(resolveStaticPath(join(content, 'core'), 'assets/apple.svg')).toBe(join(content, 'core/assets/apple.svg'));
    expect(resolveStaticPath(join(content, 'core'), 'assets')).toBeUndefined();
    expect(resolveStaticPath(join(content, 'core'), 'absent.svg')).toBeUndefined();
  });
  it.each([
    ['1.0.0', '1.0.0-alpha'], ['1.0.1', '1.0.0'], ['2.0.0', '1.99.99'],
    ['1.0.0-beta.11', '1.0.0-beta.2'], ['1.0.0-alpha.beta', '1.0.0-alpha.1'], ['1.0.0-alpha.1', '1.0.0-alpha'],
  ])('compares %s after %s', (a, b) => {
    expect(compareVersions(a, b)).toBe(1); expect(compareVersions(b, a)).toBe(-1); expect(compareVersions(a, a)).toBe(0);
  });
});
