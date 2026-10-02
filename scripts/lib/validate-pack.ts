import path from 'node:path';
import {
  AudioManifest, Lexicon, PackManifest, Route, validateConcepts, validateLesson,
  type Concept, type Lesson, type ValidationIssue,
} from '@sprout/schema';
import { collectSpeech, type SpeechEntry } from './collect-speech';
import { CORE_PACK, errorMessage, fileExists, isCachePath, isMissing, readJson, walkFiles } from './io';

interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | {
    success: false; error: { issues: { path: PropertyKey[]; message: string }[] };
  };
}

export interface LessonFile {
  file: string;
  lesson: Lesson;
  issues: ValidationIssue[];
}

export interface PackInspection {
  dir: string;
  manifest: PackManifest | null;
  lexicon: Lexicon | null;
  routes: { file: string; route: Route }[];
  lessonFiles: LessonFile[];
  validLessons: Lesson[];
  audio: AudioManifest | null;
  fallbackConcepts: Concept[];
  issues: ValidationIssue[];
  speech: SpeechEntry[];
  audioCoverage: { total: number; present: number; missing: SpeechEntry[] };
}

function issue(path: string, message: string, level: ValidationIssue['level'] = 'error'): ValidationIssue {
  return { path, message, level };
}

async function parseFile<T>(
  root: string, file: string, schema: Schema<T>, issues: ValidationIssue[],
  missing: 'error' | 'warning' | 'ignore' = 'error',
): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await readJson(root, file));
    if (parsed.success) return parsed.data;
    issues.push(...parsed.error.issues.map((error) =>
      issue([file, ...error.path.map(String)].join('.'), error.message)));
  } catch (error) {
    if (isMissing(error)) {
      if (missing !== 'ignore') issues.push(issue(file, '文件缺失', missing));
    } else issues.push(issue(file, `读取失败：${errorMessage(error)}`));
  }
  return null;
}

async function coreConcepts(dir: string): Promise<Concept[]> {
  if (path.resolve(dir) === path.resolve(CORE_PACK)) return [];
  const manifest = await parseFile(CORE_PACK, 'pack.json', PackManifest, [], 'ignore');
  const lexicon = await parseFile(CORE_PACK, manifest?.lexicon ?? 'lexicon.json', Lexicon, [], 'ignore');
  return lexicon?.concepts ?? [];
}

export function punctuationIssues(input: unknown, prefix: string): ValidationIssue[] {
  const found: ValidationIssue[] = [];
  function visit(value: unknown, location: string): void {
    if (typeof value === 'string' && /\p{Script=Han}/u.test(value)
      && /(?:\p{Script=Han}[,.;:!?]|[,.;:!?]\s*$)/u.test(value)) {
      found.push(issue(location, `中文文本疑似使用英文半角标点：${value.slice(0, 80)}`, 'warning'));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}.${index}`));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (!['image', 'url', 'src', 'notes', 'homepage'].includes(key)) visit(item, `${location}.${key}`);
      }
    }
  }
  visit(input, prefix);
  return found;
}

export async function resourceIssues(
  root: string, input: unknown, prefix: string, knownConcepts: ReadonlySet<string>,
): Promise<ValidationIssue[]> {
  const found: ValidationIssue[] = [];
  async function asset(value: string, location: string): Promise<void> {
    if (value.startsWith('concept:')) {
      if (!knownConcepts.has(value.slice('concept:'.length))) found.push(issue(location, `词库中不存在概念 "${value.slice(8)}"`));
      return;
    }
    if (/^https?:\/\//i.test(value)) {
      try { new URL(value); } catch { found.push(issue(location, `资源 URL 无效：${value}`)); }
      return;
    }
    if (isCachePath(value)) {
      found.push(issue(location, `资源位于发布排除的缓存或临时路径：${value}`));
      return;
    }
    try {
      if (!await fileExists(root, value)) found.push(issue(location, `资源缺失或为空：${value}`));
    } catch (error) { found.push(issue(location, errorMessage(error))); }
  }
  async function visit(value: unknown, location: string): Promise<void> {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) await visit(value[index], `${location}.${index}`);
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const field = `${location}.${key}`;
        if (['image', 'src', 'poster', 'captions'].includes(key) && typeof item === 'string') await asset(item, field);
        else if (key === 'concept' && typeof item === 'string') {
          if (!knownConcepts.has(item)) found.push(issue(field, `词库中不存在概念 "${item}"`));
        } else await visit(item, field);
      }
    }
  }
  await visit(input, prefix);
  return found;
}

export function routeIssues(
  routes: PackInspection['routes'], lessons: readonly LessonFile[],
  onLessonIssue?: (id: string, entry: ValidationIssue) => void,
): ValidationIssue[] {
  const found: ValidationIssue[] = [];
  const byId = new Map(lessons.map((item) => [item.lesson.id, item.lesson]));
  const membership = new Map<string, number>();
  const routeIds = new Set<string>();
  const themeIds = new Set<string>();
  for (const { file, route } of routes) {
    if (routeIds.has(route.id)) found.push(issue(`${file}.id`, `重复路线 id "${route.id}"`));
    routeIds.add(route.id);
    const stageIds = new Set<string>();
    route.stages.forEach((stage, stageIndex) => {
      const stagePath = `${file}.stages.${stageIndex}`;
      if (stageIds.has(stage.id)) found.push(issue(`${stagePath}.id`, `重复阶段 id "${stage.id}"`));
      stageIds.add(stage.id);
      const previous = route.stages[stageIndex - 1];
      if (previous && stage.ageRange[0] !== previous.ageRange[1] + 1) {
        found.push(issue(`${stagePath}.ageRange`, stage.ageRange[0] <= previous.ageRange[1]
          ? '阶段月龄重叠或顺序颠倒；闭区间不可共用端点'
          : '阶段月龄不连续；下一阶段应从上一阶段最大月龄 + 1 开始'));
      }
      stage.themes.forEach((theme, themeIndex) => {
        const themePath = `${stagePath}.themes.${themeIndex}`;
        if (themeIds.has(theme.id)) found.push(issue(`${themePath}.id`, `重复主题 id "${theme.id}"`));
        themeIds.add(theme.id);
        theme.lessons.forEach((id, index) => {
          const reference = `${themePath}.lessons.${index}`;
          membership.set(id, (membership.get(id) ?? 0) + 1);
          const lesson = byId.get(id);
          if (!lesson) {
            found.push(issue(reference, `引用的课程不存在或结构无效："${id}"`));
            return;
          }
          if (lesson.themeId !== theme.id) {
            const mismatch = issue(reference, `课程 "${id}" 的 themeId "${lesson.themeId ?? '(未填写)'}" 与主题 "${theme.id}" 不一致`);
            found.push(mismatch);
            onLessonIssue?.(id, mismatch);
          }
          if (lesson.ageRange[1] < stage.ageRange[0] || lesson.ageRange[0] > stage.ageRange[1]) {
            found.push(issue(reference, `课程 "${id}" 的 ageRange 与阶段无交集`, 'warning'));
          }
          if ((lesson.audience ?? 'child') === 'child') {
            if (stage.screen.childScreen === 'none') {
              const forbidden = issue(reference, `阶段 childScreen=none 只允许家长指引课 audience=parent，课程 "${id}" 是亲子共看课`);
              found.push(forbidden);
              onLessonIssue?.(id, forbidden);
            }
            if (lesson.durationMin > stage.screen.sessionMaxMin) {
              found.push(issue(reference, `亲子共看课 "${id}" 的 durationMin (${lesson.durationMin}) 超过所在阶段 sessionMaxMin (${stage.screen.sessionMaxMin})`, 'warning'));
            }
          }
        });
      });
    });
  }
  for (const { file, lesson } of lessons) {
    if ((lesson.audience ?? 'child') === 'child' && lesson.coView !== 'required') {
      found.push(issue(`${file}.coView`, '亲子共看课的 coView 应为 required，必须家长陪同', 'warning'));
    }
    const count = membership.get(lesson.id) ?? 0;
    if (count !== 1) found.push(issue(file, `课程 "${lesson.id}" 在主题中出现 ${count} 次，应且仅应出现 1 次`, 'warning'));
  }
  return found;
}

export async function printableIssues(
  dir: string, lesson: Lesson, file: string, concepts: ReadonlyMap<string, { concept: Concept; root: string }>,
): Promise<ValidationIssue[]> {
  const found: ValidationIssue[] = [];
  for (const [index, printable] of (lesson.printables ?? []).entries()) {
    if (printable.kind !== 'cards') continue;
    for (const [itemIndex, reference] of printable.items.entries()) {
      // 内联图片由通用资源检查负责；字符串引用需在词条所属包查找图片。
      if (typeof reference !== 'string') continue;
      const source = concepts.get(reference);
      if (!source) continue;
      const location = `${file}.printables.${index}.items.${itemIndex}`;
      try {
        if (isCachePath(source.concept.image)) {
          found.push(issue(location, `打印卡图片位于发布排除的缓存或临时路径：${source.concept.image}`));
          continue;
        }
        if (!await fileExists(source.root, source.concept.image)) {
          found.push(issue(location, `打印卡词条 "${reference}" 的图片缺失或为空：${source.root === dir ? '' : 'sprout.core/'}${source.concept.image}`));
        }
      } catch (error) { found.push(issue(location, errorMessage(error))); }
    }
  }
  return found;
}

export async function inspectPack(
  directory: string, options: { checkAudio?: boolean; fallbackConcepts?: Concept[]; fallbackRoot?: string } = {},
): Promise<PackInspection> {
  const dir = path.resolve(directory);
  const issues: ValidationIssue[] = [];
  const manifest = await parseFile(dir, 'pack.json', PackManifest, issues);
  const result: PackInspection = {
    dir, manifest, lexicon: null, routes: [], lessonFiles: [], validLessons: [], audio: null,
    fallbackConcepts: [], issues, speech: [], audioCoverage: { total: 0, present: 0, missing: [] },
  };
  if (!manifest) return result;
  for (const source of [manifest.lexicon, ...manifest.routes, manifest.lessonsDir]) {
    if (isCachePath(source)) issues.push(issue('pack.json', `内容源位于发布排除的缓存或临时路径：${source}`));
  }
  issues.push(...punctuationIssues(manifest, 'pack.json'));
  result.lexicon = await parseFile(dir, manifest.lexicon, Lexicon, issues, 'warning');
  if (result.lexicon) {
    issues.push(...validateConcepts(result.lexicon.concepts).map((entry) => ({ ...entry, path: `${manifest.lexicon}.${entry.path}` })));
    issues.push(...punctuationIssues(result.lexicon, manifest.lexicon));
  }
  result.fallbackConcepts = options.fallbackConcepts ?? await coreConcepts(dir);
  const knownConcepts = new Set([
    ...result.fallbackConcepts.map((concept) => concept.id),
    ...result.lexicon?.concepts.map((concept) => concept.id) ?? [],
  ]);
  const conceptAssets = new Map<string, { concept: Concept; root: string }>();
  for (const concept of result.fallbackConcepts) {
    conceptAssets.set(concept.id, { concept, root: options.fallbackRoot ?? CORE_PACK });
  }
  for (const concept of result.lexicon?.concepts ?? []) conceptAssets.set(concept.id, { concept, root: dir });
  if (result.lexicon) issues.push(...await resourceIssues(dir, result.lexicon, manifest.lexicon, knownConcepts));
  if (manifest.cover) issues.push(...await resourceIssues(dir, { image: manifest.cover }, 'pack.json.cover', knownConcepts));
  const routePaths = new Set<string>();
  for (const file of manifest.routes) {
    if (routePaths.has(file)) {
      issues.push(issue('pack.json.routes', `重复路线文件 "${file}"`));
      continue;
    }
    routePaths.add(file);
    const route = await parseFile(dir, file, Route, issues);
    if (route) {
      result.routes.push({ file, route });
      issues.push(...punctuationIssues(route, file));
    }
  }
  try {
    const lessonPaths = (await walkFiles(dir, manifest.lessonsDir)).filter((file) => file.endsWith('.json'));
    if (!lessonPaths.length) issues.push(issue(manifest.lessonsDir, '尚无课程 JSON', 'warning'));
    for (const file of lessonPaths) {
      try {
        const validated = validateLesson(await readJson(dir, file), { knownConcepts });
        const perLesson = validated.issues.map((entry) => ({ ...entry, path: `${file}.${entry.path}` }));
        if (validated.lesson) {
          perLesson.push(...await resourceIssues(dir, validated.lesson, file, knownConcepts));
          perLesson.push(...await printableIssues(dir, validated.lesson, file, conceptAssets));
          perLesson.push(...punctuationIssues(validated.lesson, file));
          result.lessonFiles.push({ file, lesson: validated.lesson, issues: perLesson });
        }
        issues.push(...perLesson);
      } catch (error) { issues.push(issue(file, `课程读取或校验失败：${errorMessage(error)}`)); }
    }
  } catch (error) {
    issues.push(issue(manifest.lessonsDir, isMissing(error) ? '课程目录缺失' : errorMessage(error), isMissing(error) ? 'warning' : 'error'));
  }
  const lessonIds = new Map<string, LessonFile[]>();
  for (const item of result.lessonFiles) lessonIds.set(item.lesson.id, [...lessonIds.get(item.lesson.id) ?? [], item]);
  for (const [id, duplicates] of lessonIds) {
    if (duplicates.length < 2) continue;
    for (const item of duplicates) {
      const duplicate = issue(`${item.file}.id`, `重复课程 id "${id}"`);
      item.issues.push(duplicate);
      issues.push(duplicate);
    }
  }
  issues.push(...routeIssues(result.routes, result.lessonFiles, (id, entry) => {
    for (const item of lessonIds.get(id) ?? []) item.issues.push(entry);
  }));
  result.validLessons = result.lessonFiles.filter((item) => !item.issues.some((entry) => entry.level === 'error')).map((item) => item.lesson);
  result.audio = await parseFile(dir, 'audio/manifest.json', AudioManifest, issues, 'ignore');
  result.speech = collectSpeech({ lexicon: result.lexicon, lessons: result.validLessons, fallbackConcepts: result.fallbackConcepts });
  if (options.checkAudio !== false) {
    const existing = new Set<string>();
    for (const [key, file] of Object.entries(result.audio?.entries ?? {})) {
      try {
        if (await fileExists(dir, file)) existing.add(key);
        else issues.push(issue(`audio/manifest.json.entries.${key}`, `音频文件缺失或为空：${file}`));
      } catch (error) { issues.push(issue(`audio/manifest.json.entries.${key}`, errorMessage(error))); }
    }
    const missing = result.speech.filter((entry) => !existing.has(entry.key));
    result.audioCoverage = { total: result.speech.length, present: result.speech.length - missing.length, missing };
    if (missing.length) issues.push(issue('audio/manifest.json', `缺少 ${missing.length}/${result.speech.length} 条朗读音频；可运行 content:audio，播放端可回退系统朗读`, 'warning'));
  } else result.audioCoverage.total = result.speech.length;
  return result;
}

export function printInspection(inspection: PackInspection): void {
  for (const entry of inspection.issues) {
    console.log(`[${entry.level === 'error' ? '错误' : '警告'}] ${entry.path}：${entry.message}`);
  }
  const coverage = inspection.audioCoverage;
  console.table([{
    内容包: inspection.manifest?.id ?? path.basename(inspection.dir),
    词条: inspection.lexicon?.concepts.length ?? 0,
    路线: inspection.routes.length,
    有效课程: inspection.validLessons.length,
    错误: inspection.issues.filter((entry) => entry.level === 'error').length,
    警告: inspection.issues.filter((entry) => entry.level === 'warning').length,
    音频覆盖: `${coverage.present}/${coverage.total} (${coverage.total ? (coverage.present / coverage.total * 100).toFixed(1) : '100.0'}%)`,
  }]);
  if (coverage.missing.length) {
    console.log('缺失音频（最多展示前 20 条）：');
    for (const entry of coverage.missing.slice(0, 20)) console.log(`  ${entry.key}`);
  }
}
