import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { DatabaseSync } from 'node:sqlite';
import type { Concept, Lesson, PackManifest, PluginManifest, Route } from '@sprout/schema';

export const image = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="green"/></svg>';
export const json = (value: unknown): Uint8Array => strToU8(JSON.stringify(value));

export function concept(id = 'apple', extra: Partial<Concept> = {}): Concept {
  return { id, category: 'fruits', zh: '苹果', en: 'apple', image: `assets/${id}.svg`, ...extra };
}

export function lesson(id = 'mini.first', extra: Partial<Lesson> = {}): Lesson {
  return {
    schemaVersion: 1, id, title: { zh: '看看苹果', en: 'An Apple' }, ageRange: [18, 24],
    domains: ['language', 'math'], durationMin: 3, coView: 'required',
    objectives: [{ zh: '认识苹果' }], parentGuide: { intro: '陪宝宝一起看一看。' },
    offline: [{ title: '摸一摸', steps: ['家长陪伴，触摸洗净的苹果。'] }],
    steps: [{ type: 'word-cards', props: { items: ['apple'] } }],
    cover: { concept: 'apple' }, themeId: 'mini.theme', ...extra,
  };
}

export function manifest(id = 'sprout.core', extra: Partial<PackManifest> = {}): PackManifest {
  return {
    schemaVersion: 1, id, version: '1.0.0', name: { zh: '迷你内容包' }, ageRange: [6, 36],
    lexicon: 'lexicon.json', routes: [], lessonsDir: 'lessons', credits: [], ...extra,
  };
}

export function route(lessonId = 'mini.first'): Route {
  return {
    schemaVersion: 1, id: 'mini.route', title: { zh: '迷你路线' },
    stages: [{
      id: 'mini.stage', title: { zh: '第一阶段' }, ageRange: [12, 24], focus: [{ zh: '共同观察' }],
      screen: { sessionMaxMin: 5, dailyMaxMin: 10, lessonsPerDay: 1, coView: 'required' },
      themes: [{ id: 'mini.theme', title: { zh: '水果' }, weeks: 1, domains: ['language'], lessons: [lessonId] }],
    }],
  };
}

export function packFiles(options: {
  manifest?: PackManifest; lessons?: unknown[]; concepts?: Concept[]; extra?: Record<string, Uint8Array>;
} = {}): Record<string, Uint8Array> {
  const concepts = options.concepts ?? [concept()];
  return {
    'pack.json': json(options.manifest ?? manifest()),
    'lexicon.json': json({ schemaVersion: 1, concepts }),
    'audio/manifest.json': json({ schemaVersion: 1, voices: {}, entries: {} }),
    ...Object.fromEntries(concepts.map((item) => [item.image, strToU8(image)])),
    ...Object.fromEntries((options.lessons ?? [lesson()]).map((item, index) => [`lessons/nested/${index}.json`, json(item)])),
    ...options.extra,
  };
}

export function writeFiles(directory: string, files: Record<string, Uint8Array>): void {
  mkdirSync(directory, { recursive: true });
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), bytes);
  }
}

export function packZip(options: Parameters<typeof packFiles>[0] = {}, prefix = ''): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(packFiles(options)).map(([path, value]) => [`${prefix}${path}`, value])));
}

export function plugin(extra: Partial<PluginManifest> = {}): PluginManifest {
  return {
    schemaVersion: 1, id: 'acme.demo', version: '1.0.0', sdk: '^1.0.0',
    name: { zh: '轻触互动' }, entry: 'dist/index.js', permissions: [],
    activities: [{
      type: 'acme.touch', name: { zh: '轻触' },
      propsSchema: {
        type: 'object', required: ['title', 'rounds'],
        properties: {
          title: { type: 'string' },
          rounds: { type: 'array', items: {
            type: 'object', required: ['count'], properties: { count: { type: 'integer' } },
          } },
          hint: { type: ['string', 'null'] },
          flags: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
        },
      },
    }], ...extra,
  };
}

export function pluginZip(manifest = plugin(), extra: Zippable = {}, prefix = ''): Uint8Array {
  const files = {
    'plugin.json': json(manifest), 'dist/index.js': strToU8('export default { type: "acme.touch", mount() {} };'), ...extra,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [`${prefix}${path}`, value])));
}

export function pluginDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE plugins (
    id TEXT PRIMARY KEY, manifest TEXT NOT NULL, source TEXT NOT NULL, enabled INTEGER NOT NULL,
    manifest_url TEXT, directory TEXT
  )`);
  return db;
}

export function renameZipEntry(bytes: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error('测试用条目必须等长');
  const copy = Buffer.from(bytes), before = Buffer.from(from), after = Buffer.from(to);
  for (let at = copy.indexOf(before); at >= 0; at = copy.indexOf(before, at + after.length)) after.copy(copy, at);
  return copy;
}

export function patchFirstZipSize(bytes: Uint8Array, size: number): Uint8Array {
  const copy = Buffer.from(bytes);
  const central = copy.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const local = copy.readUInt32LE(central + 42);
  copy.writeUInt32LE(size, central + 24);
  copy.writeUInt32LE(size, local + 22);
  return copy;
}
