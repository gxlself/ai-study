const DAY_MS = 86_400_000;

function dateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function localDateString(d: Date): string {
  return dateParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** 用本地年月日生成日序号，避免 DST 的 23/25 小时日影响日历运算。 */
export function localDayNumber(date: Date): number {
  const calendar = new Date(0);
  calendar.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return calendar.getTime() / DAY_MS;
}

export function dateStringFromDay(day: number): string {
  const date = new Date(day * DAY_MS);
  return dateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function birthdayMonthDay(birthday: string, months: number): number {
  const [year, month, day] = birthday.split('-').map(Number);
  const calendar = new Date(0);
  // 先取目标月末，再夹住生日的日号，避免 31 日加月溢出到下个月。
  calendar.setUTCFullYear(year, month + months, 0);
  calendar.setUTCDate(Math.min(day, calendar.getUTCDate()));
  return calendar.getTime() / DAY_MS;
}
