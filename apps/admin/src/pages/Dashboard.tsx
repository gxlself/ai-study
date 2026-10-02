import { BookOutlined, PrinterOutlined, RightOutlined } from '@ant-design/icons';
import { ageOf, type ChildProfile, type ResolvedConcept, type Route, type TodayPlan } from '@sprout/schema';
import { Alert, Button, Progress, Tag } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import LessonDetail from '../components/LessonDetail';
import { DomainTags, EmptyState, LessonTypeTags, PageTitle, ResourceState } from '../components/ui';
import { useFamily } from '../context';
import { formatAge, formatDuration } from '../lib/format';
import { useResource } from '../lib/hooks';
import { effectiveScreenMode } from '../lib/screen-policy';
import {
  ChildAvatar, DomainDistribution, FetchWarning, NoChild, RefreshButton, ScreenChart,
} from '../features/family/components';
import { CO_VIEW_LABELS, milestoneAgeFor, milestoneAges, milestoneProgress } from '../features/family/model';
import type { FamilyLesson, FamilyMilestones, FamilyStats } from '../features/family/types';
import '../features/family/family.css';

const REASONS: Record<TodayPlan['items'][number]['reason'], { label: string; color: string }> = {
  theme: { label: '主题', color: 'green' },
  review: { label: '复习', color: 'blue' },
  pinned: { label: '置顶', color: 'gold' },
  balance: { label: '均衡', color: 'cyan' },
};

function DashboardContent({ child }: { child: ChildProfile }) {
  const childPath = `/api/children/${encodeURIComponent(child.id)}`;
  const today = useResource<TodayPlan>(`${childPath}/today`);
  const route = useResource<Route>(`/api/routes/${encodeURIComponent(child.plan.routeId)}`);
  const stats = useResource<FamilyStats>(`${childPath}/stats?days=7`);
  const milestones = useResource<FamilyMilestones>(`${childPath}/milestones`);
  const animals = useResource<ResolvedConcept[]>('/api/lexicon?category=animals');
  const firstLessonId = today.data?.items[0]?.lessonId;
  const firstLesson = useResource<FamilyLesson>(firstLessonId ? `/api/lessons/${encodeURIComponent(firstLessonId)}` : null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const months = today.data?.child.ageMonths ?? ageOf(child.birthday).months;
  const milestoneAge = milestoneAgeFor(months, milestoneAges(milestones.data?.items ?? []));
  const milestoneCounts = milestones.data && milestoneAge !== undefined
    ? milestoneProgress(milestones.data.items, milestones.data.observations, milestoneAge) : undefined;
  const offline = firstLesson.data?.lesson.offline[0];
  const screen = today.data?.screen;
  const currentPolicy = route.data?.stages.find((stage) => months >= stage.ageRange[0] && months <= stage.ageRange[1])?.screen.childScreen;
  const parentMode = effectiveScreenMode(months, child.screen.mode, currentPolicy, screen?.mode) === 'parent-only';
  const percent = screen && screen.dailyMaxSec > 0 ? Math.min(100, Math.round(screen.usedSec / screen.dailyMaxSec * 100)) : 0;
  const lastUpdate = useRef(child.updatedAt);
  useEffect(() => {
    if (lastUpdate.current !== child.updatedAt) {
      lastUpdate.current = child.updatedAt;
      today.reload();
    }
  }, [child.updatedAt, today.reload]);

  function refresh() {
    today.reload();
    route.reload();
    stats.reload();
    milestones.reload();
    animals.reload();
    firstLesson.reload();
  }

  return (
    <div className="family-page">
      <PageTitle title="今日概览" subtitle={dayjs().format('YYYY 年 M 月 D 日')}
        extra={<RefreshButton onClick={refresh} loading={today.loading || stats.loading} />} />
      <section className="page-section">
        <div className="family-profile-heading">
          <ChildAvatar child={child} concepts={animals.data ?? []} size={64} />
          <div className="stacked">
            <h2>{child.nickname || child.name} · <span className="family-age-text">{formatAge(months)}</span></h2>
            <div className="muted">
              {today.data?.stage?.title.zh ?? (today.loading ? '正在读取当前阶段' : '暂无当前阶段')}
              {today.data?.theme && ` · ${today.data.theme.title.zh}`}
            </div>
          </div>
          <Link to="/children">管理档案</Link>
          <Link to="/route">成长路线</Link>
        </div>
        <FetchWarning error={animals.error} retry={animals.reload} />
      </section>

      <ResourceState loading={today.loading} error={today.error} retry={today.reload}>
        {today.data && (
          <>
            {parentMode && <section className="page-section family-parent-today">
              <div className="family-section-heading">
                <h2>今天陪宝宝玩什么</h2>
                {today.data.theme && <Link to={`/print/theme/${encodeURIComponent(today.data.theme.id)}?routeId=${encodeURIComponent(today.data.route.id)}`}>
                  <PrinterOutlined /> 打印本主题卡片
                </Link>}
              </div>
              <Alert type="info" showIcon title="现在是家长指引模式"
                description="屏幕给家长看。准备好实体卡片或家里的物品，读完指引就放下设备，面对面陪宝宝玩；家长指引不会计入孩子屏幕时间。" />
              <div className="toolbar" style={{ marginTop: 16 }}>
                {today.data.items.filter((item) => item.lesson.hasPrintables).map((item) =>
                  <Link key={item.lessonId} to={`/print/lesson/${encodeURIComponent(item.lessonId)}`}><PrinterOutlined /> 打印《{item.lesson.title.zh}》</Link>)}
              </div>
            </section>}
            <div className="two-column page-section">
              <section>
                <div className="family-section-heading"><h2>孩子今日屏幕时间</h2><Link to="/sessions">学习记录</Link></div>
                <div className="metric-grid family-dashboard-metrics">
                  <div className="metric"><span className="muted">今日已用</span><strong>{formatDuration(today.data.screen.usedSec)}</strong></div>
                  <div className="metric"><span className="muted">每日上限</span><strong>{formatDuration(today.data.screen.dailyMaxSec)}</strong></div>
                </div>
                <Progress percent={percent} status="normal"
                  strokeColor={today.data.screen.reason === 'daily-limit' ? '#bd8a24' : '#459982'} />
                <p className="family-stat-caption">
                  单次上限 {formatDuration(today.data.screen.sessionMaxSec)} · {CO_VIEW_LABELS[today.data.screen.coView]}
                </p>
                {!today.data.screen.allowedNow && <Alert showIcon type="info"
                  title={today.data.screen.reason === 'daily-limit' ? '今天的屏幕时间已用完，一起到屏幕外玩吧' : '现在不在可用时段'}
                  description={today.data.screen.reason === 'outside-window' && today.data.screen.nextWindow
                    ? `下一个可用时段从 ${today.data.screen.nextWindow} 开始。` : undefined} />}
              </section>
              <section>
                <div className="family-section-heading"><h2>成长观察</h2><Link to="/milestones">查看里程碑</Link></div>
                <ResourceState loading={milestones.loading} error={milestones.error} retry={milestones.reload}>
                  {milestoneCounts ? (
                    <div className="stacked">
                      <div className="metric"><span className="muted">{milestoneAge} 个月观察组 · 待观察</span><strong>{milestoneCounts.pending} 项</strong></div>
                      <span className="muted">已做到 {milestoneCounts.done} / {milestoneCounts.total} 项</span>
                      <Link to="/milestones">{milestoneCounts.pending ? '记录一次新的发现' : '回顾成长记录'} <RightOutlined /></Link>
                    </div>
                  ) : <EmptyState description="暂时没有适用的里程碑条目" />}
                </ResourceState>
              </section>
            </div>
            <section className="page-section">
              <div className="family-section-heading"><h2>今日计划</h2><Link to="/lessons">全部课程</Link></div>
              {today.data.items.length ? (
                <div className="item-grid">
                  {today.data.items.map((item) => (
                    <article key={item.lessonId} className="family-lesson-item stacked">
                      <div className="family-lesson-heading">
                        {item.lesson.cover?.imageUrl
                          ? <img className="family-lesson-cover" src={item.lesson.cover.imageUrl} alt="" />
                          : <span className="family-lesson-cover family-lesson-icon" aria-hidden="true"><BookOutlined /></span>}
                        <div>
                          <Button className="family-wrap-button" type="link" onClick={() => setLessonId(item.lessonId)}>{item.lesson.title.zh}</Button>
                          <div className="muted">{item.lesson.durationMin} 分钟</div>
                        </div>
                        <Tag color={REASONS[item.reason].color}>{REASONS[item.reason].label}</Tag>
                      </div>
                      <DomainTags domains={item.lesson.domains} />
                      <LessonTypeTags audience={item.lesson.audience} hasPrintables={item.lesson.hasPrintables} />
                      {item.lesson.hasPrintables && <Link to={`/print/lesson/${encodeURIComponent(item.lessonId)}`}><PrinterOutlined /> 打印实体卡片</Link>}
                      {item.lesson.summary && <p>{item.lesson.summary.zh}</p>}
                    </article>
                  ))}
                </div>
              ) : <EmptyState description="今天还没有安排课程"
                action={<Link to="/children">检查路线与课程偏好</Link>} />}
            </section>
          </>
        )}
      </ResourceState>

      <section className="page-section">
        <h2>近 7 天</h2>
        <ResourceState loading={stats.loading} error={stats.error} retry={stats.reload}>
          {stats.data && <div className="two-column">
            <section><h3>屏幕使用趋势</h3><ScreenChart days={stats.data.days} /></section>
            <section><h3>学习领域分布</h3><DomainDistribution domains={stats.data.domains} /></section>
          </div>}
        </ResourceState>
      </section>

      <section className="page-section">
        <div className="family-section-heading"><h2>把学习带到屏幕外</h2></div>
        <ResourceState loading={today.loading || firstLesson.loading} error={firstLesson.error} retry={firstLesson.reload}>
          {offline ? (
            <div className="stacked">
              <h3>{offline.title}{offline.minutes ? ` · ${offline.minutes} 分钟` : ''}</h3>
              <span className="muted">来自《{firstLesson.data?.lesson.title.zh}》</span>
              {offline.materials?.length ? <p>准备材料：{offline.materials.join('、')}</p> : null}
              <ol className="family-offline-steps">{offline.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
              {offline.question && <p><strong>可以问宝宝：</strong>{offline.question}</p>}
              {offline.levels?.easier && <p><strong>更简单：</strong>{offline.levels.easier}</p>}
              {offline.levels?.harder && <p><strong>更有挑战：</strong>{offline.levels.harder}</p>}
              {offline.domains && <DomainTags domains={offline.domains} />}
              {offline.safety && <Alert showIcon type="warning" title="安全提示" description={offline.safety} />}
            </div>
          ) : <EmptyState description={today.error ? '今日计划加载后，会显示线下活动建议' : '今日课程还没有线下活动建议'}
            action={<Link to="/lessons">看看课程里的亲子活动</Link>} />}
        </ResourceState>
      </section>
      <LessonDetail lessonId={lessonId} onClose={() => setLessonId(null)} />
    </div>
  );
}

export default function Dashboard() {
  const { child, loading } = useFamily();
  if (child) return <DashboardContent key={child.id} child={child} />;
  return <div className="family-page"><PageTitle title="今日概览" />
    <ResourceState loading={loading} error={null}><NoChild /></ResourceState></div>;
}
