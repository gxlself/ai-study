import { describe, expect, it } from 'vitest';
import { type Lesson, type PluginInfo, type ResolvedConcept } from '@sprout/schema';
import {
  activityChoices, assetUrl, choicesForAudience, CONTRACT_SCHEMAS, newLesson, newStep, preferredConcepts, responseLessonId,
  stepDraft, toggleLessonPlan, validateDraft,
} from './model';

const word: ResolvedConcept = {
  id: 'apple', zh: '苹果', en: 'apple', category: 'fruits',
  image: 'assets/apple.svg', imageUrl: '/packs/sprout.core/assets/apple.svg', packId: 'sprout.core',
};
function validLesson(): Lesson {
  return {
    schemaVersion: 1, id: 'custom.test', title: { zh: '认识苹果' }, ageRange: [18, 24],
    domains: ['language'], durationMin: 3, coView: 'required', objectives: [{ zh: '认识苹果' }],
    parentGuide: { intro: '一起看看苹果。' }, offline: [{ title: '找一找', steps: ['看看家里的苹果。'] }],
    steps: [{ type: 'word-cards', props: { items: ['apple'], autoAdvanceSec: null } }],
  };
}

describe('课程草稿与契约', () => {
  it('在调用服务端前补齐内置参数默认值，保留手动翻页 null', () => {
    const lesson = validLesson();
    const result = validateDraft(lesson, lesson.steps.map(stepDraft), [word]);
    expect(result.issues).toEqual([]);
    expect(result.lesson?.steps[0].props).toMatchObject({ autoAdvanceSec: null, speak: 'name', show: { text: true, english: true, pinyin: false } });
  });

  it('空可选元数据不产生 Zod 必填错误', () => {
    const lesson = validLesson();
    const result = validateDraft({ ...lesson, summary: { zh: '', en: '' }, cover: {}, title: { zh: '认识苹果', en: '' } }, lesson.steps.map(stepDraft), [word]);
    expect(result.issues).toEqual([]);
    expect(result.lesson).not.toHaveProperty('summary');
    expect(result.lesson?.title).toEqual({ zh: '认识苹果' });
  });

  it('不会将无效 JSON 静默替换成上一个有效值提交', () => {
    const lesson = validLesson();
    const draft = stepDraft(lesson.steps[0]);
    draft.mode = 'json';
    draft.json = '{"items":';
    const result = validateDraft(lesson, [draft], [word]);
    expect(result.issues.some((issue) => issue.path === 'steps.0.props' && issue.level === 'error')).toBe(true);
  });

  it('定位不存在的词条和不属于选项的答案', () => {
    const lesson = validLesson();
    expect(validateDraft(lesson, lesson.steps.map(stepDraft), []).issues[0]).toMatchObject({ path: 'steps.0.props', level: 'error' });
    const choose = stepDraft({ type: 'choose', props: {
      rounds: [{ prompt: { zh: '找苹果' }, options: ['apple', 'banana'], answer: 'orange' }],
    } });
    expect(validateDraft(lesson, [choose]).issues).toContainEqual({
      path: 'steps.0.props.rounds.0.answer', message: 'answer "orange" 不在 options 中', level: 'error',
    });
  });

  it('从已登记插件读取 schema、defaultProps 和适龄，禁用插件不能保存', () => {
    const plugins: PluginInfo[] = [{
      id: 'example', name: { zh: '示例' }, version: '1.0.0', source: 'installed', enabled: false, permissions: [],
      activities: [{ type: 'example.test', name: { zh: '活动' }, ageRange: [12, 36],
        propsSchema: { type: 'object', properties: { manual: { type: ['number', 'null'], default: null } } },
        defaultProps: { label: '你好' } }],
    }];
    const choices = activityChoices(plugins, CONTRACT_SCHEMAS);
    const step = newStep(choices[0]);
    expect(step.step.props).toEqual({ manual: null, label: '你好' });
    expect(choices[0].ageRange).toEqual([12, 36]);
    expect(validateDraft(validLesson(), [step], [word], choices).issues).toContainEqual({
      path: 'steps.0.type', message: '此活动插件未启用或存在加载错误', level: 'error',
    });
  });

  it('保存响应支持 Lesson 与包含 lesson 的文档', () => {
    expect(responseLessonId({ id: 'custom.a' })).toBe('custom.a');
    expect(responseLessonId({ lesson: { id: 'custom.b' } })).toBe('custom.b');
    expect(responseLessonId(null)).toBeUndefined();
  });
  it('新草稿默认家长指引课，家长步骤仅允许 guide/song', () => {
    expect(newLesson()).toMatchObject({ audience: 'parent', ageRange: [6, 17] });
    const choices = ['guide', 'song', 'word-cards', 'example.test'].map((type) => ({
      type, name: type, enabled: true, pluginName: '测试',
    }));
    expect(choicesForAudience(choices, 'parent').map((item) => item.type)).toEqual(['guide', 'song']);
    expect(choicesForAudience(choices, undefined)).toEqual(choices);
  });
  it('共看课不得低于 18 月龄、必须陪同，18–23 月不得超过 8 分钟', () => {
    const lesson = validLesson();
    const validate = (patch: Partial<Lesson>) => validateDraft({ ...lesson, ...patch }, lesson.steps.map(stepDraft), [word]).issues;
    expect(validate({ ageRange: [12, 17] }).some((issue) => issue.path === 'ageRange')).toBe(true);
    expect(validate({ coView: 'optional' }).some((issue) => issue.path === 'coView')).toBe(true);
    expect(validate({ durationMin: 9 }).some((issue) => issue.path === 'durationMin')).toBe(true);
  });
  it('家长课保留开放问题、分级玩法、实体材料，并校验材料的词条引用', () => {
    const lesson = validLesson();
    const metadata = {
      ...lesson, audience: 'parent', ageRange: [6, 17],
      offline: [{ title: '一起玩', steps: ['看看苹果。'], question: '你想拿哪一个？', levels: { easier: '只放一张卡', harder: '两张卡二选一' } }],
      printables: [{ kind: 'cards', title: '水果卡', items: ['apple'], size: 'medium', showText: true, showEnglish: false }],
    };
    const steps = [stepDraft({ type: 'guide', props: { goal: '认识苹果', steps: [{ text: '指一指苹果。' }] } })];
    const result = validateDraft(metadata, steps, [word]);
    expect(result.issues).toEqual([]);
    expect(result.lesson?.offline[0].levels?.harder).toBe('两张卡二选一');
    expect(result.lesson?.printables?.[0]).toMatchObject({ size: 'medium', showEnglish: false });
    expect(validateDraft(metadata, steps, []).issues.some((issue) => issue.path === 'printables.0.items')).toBe(true);
  });
});

describe('资源解析与孩子安排', () => {
  it('词条按本包、核心包、其他启用包优先，不能选择含糊的同名词条', () => {
    const custom = { ...word, packId: 'sprout.custom', zh: '我的苹果', imageUrl: '/packs/sprout.custom/assets/apple.svg' };
    expect(preferredConcepts([word, custom])[0]).toEqual(custom);
    expect(preferredConcepts([custom, word], 'sprout.core')[0]).toEqual(word);
    expect(assetUrl('concept:apple', 'sprout.custom', [word, custom])).toBe(custom.imageUrl);
  });

  it('正确处理相对资源与绝对 URL，拒绝脚本和路径穿越', () => {
    expect(assetUrl('assets/家人.png')).toBe('/packs/sprout.custom/assets/%E5%AE%B6%E4%BA%BA.png');
    expect(assetUrl('/packs/core/a.svg')).toBe('/packs/core/a.svg');
    expect(assetUrl('https://example.org/a.jpg')).toBe('https://example.org/a.jpg');
    for (const path of ['javascript:alert(1)', '../secret', '//example.org/a.jpg', 'assets\\file']) {
      expect(assetUrl(path)).toBeUndefined();
    }
  });

  it('置顶和跳过互斥，保留其他课程且不修改原计划', () => {
    const plan = { routeId: 'core', themeId: null, pinned: ['a'], skipped: ['b'], focusDomains: [] };
    expect(toggleLessonPlan(plan, 'b', 'pinned')).toEqual({ pinned: ['a', 'b'], skipped: [] });
    expect(toggleLessonPlan(plan, 'a', 'skipped')).toEqual({ pinned: [], skipped: ['b', 'a'] });
    expect(toggleLessonPlan(plan, 'a', 'pinned')).toEqual({ pinned: [], skipped: ['b'] });
    expect(plan.pinned).toEqual(['a']);
  });
});
