import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChildInput, ChildScreenSettings, PlanOverrides, MilestoneObservationInput, ageOf, type Route } from '@sprout/schema';
import { childScreenSeconds, computeStats, findStage, localDateString, planToday, resolveChildMode, resolveScreenPolicy, screenStatus } from '@sprout/core';
import { authorizeChild } from '../auth';
import { ApiError, dateString, localDate, parse } from '../errors';
import { options, parameter, sessionLessonIndex, type AppContext } from '../context';

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const windowsSchema = z.array(z.object({ start: clock, end: clock }).strict()).max(24);
const screenSchema = ChildScreenSettings.extend({ windows: windowsSchema.default([{ start: '08:00', end: '18:30' }]) });
export const childInputSchema = ChildInput.extend({
  name: z.string().trim().min(1).max(20),
  birthday: dateString,
  screen: screenSchema.default(ChildInput.parse({ name: '_', birthday: '2000-01-01' }).screen),
}).refine((input) => input.birthday <= localDateString(new Date()), { path: ['birthday'], message: '生日不能晚于今天' });
// Zod 的 default 包在 optional 内仍会填值；更新 schema 明确去掉默认值，保留未提交的设置。
const childPatchSchema = z.object({
  name: ChildInput.shape.name.optional(),
  nickname: ChildInput.shape.nickname,
  birthday: dateString.optional(),
  avatar: ChildInput.shape.avatar,
  languageMode: ChildInput.shape.languageMode.unwrap().optional(),
  showPinyin: ChildInput.shape.showPinyin.unwrap().optional(),
  screen: z.object({
    sessionMaxMin: ChildScreenSettings.shape.sessionMaxMin.unwrap().optional(),
    dailyMaxMin: ChildScreenSettings.shape.dailyMaxMin.unwrap().optional(),
    distanceReminder: ChildScreenSettings.shape.distanceReminder.unwrap().optional(),
    mode: ChildScreenSettings.shape.mode,
    windows: windowsSchema.optional(),
  }).strict().optional(),
  plan: z.object({
    routeId: PlanOverrides.shape.routeId.unwrap().optional(),
    themeId: PlanOverrides.shape.themeId.unwrap().optional(),
    pinned: PlanOverrides.shape.pinned.unwrap().optional(),
    skipped: PlanOverrides.shape.skipped.unwrap().optional(),
    focusDomains: PlanOverrides.shape.focusDomains.unwrap().optional(),
  }).strict().optional(),
}).strict();

function dayBounds(date: Date): { from: string; to: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function routeFor(context: AppContext, id: string): Route {
  const route = context.packs.getRoute(id);
  if (!route) throw new ApiError(404, 'ROUTE_NOT_FOUND', '所选成长路线不存在或对应内容包已停用，请在孩子设置中选择可用路线');
  return route;
}

export function registerChildren(app: FastifyInstance, context: AppContext): void {
  const { store, packs } = context;
  const route = (scope: 'admin' | 'either', summary: string) => options(context, scope, '孩子与计划', summary);
  app.get('/api/children', route('admin', '孩子列表'), async () => store.children());
  app.post('/api/children', route('admin', '添加孩子'), async (request, reply) => {
    const child = store.saveChild(parse(childInputSchema, request.body));
    reply.code(201);
    return child;
  });
  app.get('/api/children/:id', route('either', '孩子资料'), async (request) => {
    authorizeChild(store, request, parameter(request));
    return store.child(parameter(request));
  });
  app.put('/api/children/:id', route('admin', '更新孩子资料及屏幕和排课设置'), async (request) => {
    const child = store.child(parameter(request));
    const patch = parse(childPatchSchema, request.body);
    const input = parse(childInputSchema, {
      ...child, ...patch, screen: { ...child.screen, ...patch.screen }, plan: { ...child.plan, ...patch.plan },
    });
    return store.saveChild(input, child);
  });
  app.delete('/api/children/:id', route('admin', '删除孩子及其学习记录'), async (request) => {
    store.deleteChild(parameter(request));
    return { ok: true };
  });
  app.get('/api/children/:id/today', route('either', '今日学习计划'), async (request) => {
    const id = parameter(request);
    authorizeChild(store, request, id);
    const query = parse(z.object({ date: dateString.optional() }), request.query);
    const now = new Date();
    const date = query.date && query.date !== localDateString(now) ? localDate(query.date) : now;
    const child = store.child(id);
    const historyFrom = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 59);
    const bounds = dayBounds(date);
    const todaySessions = store.sessions({ childId: id, ...bounds });
    return planToday({
      route: routeFor(context, child.plan.routeId), lessons: packs.lessonIndex(), child, date,
      history: store.sessions({ childId: id, from: historyFrom.toISOString(), to: bounds.to }),
      usedSec: childScreenSeconds(todaySessions, sessionLessonIndex(context)),
    });
  });
  app.get('/api/children/:id/screen', route('either', '今日屏幕使用状态'), async (request) => {
    const id = parameter(request);
    authorizeChild(store, request, id);
    const child = store.child(id);
    const now = new Date();
    const selectedRoute = packs.getRoute(child.plan.routeId);
    const ageMonths = ageOf(child.birthday, now).months;
    const stage = selectedRoute ? findStage(selectedRoute, ageMonths) : null;
    return {
      ...screenStatus({
        policy: resolveScreenPolicy(stage, child.screen, ageMonths), windows: child.screen.windows, now,
        usedSec: childScreenSeconds(store.sessions({ childId: id, ...dayBounds(now) }), sessionLessonIndex(context)),
      }),
      mode: resolveChildMode(stage, child, ageMonths),
    };
  });
  app.get('/api/children/:id/stats', route('admin', '学习记录统计'), async (request) => {
    const id = parameter(request);
    store.child(id);
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(366).default(7) }), request.query);
    return computeStats(store.sessions({ childId: id }), sessionLessonIndex(context), days, new Date());
  });
  app.get('/api/children/:id/milestones', route('admin', '成长观察条目与记录'), async (request) => {
    const id = parameter(request);
    store.child(id);
    return {
      items: context.milestones.items, observations: store.observations(id), disclaimer: context.milestones.disclaimer,
    };
  });
  app.put('/api/children/:id/milestones/:itemId', route('admin', '保存成长观察'), async (request) => {
    const childId = parameter(request);
    const itemId = parameter(request, 'itemId');
    store.child(childId);
    if (!context.milestones.items.some((item) => item.id === itemId)) {
      throw new ApiError(404, 'MILESTONE_NOT_FOUND', '未找到此成长观察条目');
    }
    const input = parse(MilestoneObservationInput.extend({ observedAt: dateString }).strict(), request.body);
    const observation = { ...input, childId, itemId, updatedAt: new Date().toISOString() };
    store.putObservation(observation);
    return observation;
  });
  app.delete('/api/children/:id/milestones/:itemId', route('admin', '清除成长观察'), async (request) => {
    store.child(parameter(request));
    store.db.prepare('DELETE FROM milestone_observations WHERE child_id = ? AND item_id = ?')
      .run(parameter(request), parameter(request, 'itemId'));
    return { ok: true };
  });
}
