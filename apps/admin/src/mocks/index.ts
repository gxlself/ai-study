import dayjs from 'dayjs';
import {
  ageOf, allJsonSchemas, ChildInput, Concept, MilestoneObservationInput, validateLesson,
  type ChildProfile, type Lesson, type MilestoneObservation, type LessonSummary, type TodayPlan,
} from '@sprout/schema';
import { initialData } from './fixtures';

export function installMock() {
  if (!import.meta.env.DEV || window.__sproutMock) return;
  window.__sproutMock = true;
  const realFetch = window.fetch.bind(window);
  const db = initialData();
  let initialized = new URLSearchParams(location.search).get('setup') !== '1';
  let settings = {
    familyName: '小芽的家', ttsProvider: 'none', ttsVoices: { zh: '', en: '' },
    serverUrlHint: 'http://192.168.1.100:4310',
  };
  const observations: MilestoneObservation[] = [];
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  const failed = (message: string, status = 400, issues?: unknown) => reply({ error: { code: 'MOCK', message }, issues }, status);
  const packId = (id: string) => id.startsWith('custom.') ? 'sprout.custom' : 'sprout.core';
  const summary = (lesson: Lesson): LessonSummary => ({
    ...lesson, packId: packId(lesson.id), audience: lesson.audience, hasPrintables: !!lesson.printables?.length,
    stepTypes: lesson.steps.map((step) => step.type),
    cover: lesson.cover ? { ...lesson.cover, imageUrl: db.concepts.find((item) => item.id === lesson.cover?.concept)?.imageUrl } : undefined,
  });
  const now = () => new Date().toISOString();

  async function handle(url: URL, method: string, raw: unknown): Promise<Response> {
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const body = typeof raw === 'string' ? JSON.parse(raw) as Record<string, unknown> : {};
    if (path === '/api/health') return reply({ ok: true, version: '0.0.1-dev', time: now() });
    if (path === '/api/setup/status') return reply({ initialized });
    if (path === '/api/setup') {
      if (initialized) return failed('家庭已经初始化');
      const parsed = ChildInput.safeParse(body.child);
      if (!parsed.success || typeof body.password !== 'string' || body.password.length < 6) return failed('请检查家庭资料');
      initialized = true;
      settings.familyName = String(body.familyName ?? '我的家');
      db.children.splice(0, db.children.length, { ...parsed.data, id: 'child-new', createdAt: now(), updatedAt: now() });
      return reply({ token: 'development-only-token' });
    }
    if (path === '/api/auth/login') {
      return body.password === 'sprout-demo'
        ? reply({ token: 'development-only-token', expiresAt: dayjs().add(30, 'day').toISOString() })
        : failed('演示密码为 sprout-demo', 401);
    }
    if (path === '/api/auth/me') return reply({ role: 'admin' });
    if (path === '/api/auth/logout' || path === '/api/auth/password') return reply({ ok: true });
    if (path === '/api/preview/token' && method === 'POST') {
      return reply({ token: 'development-preview-only-token', expiresAt: dayjs().add(10, 'minute').toISOString() });
    }
    if (path === '/api/schemas') return reply(allJsonSchemas());
    if (path === '/api/settings') {
      if (method === 'PUT') settings = { ...settings, ...body } as typeof settings;
      return reply(settings);
    }
    if (path === '/api/tts/status') return reply({ available: false, provider: 'none', voices: { zh: [], en: [] } });
    if (path === '/api/tts') return failed('开发演示环境没有语音服务，请使用浏览器朗读', 503);
    if (path === '/api/children' && method === 'GET') return reply(db.children);
    if (path === '/api/children' && method === 'POST') {
      const parsed = ChildInput.safeParse(body);
      if (!parsed.success) return failed('孩子资料格式不正确');
      const child: ChildProfile = { ...parsed.data, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
      db.children.push(child);
      return reply(child, 201);
    }
    if (parts[1] === 'children' && parts[2]) {
      const child = db.children.find((item) => item.id === parts[2]);
      if (!child) return failed('未找到孩子档案', 404);
      if (parts.length === 3) {
        if (method === 'DELETE') {
          db.children.splice(db.children.indexOf(child), 1);
          db.sessions = db.sessions.filter((session) => session.childId !== child.id);
          return reply({ ok: true });
        }
        if (method === 'PUT') {
          const next = {
            ...child, ...body,
            screen: { ...child.screen, ...(body.screen as object ?? {}) },
            plan: { ...child.plan, ...(body.plan as object ?? {}) },
          };
          const parsed = ChildInput.safeParse(next);
          if (!parsed.success) return failed('孩子资料格式不正确');
          Object.assign(child, parsed.data, { updatedAt: now() });
        }
        return reply(child);
      }
      const age = ageOf(child.birthday);
      const stage = db.route.stages.find((item) => age.months >= item.ageRange[0] && age.months <= item.ageRange[1]) ?? db.route.stages[0];
      const usedSec = db.sessions.filter((item) => item.childId === child.id && item.audience !== 'parent' && dayjs(item.startedAt).isSame(dayjs(), 'day')).reduce((sum, item) => sum + item.durationSec, 0);
      const parentOnly = child.screen.mode === 'parent-only' || age.months < 18 || stage.screen.childScreen === 'none' ||
        (child.screen.mode !== 'co-view' && stage.screen.childScreen === 'optional');
      const mode = parentOnly ? 'parent-only' : 'co-view';
      const screen: TodayPlan['screen'] = {
        usedSec, dailyMaxSec: (child.screen.dailyMaxMin ?? stage.screen.dailyMaxMin) * 60,
        sessionMaxSec: (child.screen.sessionMaxMin ?? stage.screen.sessionMaxMin) * 60,
        allowedNow: true, coView: stage.screen.coView, mode,
      };
      if (parts[3] === 'today') {
        const theme = stage.themes.find((item) => item.id === child.plan.themeId) ?? stage.themes[0];
        const plan: TodayPlan = {
          date: dayjs().format('YYYY-MM-DD'), child: { id: child.id, name: child.name, ageMonths: age.months, ageDays: age.days },
          route: { id: db.route.id, title: db.route.title }, stage,
          theme: { ...theme, weekIndex: 0 }, screen,
          items: db.lessons.filter((lesson) => !child.plan.skipped.includes(lesson.id) &&
            (!parentOnly || lesson.audience === 'parent') && lesson.ageRange[0] <= age.months && lesson.ageRange[1] >= age.months).slice(0, 2).map((lesson) => ({
            lessonId: lesson.id, lesson: summary(lesson), reason: child.plan.pinned.includes(lesson.id) ? 'pinned' : 'theme',
          })),
        };
        return reply(plan);
      }
      if (parts[3] === 'screen') return reply(screen);
      if (parts[3] === 'stats') {
        const days = Array.from({ length: Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7)) }, (_, index) => index);
        const rows = days.map((_, index) => {
          const date = dayjs().subtract(days.length - 1 - index, 'day').format('YYYY-MM-DD');
          const sessions = db.sessions.filter((item) => item.childId === child.id && dayjs(item.startedAt).format('YYYY-MM-DD') === date);
          return { date, screenSec: sessions.filter((item) => item.audience !== 'parent').reduce((sum, item) => sum + item.durationSec, 0), lessons: sessions.length, completed: sessions.filter((item) => item.completed).length };
        });
        const totalSec = rows.reduce((sum, row) => sum + row.screenSec, 0);
        return reply({ days: rows, domains: totalSec ? { language: totalSec * 0.6, math: totalSec * 0.4 } : {}, totalSec, streakDays: rows.filter((row) => row.lessons).length });
      }
      if (parts[3] === 'milestones') {
        if (parts[4] && method === 'DELETE') {
          const index = observations.findIndex((item) => item.childId === child.id && item.itemId === parts[4]);
          if (index >= 0) observations.splice(index, 1);
          return reply({ ok: true });
        }
        if (parts[4] && method === 'PUT') {
          const parsed = MilestoneObservationInput.safeParse(body);
          if (!parsed.success) return failed('观察记录格式不正确');
          const observation: MilestoneObservation = { ...parsed.data, childId: child.id, itemId: parts[4], updatedAt: now() };
          const index = observations.findIndex((item) => item.childId === child.id && item.itemId === parts[4]);
          if (index >= 0) observations[index] = observation;
          else observations.push(observation);
          return reply(observation);
        }
        return reply({ items: db.milestones, observations: observations.filter((item) => item.childId === child.id), disclaimer: { zh: '用于家庭观察，不是诊断工具。此处为开发演示条目，不代替正式里程碑内容。', en: 'Not a diagnostic tool.' } });
      }
    }
    if (path === '/api/routes') return reply([{ id: db.route.id, title: db.route.title, packId: 'sprout.core' }]);
    if (parts[1] === 'routes') return reply(db.route);
    if (path === '/api/lessons' && method === 'GET') {
      const q = url.searchParams;
      return reply(db.lessons.map(summary).filter((lesson) =>
        (!q.get('q') || JSON.stringify(lesson.title).toLowerCase().includes(q.get('q')!.toLowerCase())) &&
        (!q.get('packId') || lesson.packId === q.get('packId')) &&
        (!q.get('domain') || lesson.domains.includes(q.get('domain') as Lesson['domains'][number])) &&
        (!q.get('themeId') || lesson.themeId === q.get('themeId')) &&
        (!q.has('age') || lesson.ageRange[0] <= Number(q.get('age')) && lesson.ageRange[1] >= Number(q.get('age'))),
      ));
    }
    if (parts[1] === 'lessons') {
      const lesson = db.lessons.find((item) => item.id === parts[2]);
      if (parts[3] === 'duplicate' && lesson) {
        const copy = { ...structuredClone(lesson), id: `custom.${crypto.randomUUID()}`, title: { ...lesson.title, zh: `${lesson.title.zh}（我的课程）` } };
        db.lessons.push(copy);
        return reply(copy, 201);
      }
      if ((method === 'POST' && parts.length === 2) || method === 'PUT') {
        const result = validateLesson(body, { knownConcepts: new Set(db.concepts.map((item) => item.id)) });
        if (!result.lesson || result.issues.some((item) => item.level === 'error')) return failed('课程校验未通过', 400, result.issues);
        const next = { ...result.lesson, id: method === 'PUT' ? parts[2] : result.lesson.id.startsWith('custom.') ? result.lesson.id : `custom.${result.lesson.id}` };
        if (method === 'PUT') {
          if (!lesson) return failed('课程不存在', 404);
          if (!lesson.id.startsWith('custom.')) return failed('内置课程不能编辑', 403);
          db.lessons.splice(db.lessons.indexOf(lesson), 1, next);
        } else {
          if (db.lessons.some((item) => item.id === next.id)) return failed('课程标识已存在', 409);
          db.lessons.push(next);
        }
        return reply(next);
      }
      if (!lesson) return failed('课程不存在', 404);
      if (method === 'DELETE') {
        if (!lesson.id.startsWith('custom.')) return failed('内置课程不能删除', 403);
        db.lessons.splice(db.lessons.indexOf(lesson), 1);
        return reply({ ok: true });
      }
      return reply({ lesson, packId: packId(lesson.id), baseUrl: `/packs/${packId(lesson.id)}/`, issues: [] });
    }
    if (parts[1] === 'lexicon') {
      if (method === 'GET') return reply(db.concepts.filter((item) =>
        (!url.searchParams.get('category') || item.category === url.searchParams.get('category')) &&
        (!url.searchParams.get('packId') || item.packId === url.searchParams.get('packId')) &&
        (!url.searchParams.get('q') || `${item.zh} ${item.en} ${item.pinyin}`.includes(url.searchParams.get('q')!)),
      ));
      const index = db.concepts.findIndex((item) => item.id === parts[2] && item.packId === 'sprout.custom');
      if (method === 'DELETE') {
        if (index < 0) return failed('仅能删除自定义词条', 403);
        db.concepts.splice(index, 1);
        return reply({ ok: true });
      }
      const parsed = Concept.safeParse(body);
      if (!parsed.success) return failed('请检查词条信息');
      const concept = { ...parsed.data, packId: 'sprout.custom', imageUrl: db.concepts[0]?.imageUrl ?? '' };
      if (method === 'PUT' && index < 0) return failed('仅能修改自定义词条', 403);
      if (index >= 0) db.concepts[index] = concept;
      else db.concepts.push(concept);
      return reply(concept);
    }
    if (path === '/api/media') {
      const file = raw instanceof FormData ? raw.get('file') : null;
      return reply({ path: `assets/uploads/${crypto.randomUUID()}.png`, url: file instanceof File ? URL.createObjectURL(file) : db.concepts[0].imageUrl });
    }
    if (path === '/api/sessions') return reply(db.sessions.filter((item) =>
      (!url.searchParams.get('childId') || item.childId === url.searchParams.get('childId')) &&
      (!url.searchParams.get('from') || item.startedAt >= url.searchParams.get('from')!) &&
      (!url.searchParams.get('to') || item.startedAt <= url.searchParams.get('to')!),
    ));
    if (parts[1] === 'packs') {
      if (parts[2] === 'import') return failed('开发演示不解压内容包，请连接真实服务器验收导入');
      if (parts[3] === 'validate') return reply({ issues: [] });
      if (parts[3] === 'export') return failed('开发演示不生成内容包，请连接真实服务器导出');
      const pack = db.packs.find((item) => item.id === parts[2]);
      if (method === 'PUT' && pack) pack.enabled = body.enabled === true;
      if (method === 'DELETE' && pack) {
        if (pack.source !== 'installed') return failed('这个内容包不能删除', 403);
        db.packs.splice(db.packs.indexOf(pack), 1);
      }
      return reply(pack ?? db.packs);
    }
    if (parts[1] === 'plugins') {
      if (parts[2] === 'install' || parts[2] === 'remote') return failed('开发演示不安装可执行插件，请连接真实服务器');
      const plugin = db.plugins.find((item) => item.id === parts[2]);
      if (method === 'PUT' && plugin) plugin.enabled = body.enabled === true;
      if (method === 'DELETE' && plugin) {
        if (plugin.source === 'builtin') return failed('内置活动不能删除', 403);
        db.plugins.splice(db.plugins.indexOf(plugin), 1);
      }
      return reply(plugin ?? db.plugins);
    }
    if (path === '/api/pair/approve') {
      if (!/^\d{6}$/.test(String(body.code ?? ''))) return failed('请输入 6 位配对码');
      const childId = typeof body.childId === 'string' ? body.childId : null;
      const device = {
        id: crypto.randomUUID(), name: String(body.name || '新的播放设备'), kind: 'tv', childId,
        allowedChildIds: childId ? [childId] : [], createdAt: now(), lastSeenAt: null,
      };
      db.devices.push(device);
      return reply(device);
    }
    if (parts[1] === 'devices') {
      const device = db.devices.find((item) => item.id === parts[2]);
      if (device && method === 'PUT') {
        const allowed = Object.hasOwn(body, 'allowedChildIds') ? body.allowedChildIds : device.allowedChildIds;
        const childId = Object.hasOwn(body, 'childId') ? body.childId : device.childId;
        if (allowed !== null && (!Array.isArray(allowed) || allowed.some((id) => !db.children.some((child) => child.id === id)))) {
          return failed('允许范围中包含无效的孩子档案');
        }
        if (childId && Array.isArray(allowed) && !allowed.includes(childId)) return failed('绑定孩子不在允许范围内');
        Object.assign(device, body);
      }
      if (device && method === 'DELETE') db.devices.splice(db.devices.indexOf(device), 1);
      return reply(device ?? db.devices);
    }
    if (path === '/api/backup') return reply({ version: 1, children: db.children, sessions: db.sessions, observations, devices: db.devices, settings, custom: { lessons: db.lessons.filter((lesson) => lesson.id.startsWith('custom.')), concepts: db.concepts.filter((item) => item.packId === 'sprout.custom') } });
    if (path === '/api/backup/restore') return failed('开发演示不恢复真实备份，请连接家庭服务器');
    return failed(`开发 mock 尚未实现 ${method} ${path}`, 404);
  }

  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    if (init?.signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
    try { return await handle(url, init?.method ?? 'GET', init?.body); }
    catch { return failed('开发 mock 无法处理此请求，请检查提交数据', 400); }
  };
}
