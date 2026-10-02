import type { Lesson, LessonSummary } from '@sprout/schema';

export function summarizeLesson(
  lesson: Lesson,
  packId: string,
  resolveImage?: (packPath: string) => string,
): LessonSummary {
  const summary: LessonSummary = {
    id: lesson.id,
    packId,
    title: { ...lesson.title },
    ageRange: [...lesson.ageRange],
    domains: [...lesson.domains],
    durationMin: lesson.durationMin,
    coView: lesson.coView,
    audience: lesson.audience ?? 'child',
    hasPrintables: !!lesson.printables?.length,
    stepTypes: [...new Set(lesson.steps.map((step) => step.type))],
  };
  if (lesson.summary !== undefined) summary.summary = { ...lesson.summary };
  if (lesson.themeId !== undefined) summary.themeId = lesson.themeId;
  if (lesson.tags !== undefined) summary.tags = [...lesson.tags];
  if (lesson.cover !== undefined) {
    summary.cover = { ...lesson.cover };
    if (lesson.cover.image) {
      const image = lesson.cover.image;
      summary.cover.imageUrl = resolveImage
        ? resolveImage(image)
        : /^(?:\/|[a-z][a-z\d+.-]*:)/i.test(image)
          ? image
          : `/packs/${packId}/${image}`;
    }
  }
  return summary;
}
