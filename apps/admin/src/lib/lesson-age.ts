export function pinAgeWarning(months: number, ageRange: [number, number]): string | undefined {
  const [min, max] = ageRange;
  if (months >= min && months <= max) return undefined;
  const suggestion = `当前月龄 ${months} 个月，课程建议 ${min}–${max} 个月。`;
  return months >= min && months <= max + 3
    ? `${suggestion}已超过建议月龄，但仍可在 3 个月的复习延展范围内安排。`
    : `${suggestion}月龄不符，即使置顶也不会排入今日计划；请优先选择适龄课程。`;
}
