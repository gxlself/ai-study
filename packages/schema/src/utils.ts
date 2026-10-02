import type { LanguageMode, Lang, LText, Speech } from './common';

/** 朗读音频清单的 key：语言 + 规范化文本 */
export function speechKey(lang: Lang, text: string): string {
  return `${lang}:${text.trim().replace(/\s+/g, ' ')}`;
}

/** 按语言模式返回朗读顺序 */
export function langOrder(mode: LanguageMode): Lang[] {
  switch (mode) {
    case 'zh':
      return ['zh'];
    case 'en':
      return ['en'];
    case 'en-zh':
      return ['en', 'zh'];
    case 'zh-en':
    default:
      return ['zh', 'en'];
  }
}

/** 按语言模式把 Speech 展开为待朗读片段（缺失的语言跳过；若全缺则回退到可用的那个） */
export function speechParts(s: Speech | string, mode: LanguageMode): { lang: Lang; text: string }[] {
  const sp: Speech = typeof s === 'string' ? { zh: s } : s;
  const parts = langOrder(mode)
    .map((lang) => ({ lang, text: sp[lang] }))
    .filter((p): p is { lang: Lang; text: string } => !!p.text);
  if (parts.length) return parts;
  if (sp.zh) return [{ lang: 'zh', text: sp.zh }];
  if (sp.en) return [{ lang: 'en', text: sp.en }];
  return [];
}

/** 按语言模式挑选显示文本：主语言 + 可选副语言 */
export function pickText(t: LText, mode: LanguageMode): { primary: string; secondary?: string } {
  const order = langOrder(mode);
  const get = (l: Lang) => (l === 'zh' ? t.zh : t.en);
  const primary = get(order[0]) ?? t.zh;
  const secondary = order[1] ? get(order[1]) : undefined;
  return { primary, secondary: secondary && secondary !== primary ? secondary : undefined };
}

/** 月龄（整月）与日龄 */
export function ageOf(birthday: string, today: Date = new Date()): { months: number; days: number } {
  const [y, m, d] = birthday.split('-').map(Number);
  const b = new Date(y, m - 1, d);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let months = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth());
  if (t.getDate() < b.getDate()) months -= 1;
  const days = Math.round((t.getTime() - b.getTime()) / 86400000);
  return { months: Math.max(0, months), days: Math.max(0, days) };
}

const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 数字转中文（0-99）。
 * quantity=true 时用于"数量"语境：2 → "两"（"两只小狗"）；计数 / 唱数语境 2 → "二"。
 */
export function numberToZh(n: number, quantity = false): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (quantity && n === 2) return '两';
  if (n <= 10) return ZH_DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const head = tens === 1 ? '十' : `${ZH_DIGITS[tens]}十`;
  return ones === 0 ? head : `${head}${ZH_DIGITS[ones]}`;
}

const EN_NUMBERS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
export function numberToEn(n: number): string {
  return EN_NUMBERS[n] ?? String(n);
}

/** 英文复数：优先使用词条 plural；否则按常见规则 */
export function pluralEn(word: string, n: number, plural?: string): string {
  if (n === 1) return word;
  if (plural) return plural;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** "一共三只小狗" / "Three dogs!" */
export function cardinalitySpeech(
  n: number,
  concept: { zh: string; en?: string; measure?: string; plural?: string },
): Speech {
  const measure = concept.measure ?? '个';
  const en = concept.en ? `${capitalize(numberToEn(n))} ${pluralEn(concept.en, n, concept.plural)}!` : undefined;
  return { zh: `一共${numberToZh(n, true)}${measure}${concept.zh}`, en };
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
