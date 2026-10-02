export interface HelloProps {
  count: number;
  title: { zh: string; en?: string };
}

export function readHelloProps(input: unknown): HelloProps {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('props 必须为对象');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => key !== 'count' && key !== 'title')) throw new Error('未知 props 字段');
  const count = value.count === undefined ? 3 : value.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 5) {
    throw new Error('count 必须为 1–5 的整数');
  }
  const title = value.title === undefined ? { zh: '一起数星星', en: 'Count the stars' } : value.title;
  if (!title || typeof title !== 'object' || Array.isArray(title)) throw new Error('title 必须为双语对象');
  const text = title as Record<string, unknown>;
  if (Object.keys(text).some((key) => key !== 'zh' && key !== 'en')) throw new Error('未知 title 字段');
  const validText = (value: unknown): value is string =>
    typeof value === 'string' && [...value].length >= 1 && [...value].length <= 80;
  if (!validText(text.zh) || (text.en !== undefined && !validText(text.en))) {
    throw new Error('title.zh 必填，标题长度必须为 1–80 个字符');
  }
  return { count, title: { zh: text.zh, ...(text.en === undefined ? {} : { en: text.en as string }) } };
}
