import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { BookOpen, Info, Leaf } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Brand, LessonCard, Loading, Page, ParentButton, Problem, useMinuteRefresh } from '../ui/common';
import { effectiveScreen } from '../state/policy';
import { resolvePlaybackMode } from '../data';
import { CoViewNotice } from '../ui/CoViewNotice';
import type { LessonSummary, SessionInput } from '@sprout/schema';

export function Home() {
  const app = useApp();
  const navigate = useNavigate();
  const [recent, setRecent] = useState<SessionInput[]>([]);
  const child = app.bootstrap?.child;
  useMinuteRefresh();
  useEffect(() => { void app.refresh().catch(() => undefined); }, [app.refresh]);
  useEffect(() => {
    let active = true;
    if (app.source && child) void app.source.recent(child.id).then((records) => { if (active) setRecent(records); }).catch(() => undefined);
    return () => { active = false; };
  }, [app.source, child]);
  const plan = app.plan;
  if (!plan || !child) return <Page><header><Brand /></header>{app.error ? <Problem message={app.error} retry={() => void app.refresh().catch(() => undefined)} /> : <Loading />}<ParentButton /></Page>;
  const screen = effectiveScreen(plan.screen, child.id);
  const parentOnly = resolvePlaybackMode(plan.screen, child) === 'parent-only';
  if (!parentOnly && !screen.allowedNow && plan.items.length) return <Navigate to="/rest" replace />;
  const notice = plan.notice === 'before-first-stage'
    ? '宝宝还不到 6 个月。下面是 6 个月起的陪伴活动，家长可以先学起来；现在最重要的是面对面说话和回应、每天分次清醒俯卧、按需喂养和睡眠，不需要屏幕。'
    : plan.notice === 'after-last-stage' ? '已超过 3 岁，继续使用最后阶段内容，也可以按孩子兴趣自由选择课程库' : undefined;
  const appropriateParents = app.lessons.filter((lesson) => lesson.audience === 'parent' && !child.plan.skipped.includes(lesson.id) && plan.child.ageMonths >= lesson.ageRange[0] && plan.child.ageMonths <= lesson.ageRange[1]);
  const parents = [...new Map([
    ...plan.items.filter((item) => item.offlineOnly || item.lesson.audience === 'parent'),
    ...appropriateParents.map((lesson) => ({ lessonId: lesson.id, lesson, offlineOnly: false })),
  ].map((item) => [item.lesson.id, item])).values()].slice(0, parentOnly ? plan.items.length : 4);
  const journeys = plan.items.filter(({ lesson, offlineOnly }) => !offlineOnly && lesson.audience !== 'parent');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const seen = new Set<string>();
  const completed = recent.filter((record) => {
    if (!record.completed || record.audience === 'parent' || seen.has(record.lessonId)) return false;
    seen.add(record.lessonId); return true;
  }).map((record) => app.lessons.find((lesson) => lesson.id === record.lessonId)).filter((lesson): lesson is LessonSummary => !!lesson && lesson.audience !== 'parent').slice(0, 3);
  const used = Math.min(1, screen.usedSec / Math.max(1, screen.dailyMaxSec));
  async function back() {
    if (await app.askParent()) { app.setParentAccess(true); navigate('/parent'); }
  }
  async function openLibrary() {
    if (await app.askParent()) { app.setParentAccess(true); navigate('/parent?tab=library'); }
  }
  const emptyPlan = <div className="today-empty" role="status">
    <p>{parentOnly ? '今天没有可用的家长指引。可以打开课程库先学一节，或在孩子档案中检查路线和跳过设置。' : '今天没有可用的共看课程。可以打开课程库选一节家长指引，或检查路线和课程偏好。'}</p>
    <button className="secondary" data-focusable onClick={() => void openLibrary()}><BookOpen aria-hidden="true" />打开课程库</button>
  </div>;
  return <><Page className={`home ${parentOnly ? 'parent-home' : ''}`} onBack={() => void back()}>
    <header className="home-header"><Brand />
      {parentOnly ? <span className="parent-mode-label">家长模式</span> : <div className="screen-time" aria-label={`今日屏幕时间 ${Math.ceil(screen.usedSec / 60)} 分钟，共 ${screen.dailyMaxSec / 60} 分钟`}>
        <span className="time-ring" style={{ '--used-angle': `${used * 360}deg` } as React.CSSProperties}><small>{Math.ceil(screen.usedSec / 60)}</small></span>
        <span>今日屏幕时间<small>{screen.dailyMaxSec / 60} 分钟以内</small></span>
      </div>}
    </header>
    <main>
      <div className="home-greeting"><h1>{parentOnly ? `${child.nickname || child.name}的家长，${greeting}` : `${greeting}，${child.nickname || child.name}`}</h1><p>{plan.stage?.title.zh ?? '一起探索'}{plan.theme && <> · {plan.theme.title.zh}</>}</p>
        {notice ? <div className="plan-range-notice" role="status"><Info aria-hidden="true" /><p>{notice}</p></div>
          : parentOnly && <p className="parent-mode-notice">这个月龄屏幕只给家长看：读 1–3 分钟就放下，去和宝宝玩真东西</p>}
      </div>
      {parentOnly ? <section className="parent-journey"><h2>今天陪宝宝玩什么</h2>{parents.length > 0 && <div className="parent-guide-grid today-grid" style={{ '--lesson-count': parents.length } as React.CSSProperties}>{parents.map(({ lesson, offlineOnly }) => <LessonCard key={lesson.id} lesson={lesson} offlineOnly={offlineOnly} adult />)}</div>}
        {!parents.length && emptyPlan}
      </section> : <><section className="journey"><div className="section-heading"><h2>今天的小旅程</h2><span><Leaf />家长全程陪同</span></div>
        {journeys.length > 0 && <div className="journey-grid today-grid" style={{ '--lesson-count': Math.min(4, journeys.length) } as React.CSSProperties}>
          {journeys.slice(0, 4).map(({ lesson }) => <LessonCard key={lesson.id} lesson={lesson} />)}
        </div>}
        {!journeys.length && emptyPlan}
      </section>
      {parents.length > 0 && <section className="parent-guide-section"><h2>家长指引</h2><div className="parent-guide-grid">{parents.map(({ lesson, offlineOnly }) => <LessonCard key={lesson.id} lesson={lesson} offlineOnly={offlineOnly} adult />)}</div></section>}
      {completed.length > 0 && <section className="again"><h2>再玩一次</h2><div className="recent-grid">{completed.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} compact />)}</div></section>}</>}
      {app.error && <p className="connection-note" role="status">连接暂时中断，正在保留本机记录。</p>}
    </main>
    <ParentButton />
  </Page>
    {!parentOnly && <CoViewNotice childId={child.id} />}
  </>;
}
