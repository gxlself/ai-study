import {
  ChildInput, Route, type ChildProfile, type MilestoneItem, type MilestoneObservation, type ResolvedConcept,
} from '@sprout/schema';
import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import {
  avatarUrl, childFormValues, completionPercent, errorIssues, errorMessage, milestoneAgeFor,
  milestoneAges, milestoneProgress, prepareChildInput, sessionsPath, stageForAge, timeWindowError,
} from './model';
import { formatAge } from '../../lib/format';

const today = dayjs('2026-10-02');
const child: ChildProfile = {
  ...ChildInput.parse({ name: '测试孩子', nickname: '小芽', birthday: '2025-07-02', avatar: 'bear' }),
  id: 'child-a', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};
const route = Route.parse({
  schemaVersion: 1, id: 'test.route', title: { zh: '测试路线' },
  stages: [
    { id: 'first', title: { zh: '第一阶段' }, ageRange: [6, 11] },
    { id: 'second', title: { zh: '第二阶段' }, ageRange: [12, 23] },
    { id: 'third', title: { zh: '第三阶段' }, ageRange: [24, 36] },
  ].map((stage) => ({
    ...stage, focus: [{ zh: '亲子互动' }],
    screen: { sessionMaxMin: 5, dailyMaxMin: 10, lessonsPerDay: 2, coView: 'required' },
    themes: [{ id: `${stage.id}.theme`, title: { zh: '主题' }, weeks: 2, domains: ['language'], lessons: ['test.lesson'] }],
  })),
});
const items: MilestoneItem[] = [
  { id: 'a', ageMonths: 18, domain: 'motor', zh: '观察 A', en: 'A', source: 'test' },
  { id: 'b', ageMonths: 18, domain: 'motor', zh: '观察 B', en: 'B', source: 'test' },
  { id: 'c', ageMonths: 18, domain: 'language', zh: '观察 C', en: 'C', source: 'test' },
  { id: 'd', ageMonths: 6, domain: 'language', zh: '观察 D', en: 'D', source: 'test' },
];

function observation(itemId: string, status: MilestoneObservation['status']): MilestoneObservation {
  return { childId: child.id, itemId, status, observedAt: '2026-10-02', updatedAt: '2026-10-02T00:00:00.000Z' };
}

describe('孩子表单与契约', () => {
  it('新建档案不继承另一个孩子的设置', () => {
    const values = childFormValues();
    expect(values.name).toBe('');
    expect(values.birthday).toBeNull();
    expect(values.languageMode).toBe('zh-en');
    expect(values.plan.pinned).toEqual([]);
    expect(values.screen.sessionMaxMin).toBeNull();
    expect(values.screen.windows[0].end?.format('HH:mm')).toBe('18:30');
  });

  it('编辑后原样序列化，日期不转 UTC', () => {
    const result = prepareChildInput(childFormValues(child), today);
    expect(result.issues).toEqual([]);
    expect(result.input).toEqual(ChildInput.parse(child));
  });

  it('编辑数组不修改全局孩子档案', () => {
    const values = childFormValues(child);
    values.plan.pinned.push('new.lesson');
    values.plan.focusDomains.push('math');
    values.screen.windows.push({ start: dayjs('2026-10-02T20:00'), end: dayjs('2026-10-02T21:00') });
    expect(child.plan.pinned).toEqual([]);
    expect(child.plan.focusDomains).toEqual([]);
    expect(child.screen.windows).toHaveLength(1);
  });

  it('清空上限保存为 null，清空昵称和头像保存为空串', () => {
    const values = childFormValues(child);
    values.screen.sessionMaxMin = null;
    values.screen.dailyMaxMin = null;
    values.nickname = undefined;
    values.avatar = undefined;
    const result = prepareChildInput(values, today);
    expect(result.input?.screen.sessionMaxMin).toBeNull();
    expect(result.input?.screen.dailyMaxMin).toBeNull();
    expect(result.input?.nickname).toBe('');
    expect(result.input?.avatar).toBe('');
  });

  it('裁剪名字空白，去重课程，不改变课程顺序', () => {
    const values = childFormValues(child);
    values.name = '  芽芽  ';
    values.plan.pinned = ['lesson.b', 'lesson.a', 'lesson.b'];
    const result = prepareChildInput(values, today);
    expect(result.input?.name).toBe('芽芽');
    expect(result.input?.plan.pinned).toEqual(['lesson.b', 'lesson.a']);
  });

  it.each([0, 61, 100])('拒绝每日 %i 分钟', (dailyMaxMin) => {
    const values = childFormValues(child);
    values.screen.dailyMaxMin = dailyMaxMin;
    const result = prepareChildInput(values, today);
    expect(result.input).toBeUndefined();
    expect(result.issues.some((issue) => issue.path === 'screen.dailyMaxMin')).toBe(true);
  });

  it('允许每日硬上限 60 分钟', () => {
    const values = childFormValues(child);
    values.screen.dailyMaxMin = 60;
    expect(prepareChildInput(values, today).input?.screen.dailyMaxMin).toBe(60);
  });

  it('拒绝单次超过 30 分钟', () => {
    const values = childFormValues(child);
    values.screen.sessionMaxMin = 31;
    expect(prepareChildInput(values, today).issues.some((issue) => issue.path === 'screen.sessionMaxMin')).toBe(true);
  });

  it('拒绝未来生日和未填生日', () => {
    const values = childFormValues(child);
    values.birthday = today.add(1, 'day');
    expect(prepareChildInput(values, today).issues.some((issue) => issue.path === 'birthday')).toBe(true);
    values.birthday = null;
    expect(prepareChildInput(values, today).input).toBeUndefined();
  });

  it('拒绝空白名字', () => {
    const values = childFormValues(child);
    values.name = '   ';
    expect(prepareChildInput(values, today).issues.some((issue) => issue.path === 'name')).toBe(true);
  });

  it('拒绝同时置顶和跳过', () => {
    const values = childFormValues(child);
    values.plan.pinned = ['same.lesson'];
    values.plan.skipped = ['same.lesson'];
    const result = prepareChildInput(values, today);
    expect(result.input).toBeUndefined();
    expect(result.issues.some((issue) => issue.path === 'plan.skipped')).toBe(true);
  });

  it('手动主题、语言和领域设置均保留', () => {
    const values = childFormValues(child);
    values.plan.themeId = 'second.theme';
    values.plan.focusDomains = ['math', 'motor'];
    values.languageMode = 'en-zh';
    values.showPinyin = true;
    const result = prepareChildInput(values, today);
    expect(result.input?.plan.themeId).toBe('second.theme');
    expect(result.input?.plan.focusDomains).toEqual(['math', 'motor']);
    expect(result.input?.languageMode).toBe('en-zh');
    expect(result.input?.showPinyin).toBe(true);
  });
  it('禁止 18 月龄以下开启共看，保留家长模式', () => {
    const values = childFormValues(child);
    values.screen.mode = 'co-view';
    expect(prepareChildInput(values, today).issues.some((issue) => issue.path === 'screen.mode')).toBe(true);
    values.screen.mode = 'parent-only';
    expect(prepareChildInput(values, today).input?.screen.mode).toBe('parent-only');
  });
  it('18–23 月龄共看上限 8 分钟，24 个月起上限 20 分钟', () => {
    const values = childFormValues(child);
    values.birthday = today.subtract(20, 'month');
    values.screen.mode = 'co-view';
    values.screen.sessionMaxMin = 9;
    expect(prepareChildInput(values, today).issues.some((issue) => issue.path === 'screen.sessionMaxMin')).toBe(true);
    values.screen.sessionMaxMin = 8;
    expect(prepareChildInput(values, today).input?.screen.sessionMaxMin).toBe(8);
    values.birthday = today.subtract(26, 'month');
    values.screen.sessionMaxMin = 21;
    expect(prepareChildInput(values, today).issues.some((issue) => issue.path === 'screen.sessionMaxMin')).toBe(true);
  });
});

describe('可用时段', () => {
  it('允许不限制时段和相邻时段', () => {
    expect(timeWindowError([])).toBeUndefined();
    expect(timeWindowError([{ start: '08:00', end: '09:00' }, { start: '09:00', end: '10:00' }])).toBeUndefined();
  });

  it('无序输入也能识别重叠，且不修改原数组', () => {
    const windows = [{ start: '10:00', end: '12:00' }, { start: '09:00', end: '11:00' }];
    expect(timeWindowError(windows)).toContain('重叠');
    expect(windows[0].start).toBe('10:00');
  });

  it('与服务端一致支持跨午夜', () => {
    expect(timeWindowError([{ start: '22:00', end: '02:00' }, { start: '03:00', end: '04:00' }])).toBeUndefined();
    expect(timeWindowError([{ start: '22:00', end: '02:00' }, { start: '01:00', end: '03:00' }])).toContain('重叠');
    expect(timeWindowError([{ start: '22:00', end: '02:00' }, { start: '23:00', end: '01:00' }])).toContain('重叠');
    expect(timeWindowError([{ start: '22:00', end: '00:00' }, { start: '00:00', end: '02:00' }])).toBeUndefined();
  });

  it.each([
    [{ start: '', end: '10:00' }],
    [{ start: '24:00', end: '10:00' }],
    [{ start: '08:70', end: '10:00' }],
    [{ start: '08:00', end: '08:00' }],
  ])('拒绝不完整或非法时段 %j', (window) => {
    expect(timeWindowError([window])).toBeTruthy();
  });
});

describe('成长阶段和里程碑', () => {
  it('阶段边界与排课器一致，包括路线外月龄', () => {
    expect(stageForAge(route, 5)?.id).toBe('first');
    expect(stageForAge(route, 11)?.id).toBe('first');
    expect(stageForAge(route, 12)?.id).toBe('second');
    expect(stageForAge(route, 36)?.id).toBe('third');
    expect(stageForAge(route, 40)?.id).toBe('third');
    expect(stageForAge(undefined, 18)).toBeUndefined();
  });

  it('月龄使用共享中文格式', () => {
    expect(formatAge(15)).toBe('1 岁 3 个月');
    expect(formatAge(24)).toBe('2 岁');
  });

  it('观察年龄去重排序并定位已到达的最近组', () => {
    expect(milestoneAges(items)).toEqual([6, 18]);
    expect(milestoneAgeFor(17, [18, 6, 15, 12])).toBe(15);
    expect(milestoneAgeFor(4, [6, 9])).toBe(6);
    expect(milestoneAgeFor(40, [6, 36])).toBe(36);
    expect(milestoneAgeFor(18, [])).toBeUndefined();
  });

  it('正在萌芽和还没有都已被观察，不算待观察', () => {
    expect(milestoneProgress(items, [observation('a', 'yes'), observation('b', 'emerging')], 18))
      .toEqual({ total: 3, done: 1, pending: 1 });
    expect(milestoneProgress(items, [observation('a', 'yes'), observation('b', 'emerging'), observation('c', 'not-yet')], 18))
      .toEqual({ total: 3, done: 1, pending: 0 });
  });

  it('不把其它月龄和失效条目计入本组', () => {
    expect(milestoneProgress(items, [observation('d', 'yes'), observation('unknown', 'yes')], 18))
      .toEqual({ total: 3, done: 0, pending: 3 });
  });
});

describe('学习记录查询与显示', () => {
  it('日期查询使用本地日界线，结束时间为次日零点（服务端为 < to）', () => {
    const from = dayjs('2026-09-01');
    const to = dayjs('2026-09-30');
    const url = new URL(sessionsPath('child a/1', [from, to], 1000), 'http://localhost');
    expect(url.pathname).toBe('/api/sessions');
    expect(url.searchParams.get('childId')).toBe('child a/1');
    expect(url.searchParams.get('from')).toBe(from.startOf('day').toISOString());
    expect(url.searchParams.get('to')).toBe(to.add(1, 'day').startOf('day').toISOString());
    expect(url.searchParams.get('limit')).toBe('1000');
  });

  it('清空日期查询不残留旧的范围', () => {
    const url = new URL(sessionsPath('second', null, 200), 'http://localhost');
    expect(url.searchParams.has('from')).toBe(false);
    expect(url.searchParams.has('to')).toBe(false);
    expect(url.searchParams.get('childId')).toBe('second');
  });

  it('完成度守住零分母与百分比边界', () => {
    expect(completionPercent({ stepsCompleted: 1, stepsTotal: 3 })).toBe(33);
    expect(completionPercent({ stepsCompleted: 0, stepsTotal: 0 })).toBeNull();
    expect(completionPercent({ stepsCompleted: 4, stepsTotal: 2 })).toBe(100);
    expect(completionPercent({ stepsCompleted: -1, stepsTotal: 2 })).toBe(0);
  });
});

describe('资源与错误', () => {
  it('头像按词库 URL 解析，也保留已有上传路径', () => {
    const concept: ResolvedConcept = {
      id: 'bear', category: 'animals', zh: '小熊', en: 'bear',
      image: 'assets/bear.svg', packId: 'sprout.core', imageUrl: '/packs/sprout.core/assets/bear.svg',
    };
    expect(avatarUrl('bear', [concept])).toBe(concept.imageUrl);
    expect(avatarUrl('assets/uploads/photo.png', [])).toBe('/packs/sprout.custom/assets/uploads/photo.png');
    expect(avatarUrl('/packs/sprout.custom/photo.png', [])).toBe('/packs/sprout.custom/photo.png');
    expect(avatarUrl('missing-concept', [])).toBeUndefined();
    expect(avatarUrl('assets/../photo.png', [])).toBeUndefined();
    expect(avatarUrl('javascript:alert(1)', [])).toBeUndefined();
  });

  it('保留服务端错误与字段定位，忽略非结构化 issues', () => {
    expect(errorMessage(new Error('服务不可用'))).toBe('服务不可用');
    expect(errorMessage(null)).toContain('重试');
    expect(errorIssues({ issues: [{ path: ['screen', 'dailyMaxMin'], message: '不能超过 60' }, null, 'bad'] }))
      .toEqual([{ path: 'screen.dailyMaxMin', message: '不能超过 60', level: 'error' }]);
    expect(errorIssues({ issues: 'bad' })).toEqual([]);
  });
});
