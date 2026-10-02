import { speechKey, type Lang, type Lesson } from '@sprout/schema';
import { normalizeTtsText } from './provider';

export const MAX_LESSON_SPEECHES = 128;
const MAX_NODES = 4096;
const MAX_DEPTH = 16;
const SKIP_KEYS = new Set([
  'title', 'summary', 'objectives', 'parentGuide', 'parentTip', 'offline',
  'tips', 'why', 'refs', 'prompts', 'pinyin', 'credit', 'actions',
  'scene', 'sprites', 'cover', 'image', 'poster', 'src', 'url', 'notes',
]);

export interface LessonSpeech {
  lang: Lang;
  text: string;
}

export function collectLessonSpeech(lesson: Lesson): LessonSpeech[] {
  const output: LessonSpeech[] = [];
  const keys = new Set<string>();
  const seen = new WeakSet<object>();
  let nodes = 0;

  const add = (lang: Lang, value: unknown) => {
    if (typeof value !== 'string' || output.length >= MAX_LESSON_SPEECHES) return;
    let text: string;
    try { text = normalizeTtsText(value); } catch { return; }
    const key = speechKey(lang, text);
    if (!keys.has(key)) {
      keys.add(key);
      output.push({ lang, text });
    }
  };

  const visit = (value: unknown, depth: number): void => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH || output.length >= MAX_LESSON_SPEECHES ||
        !value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) {
        if (nodes >= MAX_NODES || output.length >= MAX_LESSON_SPEECHES) break;
        visit(child, depth + 1);
      }
      return;
    }
    const record = value as Record<string, unknown>;
    add('zh', record.zh);
    add('en', record.en);
    if ((record.lang === 'zh' || record.lang === 'en') && record.narrate !== false) {
      add(record.lang, record.text);
    }
    for (const key in record) {
      if (++nodes >= MAX_NODES || output.length >= MAX_LESSON_SPEECHES) break;
      if (!Object.hasOwn(record, key)) continue;
      if (SKIP_KEYS.has(key) || key === 'zh' || key === 'en') continue;
      if (key === 'text' && record.narrate === false) continue;
      if ((key === 'caption' || key === 'name') && record.say) continue;
      if (key === 'items' && (record.speak === 'none' || record.sayName === false)) continue;
      visit(record[key], depth + 1);
    }
  };

  for (const step of lesson.steps.slice(0, 8)) {
    if (step.type !== 'guide') visit(step.props, 0);
  }
  return output;
}
