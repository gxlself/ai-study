import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChildInput, Lesson, Route, type LessonSummary, type PackBundle } from '@sprout/schema';
import { planToday } from '../../../../packages/core/src/scheduler';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const readJson = (file: string): unknown => JSON.parse(readFileSync(path.join(repo, file), 'utf8'));
const route = Route.parse(readJson('content/packs/sprout-core/routes/sprout-core-route.json'));
const lessons: Record<string, LessonSummary> = {};
for (const file of ['content/packs/sprout-core/bundle.json', 'content/packs/sprout-culture/bundle.json']) {
  const bundle = readJson(file) as PackBundle;
  for (const input of bundle.lessons) {
    const lesson = Lesson.parse(input);
    lessons[lesson.id] = {
      ...lesson, packId: bundle.manifest.id, stepTypes: lesson.steps.map((step) => step.type),
    };
  }
}
const date = new Date(2026, 9, 3, 12);
const rows = [6, 17, 18, 23, 24, 36].map((months) => {
  const born = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const birthday = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-01`;
  const child = {
    id: `culture-age-${months}`,
    ...ChildInput.parse({
      name: '月龄验证', birthday, screen: { mode: 'co-view' },
      plan: { pinned: ['culture.child.spring-festival'] },
    }),
  };
  const plan = planToday({ route, lessons, child, date, history: [], usedSec: 0 });
  const scheduled = plan.items.some((item) => item.lessonId === 'culture.child.spring-festival' && !item.offlineOnly);
  return { ageMonths: plan.child.ageMonths, mode: plan.screen.mode, expected: months >= 24, scheduled };
});
console.log(JSON.stringify({ course: 'culture.child.spring-festival', ageRange: [24, 36], rows }, null, 2));
const mismatches = rows.filter((row) => row.expected !== row.scheduled);
assert.deepEqual(mismatches, [], '共享排课器未按课程ageRange过滤共看置顶；请核心负责人修复，勿放宽本包月龄。');
