import {
  AudioManifest,
  Lesson,
  Lexicon,
  PackManifest,
  Route,
  SCHEMA_VERSION,
  validateConcepts,
  validateLesson,
  type PackBundle,
  type ValidationIssue,
} from '@sprout/schema';
import { BundleValidationError } from './errors';
import { isRecord, validTimestamp } from './storage';

interface Parser<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

export function parseBundle(value: unknown): PackBundle {
  const issues: ValidationIssue[] = [];
  const input = isRecord(value) ? value : {};
  const error = (path: string, message: string) => issues.push({ path, message, level: 'error' });
  function field<T>(name: string, parser: Parser<T>): T | undefined {
    const result = parser.safeParse(input[name]);
    if (result.success) return result.data;
    for (const issue of result.error.issues) error([name, ...issue.path.map(String)].join('.'), issue.message);
    return undefined;
  }
  if (input.schemaVersion !== SCHEMA_VERSION) error('schemaVersion', '不支持的内容包版本。');
  if (!validTimestamp(input.builtAt)) error('builtAt', '内容包构建时间无效。');
  const manifest = field('manifest', PackManifest);
  const lexicon = field('lexicon', Lexicon.nullable());
  const routes = field('routes', Route.array());
  const lessons = field('lessons', Lesson.array());
  const audio = field('audio', AudioManifest.nullable());
  if (lexicon) {
    issues.push(...validateConcepts(lexicon.concepts).map((issue) => ({ ...issue, path: `lexicon.${issue.path}` })));
  }
  function checkIds(items: { id: string }[], name: string): void {
    const ids = new Set<string>();
    items.forEach((item, index) => {
      if (ids.has(item.id)) error(`${name}.${index}.id`, `重复 id "${item.id}"`);
      ids.add(item.id);
    });
  }
  if (routes) checkIds(routes, 'routes');
  if (lessons) {
    checkIds(lessons, 'lessons');
    const knownConcepts = new Set(lexicon?.concepts.map((concept) => concept.id) ?? []);
    lessons.forEach((lesson, index) => {
      const result = validateLesson(lesson, { knownConcepts });
      issues.push(...result.issues.map((issue) => ({ ...issue, path: `lessons.${index}.${issue.path}` })));
      if (result.lesson) lessons[index] = result.lesson;
    });
  }
  const errors = issues.filter((issue) => issue.level === 'error');
  if (errors.length || !manifest || lexicon === undefined || !routes || !lessons || audio === undefined) {
    throw new BundleValidationError(errors);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    builtAt: input.builtAt as string,
    manifest,
    lexicon,
    routes,
    lessons,
    audio,
  };
}
