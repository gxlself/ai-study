import type { ValidationIssue } from '@sprout/schema';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
  }
}

export function parse<T>(schema: z.core.$ZodType<T>, input: unknown): T {
  const result = z.safeParse(schema, input);
  if (result.success) return result.data;
  throw new ApiError(400, 'VALIDATION_ERROR', '输入内容未通过校验', result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    level: 'error',
  })));
}

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}, '日期不存在');

export const isoString = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value)) && dateString.safeParse(value.slice(0, 10)).success,
  '请使用有效的 ISO 时间（含时区）',
);

export function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}
