import { ageOf, type ChildProfile, type LessonSummary, type Route, type Stage, type TodayPlan } from '@sprout/schema';
import { Button, Select, Tabs, Tag, Timeline } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import LessonDetail from '../components/LessonDetail';
import { DomainTags, EmptyState, LessonTypeTags, PageTitle, ResourceState } from '../components/ui';
import { useFamily } from '../context';
import { formatAge } from '../lib/format';
import { useResource } from '../lib/hooks';
import { FetchWarning, NoChild, RefreshButton } from '../features/family/components';
import { CO_VIEW_LABELS } from '../features/family/model';
import type { RouteSummary } from '../features/family/types';
import '../features/family/family.css';

function StageContent({ stage, routeId, today, lessons, onLesson }: {
  stage: Stage;
  routeId: string;
  today?: TodayPlan;
  lessons: LessonSummary[];
  onLesson: (id: string) => void;
}) {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  return (
    <div className="family-route-content">
      <section className="page-section">
        <div className="family-section-heading">
          <div><h2>{stage.title.zh}</h2>{stage.subtitle && <p className="muted">{stage.subtitle.zh}</p>}</div>
          <div>
            <Tag>{stage.ageRange[0]}–{stage.ageRange[1]} 个月</Tag>
            {today?.stage?.id === stage.id && <Tag color="green">当前阶段</Tag>}
          </div>
        </div>
        <div className="two-column">
          <section>
            <h3>发展重点</h3>
            <ul>{stage.focus.map((focus, index) => <li key={index}>{focus.zh}</li>)}</ul>
          </section>
          <section>
            <h3>阶段屏幕策略</h3>
            <p>{stage.screen.childScreen === 'none' ? '仅家长指引，宝宝使用打印材料与实物，不观看屏幕。'
              : stage.screen.childScreen === 'optional' ? '家长指引为主；亲子共看默认关闭，需要家长在档案中主动开启。'
                : '亲子共看必须全程陪同，单次最多 20 分钟。'}</p>
            <dl className="family-policy-grid">
              <div><dt>单次默认上限</dt><dd>{stage.screen.sessionMaxMin} 分钟</dd></div>
              <div><dt>每日默认上限</dt><dd>{stage.screen.dailyMaxMin} 分钟</dd></div>
              <div><dt>每日课程建议</dt><dd>{stage.screen.lessonsPerDay} 节</dd></div>
              <div><dt>陪同安排</dt><dd>{CO_VIEW_LABELS[stage.screen.coView]}</dd></div>
            </dl>
          </section>
        </div>
      </section>
      <section className="page-section">
        <h3>一日作息建议</h3>
        {stage.dailyRhythm?.length ? (
          <Timeline items={stage.dailyRhythm.map((content, index) => ({
            key: index, color: 'green', content,
          }))} />
        ) : <EmptyState description="这个阶段暂时没有作息建议" />}
      </section>
      <section className="page-section">
        <h3>主题与课程</h3>
        {stage.themes.length ? <div className="item-grid">
          {stage.themes.map((theme) => (
            <article className="family-theme-item stacked" key={theme.id}>
              <div className="family-section-heading">
                <h3>{theme.title.zh}</h3>
                {today?.theme?.id === theme.id && <Tag color="green">当前主题</Tag>}
              </div>
              <div className="muted">建议 {theme.weeks} 周
                {today?.theme?.id === theme.id && ` · 目前第 ${today.theme.weekIndex + 1} 周`}
              </div>
              <DomainTags domains={theme.domains} />
              {theme.description && <p>{theme.description.zh}</p>}
              <ul className="family-theme-lessons">
                {theme.lessons.map((id) => {
                  const lesson = byId.get(id);
                  return <li key={id}>
                    <Button type="link" onClick={() => onLesson(id)}>{lesson?.title.zh ?? `课程 ${id}`}</Button>
                    {lesson && <span className="muted"> · {lesson.durationMin} 分钟</span>}
                    {lesson && <div className="family-route-lesson-meta">
                      <LessonTypeTags audience={lesson.audience} hasPrintables={lesson.hasPrintables} />
                      {lesson.hasPrintables && <Link to={`/print/lesson/${encodeURIComponent(lesson.id)}`} aria-label={`打印${lesson.title.zh}`}><PrinterOutlined /> 打印</Link>}
                    </div>}
                  </li>;
                })}
              </ul>
              {theme.offlineFocus?.length ? (
                <div><h3>线下重点</h3><ul>{theme.offlineFocus.map((focus, index) => <li key={index}>{focus}</li>)}</ul></div>
              ) : null}
              <Link to={`/print/theme/${encodeURIComponent(theme.id)}?routeId=${encodeURIComponent(routeId)}`}><PrinterOutlined /> 打印本主题卡片</Link>
            </article>
          ))}
        </div> : <EmptyState description="这个阶段还没有主题" />}
      </section>
    </div>
  );
}

function RouteContent({ child }: { child: ChildProfile }) {
  const routes = useResource<RouteSummary[]>('/api/routes');
  const [routeId, setRouteId] = useState(child.plan.routeId);
  const route = useResource<Route>(`/api/routes/${encodeURIComponent(routeId)}`);
  const today = useResource<TodayPlan>(`/api/children/${encodeURIComponent(child.id)}/today`);
  const lessons = useResource<LessonSummary[]>('/api/lessons');
  const [selectedStage, setSelectedStage] = useState<string>();
  const [lessonId, setLessonId] = useState<string | null>(null);
  const lastUpdate = useRef(child.updatedAt);
  useEffect(() => {
    if (lastUpdate.current !== child.updatedAt) {
      lastUpdate.current = child.updatedAt;
      today.reload();
    }
  }, [child.updatedAt, today.reload]);
  const current = today.data?.route.id === routeId ? today.data : undefined;
  const activeStage = selectedStage && route.data?.stages.some((stage) => stage.id === selectedStage)
    ? selectedStage : current?.stage?.id ?? route.data?.stages[0]?.id;
  const options = (routes.data ?? []).map((item) => ({ value: item.id, label: item.title.zh }));
  if (!options.some((item) => item.value === routeId)) {
    options.push({ value: routeId, label: route.data?.title.zh ?? `当前路线：${routeId}` });
  }

  function refresh() {
    route.reload();
    routes.reload();
    today.reload();
    lessons.reload();
  }

  return (
    <div className="family-page">
      <PageTitle title="成长路线" subtitle={`${child.nickname || child.name} · ${formatAge(ageOf(child.birthday).months)}`}
        extra={<RefreshButton onClick={refresh} loading={route.loading} />} />
      <div className="toolbar">
        <Select aria-label="查看成长路线" className="family-route-select" options={options}
          loading={routes.loading} value={routeId} onChange={(id) => {
            setRouteId(id);
            setSelectedStage(undefined);
            setLessonId(null);
          }} />
        {routeId === child.plan.routeId ? <Tag color="green">孩子正在使用</Tag> : <Tag>其他路线</Tag>}
        <Link to="/children">调整孩子的路线与主题</Link>
      </div>
      <FetchWarning error={routes.error} retry={routes.reload} />
      <FetchWarning error={today.error} retry={today.reload} />
      <FetchWarning error={lessons.error} retry={lessons.reload} />
      <ResourceState loading={route.loading} error={route.error} retry={route.reload}>
        {route.data ? (
          <>
            <section className="page-section">
              <h2>{route.data.title.zh}</h2>
              {route.data.description && <p className="muted">{route.data.description.zh}</p>}
              {current?.theme && <p>当前主题：<strong>{current.theme.title.zh}</strong></p>}
            </section>
            {route.data.stages.length ? (
              <Tabs
                activeKey={activeStage}
                onChange={setSelectedStage}
                destroyOnHidden
                items={route.data.stages.map((stage) => ({
                  key: stage.id,
                  label: <span>{stage.title.zh}{current?.stage?.id === stage.id && <Tag color="green">当前</Tag>}</span>,
                  children: <StageContent stage={stage} routeId={routeId} today={current} lessons={lessons.data ?? []} onLesson={setLessonId} />,
                }))}
              />
            ) : <EmptyState description="这条路线暂时没有阶段内容" />}
          </>
        ) : <EmptyState description="还没有可查看的成长路线" action={<Link to="/packs">查看内容包</Link>} />}
      </ResourceState>
      <LessonDetail lessonId={lessonId} onClose={() => setLessonId(null)} />
    </div>
  );
}

export default function GrowthRoute() {
  const { child, loading } = useFamily();
  if (child) return <RouteContent key={`${child.id}:${child.plan.routeId}`} child={child} />;
  return <div className="family-page"><PageTitle title="成长路线" />
    <ResourceState loading={loading} error={null}><NoChild /></ResourceState></div>;
}
