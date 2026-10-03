import {
  copyFileSync, existsSync, lstatSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  AudioManifest, BUILTIN_ACTIVITY_TYPES, Concept, Id, Lesson, Lexicon, PackManifest, Route,
  validateConcepts, validateLesson, type LessonSummary, type PackInfo, type ResolvedConcept, type ValidationIssue,
} from '@sprout/schema';
import {
  RegistryError, assetUrl, compareVersions, ensureDirectory, ensureRoot, guard, hasErrors, issuesOf,
  makeStage, parse, readJson, replaceDirectory, safePath, safeRelativePath, validationError, walkFiles, writeJson,
} from './files';
import { extractFiles, exportDirectory, readZip, ZIP_LIMITS } from './zip';

export { resolveStaticPath, safePath, RegistryError } from './files';

export interface PackRegistryOptions {
  dataDir: string;
  contentDirs: string[];
  getEnabled?: (id: string) => boolean;
  setEnabled?: (id: string, enabled: boolean) => void;
  validateExternal?: (type: string, props: unknown) => ValidationIssue[] | null;
}
export interface LessonResult { lesson: Lesson; packId: string; baseUrl: string; issues: ValidationIssue[] }
export interface CustomSnapshot { lessons: Lesson[]; lexicon: Lexicon }
export interface LessonFilters { age?: number; domain?: string; q?: string; packId?: string; themeId?: string; audience?: 'parent' | 'child' }
export interface ConceptFilters { packId?: string; category?: string; q?: string }
interface LessonSource { path: string; input: unknown }
interface PackRecord {
  dir: string; manifest: PackManifest; info: PackInfo; lexicon: Lexicon | null; routes: Route[];
  issues: ValidationIssue[]; sources: LessonSource[]; lessons: Map<string, LessonResult>;
  lessonFiles: Map<string, string>;
}

const CUSTOM_ID = 'sprout.custom';
const builtinTypes = new Set<string>(BUILTIN_ACTIVITY_TYPES);
const emptyLexicon = (): Lexicon => ({ schemaVersion: 1, concepts: [] });
const defaultManifest = (): PackManifest => ({
  schemaVersion: 1, id: CUSTOM_ID, version: '1.0.0', name: { zh: '我的课程', en: 'My Lessons' },
  ageRange: [0, 72], lexicon: 'lexicon.json', routes: [], lessonsDir: 'lessons', credits: [],
});
const errorIssue = (path: string, message: string): ValidationIssue => ({ path, message, level: 'error' });
function asIssue(error: unknown, path: string): ValidationIssue[] {
  if (error instanceof RegistryError && error.issues) return error.issues.map((issue) => ({
    ...issue, path: [path, issue.path].filter(Boolean).join('.'),
  }));
  return [errorIssue(path, error instanceof RegistryError ? error.message : '文件无法读取')];
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class PackRegistry {
  private readonly root: string;
  private readonly installed: string;
  private readonly custom: string;
  private readonly options: PackRegistryOptions;
  private packs = new Map<string, PackRecord>();
  private readonly enabled = new Map<string, boolean>();
  private lastDiskSignature = '';
  private lastDependencySignature = '';

  constructor(options: PackRegistryOptions) {
    this.options = options;
    this.root = guard(() => ensureRoot(options.dataDir));
    this.installed = guard(() => ensureDirectory(this.root, 'packs'));
    this.custom = guard(() => ensureDirectory(this.root, 'custom'));
    guard(() => {
      if (!options.getEnabled && existsSync(safePath(this.root, 'pack-enabled.json'))) {
        const state = readJson(this.root, 'pack-enabled.json');
        if (object(state)) for (const [id, enabled] of Object.entries(state)) {
          if (typeof enabled === 'boolean') this.enabled.set(id, enabled);
        }
      }
      if (!existsSync(safePath(this.custom, 'pack.json'))) writeJson(this.custom, 'pack.json', defaultManifest());
      if (!existsSync(safePath(this.custom, 'lexicon.json'))) writeJson(this.custom, 'lexicon.json', emptyLexicon());
      ensureDirectory(this.custom, 'lessons');
      ensureDirectory(this.custom, 'assets/uploads');
      ensureDirectory(this.custom, 'audio');
      if (!existsSync(safePath(this.custom, 'audio/manifest.json'))) {
        writeJson(this.custom, 'audio/manifest.json', { schemaVersion: 1, voices: {}, entries: {} });
      }
    });
    this.reload();
  }

  private isEnabled(id: string): boolean {
    if (this.options.setEnabled || !this.enabled.has(id)) return this.options.getEnabled?.(id) ?? this.enabled.get(id) ?? true;
    return this.enabled.get(id)!;
  }

  diskSignature(): string {
    return guard(() => {
      const hash = createHash('sha256');
      let count = 0;
      const visit = (path: string, depth = 0): void => {
        if (++count > 50000 || depth > 64) throw new RegistryError(413, 'PACK_TOO_LARGE', '内容目录过大或嵌套过深');
        hash.update(path);
        let stat;
        try { stat = lstatSync(path, { bigint: true }); } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') { hash.update('missing'); return; }
          throw error;
        }
        hash.update([stat.mode, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'));
        if (!stat.isDirectory() || stat.isSymbolicLink()) return;
        for (const name of readdirSync(path).sort()) {
          if (name === 'bundle.json' || /^\.(stage|backup|write|delete)-/.test(name)) continue;
          visit(join(path, name), depth + 1);
        }
      };
      for (const root of [...this.options.contentDirs.map((path) => resolve(path)), this.installed, this.custom]) visit(root);
      return hash.digest('hex');
    });
  }

  private dependencySignature(): string {
    const hash = createHash('sha256');
    for (const pack of this.packs.values()) {
      hash.update(`${pack.manifest.id}:${this.isEnabled(pack.manifest.id)}`);
      if (!this.options.validateExternal) continue;
      for (const source of pack.sources) {
        if (!object(source.input) || !Array.isArray(source.input.steps)) continue;
        for (const step of source.input.steps) {
          if (object(step) && typeof step.type === 'string' && step.type.includes('.')) {
            hash.update(JSON.stringify(this.options.validateExternal(step.type, step.props)));
          }
        }
      }
    }
    return hash.digest('hex');
  }

  private discover(root: string): string[] {
    if (!existsSync(root)) return [];
    if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) {
      throw new RegistryError(400, 'UNSAFE_PATH', '内容目录不能是符号链接');
    }
    if (existsSync(join(root, 'pack.json'))) return [root];
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink()))
      .map((entry) => join(root, entry.name)).filter((dir) => existsSync(join(dir, 'pack.json')))
      .sort();
  }

  private readPack(dir: string, source: PackInfo['source']): PackRecord {
    let manifest: PackManifest;
    const issues: ValidationIssue[] = [];
    try {
      manifest = parse(PackManifest, readJson(dir, 'pack.json'));
      safeRelativePath(manifest.id);
      for (const path of [manifest.lexicon, manifest.lessonsDir, ...manifest.routes, ...(manifest.cover ? [manifest.cover] : [])]) {
        safePath(dir, path);
      }
      if (source === 'custom' && manifest.id !== CUSTOM_ID) {
        throw new RegistryError(400, 'INVALID_CUSTOM_PACK', '自定义内容包 id 必须为 sprout.custom');
      }
      if (source !== 'custom' && manifest.id === CUSTOM_ID) {
        throw new RegistryError(400, 'RESERVED_PACK', 'sprout.custom 是保留的内容包 id');
      }
    } catch (error) {
      issues.push(...asIssue(error, 'pack.json'));
      const id = source === 'custom' ? CUSTOM_ID : Id.safeParse(basename(dir)).success ? basename(dir) :
        `invalid.${createHash('sha256').update(dir).digest('hex').slice(0, 12)}`;
      manifest = { ...defaultManifest(), id, name: { zh: basename(dir) } };
    }
    const record: PackRecord = {
      dir, manifest, lexicon: null, routes: [], issues, sources: [], lessons: new Map(), lessonFiles: new Map(),
      info: {
        id: manifest.id, version: manifest.version, name: manifest.name, description: manifest.description,
        author: manifest.author, license: manifest.license, ageRange: manifest.ageRange, enabled: this.isEnabled(manifest.id),
        source, baseUrl: `/packs/${manifest.id}/`, lessonCount: 0, conceptCount: 0, routeIds: [], credits: manifest.credits,
      },
    };
    if (hasErrors(issues)) return record;
    try {
      const files = walkFiles(dir);
      if (files.length > ZIP_LIMITS.entries) throw new RegistryError(413, 'PACK_TOO_LARGE', '内容包文件数量过多');
    } catch (error) { issues.push(...asIssue(error, 'files')); return record; }
    try {
      if (existsSync(safePath(dir, manifest.lexicon))) {
        const lexicon = parse(Lexicon, readJson(dir, manifest.lexicon));
        const found = validateConcepts(lexicon.concepts);
        for (const concept of lexicon.concepts) safePath(dir, concept.image);
        issues.push(...found.map((issue) => ({ ...issue, path: `${manifest.lexicon}.${issue.path}` })));
        if (!hasErrors(found)) record.lexicon = lexicon;
      }
    } catch (error) { issues.push(...asIssue(error, manifest.lexicon)); }
    for (const path of manifest.routes) {
      try {
        const route = parse(Route, readJson(dir, path));
        if (record.routes.some((item) => item.id === route.id)) {
          issues.push(errorIssue(path, `重复路线 id "${route.id}"`));
        } else record.routes.push(route);
      } catch (error) { issues.push(...asIssue(error, path)); }
    }
    try {
      const audioPath = safePath(dir, 'audio/manifest.json');
      if (existsSync(audioPath)) {
        const audio = parse(AudioManifest, readJson(dir, 'audio/manifest.json'));
        for (const path of Object.values(audio.entries)) safePath(dir, path);
      }
    } catch (error) { issues.push(...asIssue(error, 'audio/manifest.json')); }
    try {
      const lessonDir = safePath(dir, manifest.lessonsDir);
      if (existsSync(lessonDir)) for (const path of walkFiles(dir, manifest.lessonsDir)) {
        if (!path.endsWith('.json') || basename(path) === 'bundle.json') continue;
        try { record.sources.push({ path, input: readJson(dir, path) }); } catch (error) { issues.push(...asIssue(error, path)); }
      }
    } catch (error) { issues.push(...asIssue(error, manifest.lessonsDir)); }
    return record;
  }

  private conceptPool(pack: PackRecord, packs = this.packs): ResolvedConcept[] {
    const order = [pack, packs.get('sprout.core'), ...packs.values()];
    const seen = new Set<string>(), result: ResolvedConcept[] = [];
    for (const current of order) {
      if (!current || (current !== pack && current.manifest.id !== 'sprout.core' && !current.info.enabled)) continue;
      for (const concept of current.lexicon?.concepts ?? []) {
        if (seen.has(concept.id)) continue;
        seen.add(concept.id);
        result.push({ ...concept, packId: current.manifest.id, imageUrl: assetUrl(current.info.baseUrl, concept.image) });
      }
    }
    return result;
  }

  private checkLesson(input: unknown, knownConcepts: Set<string>): { lesson?: Lesson; issues: ValidationIssue[] } {
    const structural = Lesson.safeParse(input);
    if (!structural.success) return { issues: issuesOf(structural.error) };
    const invalid = structural.data.steps.flatMap((step, index) =>
      !step.type.includes('.') && !builtinTypes.has(step.type)
        ? [errorIssue(`steps.${index}.type`, `未知的内置活动 "${step.type}"`)] : []);
    if (invalid.length) return { lesson: structural.data, issues: invalid };
    const result = validateLesson(input, { knownConcepts, validateExternal: this.options.validateExternal });
    if (result.lesson?.cover?.concept && !knownConcepts.has(result.lesson.cover.concept)) {
      result.issues.push(errorIssue('cover.concept', `词库中不存在概念 "${result.lesson.cover.concept}"`));
    }
    if (result.lesson) {
      let nodes = 0;
      const inspect = (value: unknown, path: string, depth = 0): void => {
        if (++nodes > 10000 || depth > 64) {
          throw new RegistryError(400, 'LESSON_TOO_COMPLEX', '课程参数嵌套过深或过大');
        }
        if (Array.isArray(value)) { value.forEach((item, index) => inspect(item, `${path}.${index}`, depth + 1)); return; }
        if (!object(value)) return;
        for (const [key, item] of Object.entries(value)) {
          if (['image', 'src', 'poster', 'captions'].includes(key) && typeof item === 'string') {
            try {
              if (!/^https?:\/\//i.test(item) && !item.startsWith('/packs/') && !item.startsWith('concept:')) safeRelativePath(item);
              if (item.startsWith('/packs/')) safeRelativePath(item.slice(1));
            } catch (error) { result.issues.push(...asIssue(error, `${path}.${key}`)); }
          } else inspect(item, `${path}.${key}`, depth + 1);
        }
      };
      inspect(result.lesson.cover, 'cover');
      inspect(result.lesson.printables, 'printables');
      result.lesson.steps.forEach((step, index) => {
        if (builtinTypes.has(step.type)) inspect(step.props, `steps.${index}.props`);
      });
    }
    return result;
  }

  private finalize(packs: Map<string, PackRecord>): void {
    const ids = new Map<string, PackRecord>();
    const routeIds = new Set<string>();
    for (const pack of packs.values()) {
      const known = new Set(this.conceptPool(pack, packs).map((concept) => concept.id));
      const duplicates = new Set<string>(), seen = new Set<string>();
      for (const source of pack.sources) {
        if (object(source.input) && typeof source.input.id === 'string') {
          if (seen.has(source.input.id)) duplicates.add(source.input.id);
          seen.add(source.input.id);
        }
      }
      for (const source of pack.sources) {
        if (object(source.input) && Id.safeParse(source.input.id).success) {
          pack.lessonFiles.set(source.input.id as string, source.path);
        }
        const result = this.checkLesson(source.input, known);
        if (result.lesson) {
          pack.lessonFiles.set(result.lesson.id, source.path);
          if (duplicates.has(result.lesson.id) || ids.has(result.lesson.id)) {
            result.issues.push(errorIssue('id', `重复课程 id "${result.lesson.id}"`));
          }
        }
        pack.issues.push(...result.issues.map((issue) => ({ ...issue, path: `${source.path}.${issue.path}` })));
        if (!result.lesson || hasErrors(result.issues)) continue;
        pack.lessons.set(result.lesson.id, {
          lesson: result.lesson, packId: pack.manifest.id, baseUrl: pack.info.baseUrl, issues: result.issues,
        });
        ids.set(result.lesson.id, pack);
      }
      pack.routes = pack.routes.filter((route) => {
        if (routeIds.has(route.id)) { pack.issues.push(errorIssue('routes', `重复路线 id "${route.id}"`)); return false; }
        routeIds.add(route.id); return true;
      });
      pack.info.lessonCount = pack.lessons.size;
      pack.info.conceptCount = pack.lexicon?.concepts.length ?? 0;
      pack.info.routeIds = pack.routes.map((route) => route.id);
      const errors = pack.issues.filter((issue) => issue.level === 'error').map((issue) => `${issue.path}: ${issue.message}`);
      if (errors.length) pack.info.errors = errors;
      else delete pack.info.errors;
    }
  }

  reload(): PackInfo[] {
    return guard(() => {
      const signature = this.diskSignature(), dependency = this.dependencySignature();
      if (signature === this.lastDiskSignature && dependency === this.lastDependencySignature) return this.list();
      const packs = new Map<string, PackRecord>();
      const paths = new Set<string>();
      for (const [root, source] of [
        ...this.options.contentDirs.map((dir) => [resolve(dir), 'builtin'] as const),
        [this.installed, 'installed'] as const, [this.custom, 'custom'] as const,
      ]) {
        for (const dir of this.discover(root)) {
          if (paths.has(dir)) continue;
          paths.add(dir);
          const pack = this.readPack(dir, source);
          const previous = packs.get(pack.manifest.id);
          if (!previous || source === 'custom' ||
              (source === 'installed' && compareVersions(pack.manifest.version, previous.manifest.version) >= 0)) {
            packs.set(pack.manifest.id, pack);
          } else previous.issues.push({ path: 'pack.json.id', level: 'warning', message: '忽略重复或非更高版本的内容包' });
        }
      }
      this.finalize(packs);
      this.packs = packs;
      this.lastDiskSignature = signature;
      this.lastDependencySignature = this.dependencySignature();
      return this.list();
    });
  }

  list(): PackInfo[] { return structuredClone([...this.packs.values()].map((pack) => pack.info)); }

  getPack(id: string) {
    const pack = this.packs.get(id);
    if (!pack) return undefined;
    return structuredClone({
      info: pack.info, dir: pack.dir, manifest: pack.manifest, lexicon: pack.lexicon,
      routes: pack.routes, lessons: [...pack.lessons.values()].map((entry) => entry.lesson), issues: pack.issues,
    });
  }

  private requirePack(id: string): PackRecord {
    const pack = this.packs.get(id);
    if (!pack) throw new RegistryError(404, 'PACK_NOT_FOUND', '内容包不存在');
    return pack;
  }

  private findLesson(id: string, enabledOnly = true): LessonResult | undefined {
    for (const pack of this.packs.values()) {
      if ((!enabledOnly || pack.info.enabled) && pack.lessons.has(id)) return pack.lessons.get(id);
    }
    return undefined;
  }

  getLesson(id: string): LessonResult | undefined {
    const result = this.findLesson(id);
    return result ? structuredClone(result) : undefined;
  }

  lessonIndex(): Record<string, LessonSummary> {
    return Object.fromEntries(this.listLessons().map((lesson) => [lesson.id, lesson]));
  }

  listLessons(filters: LessonFilters = {}): LessonSummary[] {
    const lessons: LessonSummary[] = [];
    const query = filters.q?.trim().toLocaleLowerCase();
    for (const pack of this.packs.values()) {
      if (!pack.info.enabled || (filters.packId && pack.manifest.id !== filters.packId)) continue;
      for (const { lesson } of pack.lessons.values()) {
        if (filters.audience && (lesson.audience ?? 'child') !== filters.audience) continue;
        if (filters.age !== undefined && (lesson.ageRange[0] > filters.age || lesson.ageRange[1] < filters.age)) continue;
        if (filters.domain && !lesson.domains.some((domain) => domain === filters.domain)) continue;
        if (filters.themeId && lesson.themeId !== filters.themeId) continue;
        if (query && ![lesson.id, lesson.title.zh, lesson.title.en, lesson.summary?.zh, lesson.summary?.en, ...lesson.tags ?? []]
          .filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) continue;
        const image = lesson.cover?.image;
        const coverConcept = lesson.cover?.concept;
        const concept = coverConcept ? this.conceptPool(pack).find((item) => item.id === coverConcept) : undefined;
        const imageUrl = image?.startsWith('concept:') ? this.conceptPool(pack).find((item) => item.id === image.slice(8))?.imageUrl :
          image ? assetUrl(pack.info.baseUrl, image) : concept?.imageUrl;
        lessons.push({
          id: lesson.id, packId: pack.manifest.id, title: lesson.title, summary: lesson.summary, ageRange: lesson.ageRange,
          domains: lesson.domains, themeId: lesson.themeId, durationMin: lesson.durationMin, coView: lesson.coView,
          audience: lesson.audience ?? 'child', hasPrintables: !!lesson.printables?.length,
          cover: lesson.cover ? { ...lesson.cover, imageUrl } : undefined,
          stepTypes: lesson.steps.map((step) => step.type), tags: lesson.tags,
        });
      }
    }
    return structuredClone(lessons);
  }

  listConcepts(filters: ConceptFilters = {}): ResolvedConcept[] {
    const result: ResolvedConcept[] = [], query = filters.q?.trim().toLocaleLowerCase();
    for (const pack of this.packs.values()) {
      if (!pack.info.enabled || (filters.packId && pack.manifest.id !== filters.packId)) continue;
      for (const concept of pack.lexicon?.concepts ?? []) {
        if (filters.category && concept.category !== filters.category) continue;
        if (query && ![concept.id, concept.zh, concept.en, concept.pinyin, ...concept.tags ?? []]
          .filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) continue;
        result.push({ ...concept, packId: pack.manifest.id, imageUrl: assetUrl(pack.info.baseUrl, concept.image) });
      }
    }
    return structuredClone(result);
  }

  listRoutes(): { id: string; title: Route['title']; packId: string }[] {
    return structuredClone([...this.packs.values()].filter((pack) => pack.info.enabled).flatMap((pack) =>
      pack.routes.map((route) => ({ id: route.id, title: route.title, packId: pack.manifest.id }))));
  }

  getRoute(id: string): Route | undefined {
    for (const pack of this.packs.values()) {
      if (!pack.info.enabled) continue;
      const route = pack.routes.find((item) => item.id === id);
      if (route) return structuredClone(route);
    }
    return undefined;
  }

  validate(id: string): ValidationIssue[] { return structuredClone(this.requirePack(id).issues); }

  importZip(bytes: Uint8Array): PackInfo {
    return guard(() => {
      const files = readZip(bytes, 'pack.json'), stage = makeStage(this.installed);
      try {
        extractFiles(files, stage);
        const candidate = this.readPack(stage, 'installed');
        if (hasErrors(candidate.issues)) validationError(candidate.issues);
        const existing = this.packs.get(candidate.manifest.id);
        if (existing && compareVersions(candidate.manifest.version, existing.manifest.version) < 0) {
          throw new RegistryError(409, 'VERSION_CONFLICT', '不能导入低于当前版本的内容包');
        }
        const other = new Map([...this.packs].filter(([id]) => id !== candidate.manifest.id));
        for (const source of candidate.sources) if (object(source.input) && typeof source.input.id === 'string') {
          const lessonId = source.input.id;
          if ([...other.values()].some((pack) => pack.lessons.has(lessonId))) {
            candidate.issues.push(errorIssue(`${source.path}.id`, '课程 id 已属于其他内容包'));
          }
        }
        for (const route of candidate.routes) if ([...other.values()].some((pack) => pack.routes.some((item) => item.id === route.id))) {
          candidate.issues.push(errorIssue('routes', `路线 id "${route.id}" 已属于其他内容包`));
        }
        // 只验证候选包，词条解析仍可看到已有包；不改动在线索引。
        const known = new Map([...other, [candidate.manifest.id, candidate]]);
        for (const source of candidate.sources) {
          const result = this.checkLesson(source.input, new Set(this.conceptPool(candidate, known).map((item) => item.id)));
          candidate.issues.push(...result.issues.map((issue) => ({ ...issue, path: `${source.path}.${issue.path}` })));
        }
        const ids = candidate.sources.map((source) => object(source.input) ? source.input.id : undefined);
        if (new Set(ids).size !== ids.length) candidate.issues.push(errorIssue('lessons', '包内课程 id 重复'));
        if (hasErrors(candidate.issues)) validationError(candidate.issues);
        replaceDirectory(stage, safePath(this.installed, candidate.manifest.id));
        this.reload();
        return structuredClone(this.requirePack(candidate.manifest.id).info);
      } finally { rmSync(stage, { recursive: true, force: true }); }
    });
  }

  exportZip(id: string): Uint8Array { return guard(() => exportDirectory(this.requirePack(id).dir)); }

  setEnabled(id: string, enabled: boolean): PackInfo {
    return guard(() => {
      this.requirePack(id);
      if (typeof enabled !== 'boolean') throw new RegistryError(400, 'VALIDATION_ERROR', 'enabled 必须是布尔值');
      this.options.setEnabled?.(id, enabled);
      this.enabled.set(id, enabled);
      if (!this.options.getEnabled) writeJson(this.root, 'pack-enabled.json', Object.fromEntries(this.enabled));
      this.reload();
      return structuredClone(this.requirePack(id).info);
    });
  }

  deletePack(id: string): void {
    guard(() => {
      const pack = this.requirePack(id);
      if (pack.info.source !== 'installed') throw new RegistryError(403, 'PACK_READ_ONLY', '仅导入的内容包可以删除');
      if (pack.dir !== safePath(this.installed, id)) throw new RegistryError(400, 'UNSAFE_PATH', '内容包不在受管目录中');
      rmSync(pack.dir, { recursive: true });
      this.reload();
    });
  }

  private customLessonPath(id: string): string {
    const pack = this.requirePack(CUSTOM_ID), path = pack.lessonFiles.get(id);
    if (!path) {
      if (this.findLesson(id, false)) throw new RegistryError(403, 'LESSON_READ_ONLY', '只能修改自定义课程');
      throw new RegistryError(404, 'LESSON_NOT_FOUND', '课程不存在');
    }
    return path;
  }

  saveLesson(input: unknown, id?: string): LessonResult {
    return guard(() => {
      const pack = this.requirePack(CUSTOM_ID);
      if (!object(input)) validationError([errorIssue('', '课程必须是对象')]);
      let path: string;
      if (id !== undefined) {
        path = this.customLessonPath(id);
        if (input.id !== undefined && input.id !== id) validationError([errorIssue('id', '不能修改课程 id')]);
      } else {
        const proposed = input.id ?? randomUUID();
        if (typeof proposed !== 'string') validationError([errorIssue('id', 'id 必须是字符串')]);
        id = proposed.startsWith('custom.') ? proposed : `custom.${proposed}`;
        parse(Id, id, 'id');
        if (this.findLesson(id, false) || pack.lessonFiles.has(id)) throw new RegistryError(409, 'LESSON_EXISTS', '课程 id 已存在');
        path = `${pack.manifest.lessonsDir}/${id}.json`;
      }
      const result = this.checkLesson({ ...input, id }, new Set(this.conceptPool(pack).map((concept) => concept.id)));
      if (!result.lesson || hasErrors(result.issues)) validationError(result.issues);
      writeJson(this.custom, path, result.lesson);
      this.reload();
      return structuredClone(this.requirePack(CUSTOM_ID).lessons.get(id)!);
    });
  }

  deleteLesson(id: string): void {
    guard(() => {
      const path = this.customLessonPath(id);
      rmSync(safePath(this.custom, path));
      this.reload();
    });
  }

  saveConcept(input: unknown, id?: string): ResolvedConcept {
    return guard(() => {
      const pack = this.requirePack(CUSTOM_ID), lexicon = structuredClone(pack.lexicon ?? emptyLexicon());
      if (!object(input)) validationError([errorIssue('', '词条必须是对象')]);
      const index = id === undefined ? -1 : lexicon.concepts.findIndex((concept) => concept.id === id);
      if (id !== undefined && index < 0) this.missingConcept(id);
      if (id !== undefined && input.id !== undefined && input.id !== id) validationError([errorIssue('id', '不能修改词条 id')]);
      const concept = parse(Concept, { ...input, id: id ?? input.id ?? `custom.${randomUUID()}` });
      safePath(this.custom, concept.image);
      if (index >= 0) lexicon.concepts[index] = concept;
      else lexicon.concepts.push(concept);
      const issues = validateConcepts(lexicon.concepts);
      if (hasErrors(issues)) validationError(issues);
      writeJson(this.custom, pack.manifest.lexicon, lexicon);
      this.reload();
      return { ...concept, packId: CUSTOM_ID, imageUrl: assetUrl(pack.info.baseUrl, concept.image) };
    });
  }

  private missingConcept(id: string): never {
    if ([...this.packs.values()].some((pack) => pack.lexicon?.concepts.some((concept) => concept.id === id))) {
      throw new RegistryError(403, 'CONCEPT_READ_ONLY', '只能修改自定义词条');
    }
    throw new RegistryError(404, 'CONCEPT_NOT_FOUND', '词条不存在');
  }

  deleteConcept(id: string): void {
    guard(() => {
      const snapshot = this.customSnapshot();
      if (!snapshot.lexicon.concepts.some((concept) => concept.id === id)) this.missingConcept(id);
      snapshot.lexicon.concepts = snapshot.lexicon.concepts.filter((concept) => concept.id !== id);
      this.validateCustomSnapshot(snapshot);
      writeJson(this.custom, this.requirePack(CUSTOM_ID).manifest.lexicon, snapshot.lexicon);
      this.reload();
    });
  }

  customSnapshot(): CustomSnapshot {
    const pack = this.requirePack(CUSTOM_ID);
    if (hasErrors(pack.issues)) validationError(pack.issues, '自定义内容存在错误，不能静默丢弃后备份');
    return structuredClone({ lessons: [...pack.lessons.values()].map((entry) => entry.lesson), lexicon: pack.lexicon ?? emptyLexicon() });
  }

  validateCustomSnapshot(input: unknown): CustomSnapshot {
    return guard(() => {
      if (!object(input) || !Array.isArray(input.lessons)) validationError([errorIssue('lessons', '备份必须包含课程数组')]);
      const lexicon = parse(Lexicon, input.lexicon, 'lexicon');
      const issues = validateConcepts(lexicon.concepts).map((issue) => ({ ...issue, path: `lexicon.${issue.path}` }));
      for (const concept of lexicon.concepts) {
        try { safePath(this.custom, concept.image); } catch (error) { issues.push(...asIssue(error, `lexicon.${concept.id}.image`)); }
      }
      const candidate = { ...this.requirePack(CUSTOM_ID), lexicon };
      const known = new Map(this.packs); known.set(CUSTOM_ID, candidate);
      const concepts = new Set(this.conceptPool(candidate, known).map((concept) => concept.id));
      const lessons: Lesson[] = [], ids = new Set<string>();
      for (const [index, item] of input.lessons.entries()) {
        const result = this.checkLesson(item, concepts);
        issues.push(...result.issues.map((issue) => ({ ...issue, path: `lessons.${index}.${issue.path}` })));
        if (!result.lesson) continue;
        if (!result.lesson.id.startsWith('custom.')) issues.push(errorIssue(`lessons.${index}.id`, '自定义课程 id 必须以 custom. 开头'));
        if (ids.has(result.lesson.id)) issues.push(errorIssue(`lessons.${index}.id`, '课程 id 重复'));
        if ([...this.packs.values()].some((pack) => pack.manifest.id !== CUSTOM_ID && pack.lessons.has(result.lesson!.id))) {
          issues.push(errorIssue(`lessons.${index}.id`, '课程 id 已被其他内容包使用'));
        }
        ids.add(result.lesson.id); lessons.push(result.lesson);
      }
      if (hasErrors(issues)) validationError(issues);
      return { lessons, lexicon };
    });
  }

  private writeSnapshot(snapshot: CustomSnapshot, assets = new Map<string, Uint8Array>()): void {
    const manifest = this.requirePack(CUSTOM_ID).manifest;
    const stage = makeStage(this.root);
    try {
      let total = 0;
      for (const path of walkFiles(this.custom)) {
        if (path === manifest.lexicon || path.startsWith(`${manifest.lessonsDir}/`)) continue;
        const source = safePath(this.custom, path), target = safePath(stage, path);
        total += lstatSync(source).size;
        if (total > ZIP_LIMITS.expandedBytes) throw new RegistryError(413, 'PACK_TOO_LARGE', '自定义内容包过大');
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
      ensureDirectory(stage, manifest.lessonsDir);
      for (const lesson of snapshot.lessons) writeJson(stage, `${manifest.lessonsDir}/${lesson.id}.json`, lesson);
      writeJson(stage, manifest.lexicon, snapshot.lexicon);
      for (const [path, bytes] of assets) {
        const target = safePath(stage, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
      }
      replaceDirectory(stage, this.custom, () => { this.reload(); });
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }

  restoreCustom(snapshot: unknown): void {
    guard(() => { this.writeSnapshot(this.validateCustomSnapshot(snapshot)); });
  }

  duplicateLesson(id: string): LessonResult {
    return guard(() => {
      const original = this.findLesson(id, false);
      if (!original) throw new RegistryError(404, 'LESSON_NOT_FOUND', '课程不存在');
      const source = this.requirePack(original.packId), snapshot = this.customSnapshot();
      const lesson = structuredClone(original.lesson), assets = new Map<string, Uint8Array>();
      const concepts = new Map(this.conceptPool(source).map((concept) => [concept.id, concept]));
      const copiedConcepts = new Map<string, string>(), copiedAssets = new Map<string, string>();
      const copyAsset = (path: string, packId: string): string => {
        if (/^https?:\/\//i.test(path)) return path;
        if (path.startsWith('/packs/')) {
          const match = /^\/packs\/([^/]+)\/(.+)$/.exec(path);
          if (!match) throw new RegistryError(400, 'UNSAFE_PATH', '资源路径无效');
          return copyAsset(decodeURIComponent(match[2]), decodeURIComponent(match[1]));
        }
        if (packId === CUSTOM_ID) { safePath(this.custom, path); return path; }
        const key = `${packId}/${path}`;
        if (copiedAssets.has(key)) return copiedAssets.get(key)!;
        const file = safePath(this.requirePack(packId).dir, path);
        if (!existsSync(file) || !lstatSync(file).isFile()) validationError([errorIssue('assets', `无法复制缺失资源：${path}`)]);
        if (lstatSync(file).size > ZIP_LIMITS.fileBytes) throw new RegistryError(413, 'FILE_TOO_LARGE', '资源文件过大');
        const target = `assets/uploads/${randomUUID()}${extname(path)}`;
        assets.set(target, readFileSync(file)); copiedAssets.set(key, target);
        return target;
      };
      const copyConcept = (id: string): string => {
        if (copiedConcepts.has(id)) return copiedConcepts.get(id)!;
        const concept = concepts.get(id);
        if (!concept) return id;
        if (concept.packId === CUSTOM_ID) return id;
        const { packId, imageUrl: _, ...data } = concept;
        const newId = `custom.${randomUUID()}`;
        snapshot.lexicon.concepts.push({ ...data, id: newId, image: copyAsset(concept.image, packId) });
        copiedConcepts.set(id, newId);
        return newId;
      };
      const rewrite = (value: unknown, key = ''): unknown => {
        if (Array.isArray(value)) return value.map((item) => rewrite(item, key));
        if (typeof value === 'string') {
          if (['concept', 'item'].includes(key)) return copyConcept(value);
          if (['image', 'src', 'poster', 'captions'].includes(key)) {
            return value.startsWith('concept:') ? `concept:${copyConcept(value.slice(8))}` : copyAsset(value, source.manifest.id);
          }
          return value;
        }
        if (object(value)) return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, rewrite(item, childKey)]));
        return value;
      };
      lesson.id = `custom.${randomUUID()}`;
      lesson.title = { ...lesson.title, zh: `${lesson.title.zh}（副本）`, ...(lesson.title.en ? { en: `${lesson.title.en} (copy)` } : {}) };
      lesson.cover = rewrite(lesson.cover) as Lesson['cover'];
      lesson.printables = lesson.printables?.map((printable) => printable.kind === 'cards'
        ? { ...printable, items: printable.items.map((item) =>
          typeof item === 'string' ? copyConcept(item) : rewrite(item) as typeof item) } : printable);
      lesson.steps = lesson.steps.map((step) => {
        if (!builtinTypes.has(step.type)) return step;
        const props = rewrite(step.props) as Record<string, unknown>;
        if (['word-cards', 'peekaboo', 'bubbles'].includes(step.type) && Array.isArray(props.items)) {
          props.items = props.items.map((item) => typeof item === 'string' ? copyConcept(item) : item);
        }
        if (['choose', 'pattern'].includes(step.type) && Array.isArray(props.rounds)) {
          for (const round of props.rounds) {
            if (!object(round)) continue;
            if (step.type === 'pattern' && Array.isArray(round.sequence)) {
              round.sequence = round.sequence.map((item) => typeof item === 'string' ? copyConcept(item) : item);
            }
            if (Array.isArray(round.options)) {
              const originalAnswer = round.answer;
              round.options = round.options.map((option) => {
                if (typeof option !== 'string') return option;
                const mapped = copyConcept(option);
                if (originalAnswer === option) round.answer = mapped;
                return mapped;
              });
            }
          }
        }
        return { ...step, props };
      });
      snapshot.lessons.push(lesson);
      this.writeSnapshot(this.validateCustomSnapshot(snapshot), assets);
      return structuredClone(this.requirePack(CUSTOM_ID).lessons.get(lesson.id)!);
    });
  }
}
