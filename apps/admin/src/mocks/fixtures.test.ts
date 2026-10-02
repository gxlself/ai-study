import { describe, expect, it } from 'vitest';
import { ChildInput, Concept, Route, validateLesson } from '@sprout/schema';
import { initialData } from './fixtures';

describe('开发演示的契约一致性', () => {
  it('孩子、词条和路线均符合共享 schema', () => {
    const data = initialData();
    data.children.forEach((child) => expect(ChildInput.safeParse(child).success).toBe(true));
    data.concepts.forEach((concept) => expect(Concept.safeParse(concept).success).toBe(true));
    expect(Route.safeParse(data.route).success).toBe(true);
  });
  it('课程含线下活动，内置参数及词条引用有效', () => {
    const data = initialData();
    for (const lesson of data.lessons) {
      const result = validateLesson(lesson, { knownConcepts: new Set(data.concepts.map((item) => item.id)) });
      expect(result.issues.filter((issue) => issue.level === 'error')).toEqual([]);
    }
  });
});
