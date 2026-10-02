export function formatAge(months: number): string {
  if (!Number.isFinite(months) || months < 0) return '月龄未知';
  const age = Math.floor(months);
  if (age < 12) return `${age} 个月`;
  const rest = age % 12;
  return `${Math.floor(age / 12)} 岁${rest ? ` ${rest} 个月` : ''}`;
}

export function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  if (value < 60) return `${value} 秒`;
  const rest = value % 60;
  return `${Math.floor(value / 60)} 分${rest ? ` ${rest} 秒` : '钟'}`;
}
