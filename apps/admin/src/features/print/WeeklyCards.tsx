import { PrinterOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { contrastSvg } from '@sprout/activities/contrast-svg';
import type { LessonSummary, ResolvedConcept, Theme, TodayPlan } from '@sprout/schema';
import { ResourceState } from '../../components/ui';
import { useResource } from '../../lib/hooks';
import { printableThumbnails, todayPrintPath } from './model';
import { useLessonDocuments } from './useLessonDocuments';

export default function WeeklyCards({ plan, theme }: { plan: TodayPlan; theme?: Theme }) {
  const catalog = useResource<LessonSummary[]>('/api/lessons');
  const concepts = useResource<ResolvedConcept[]>('/api/lexicon');
  const themeIds = new Set(theme?.lessons ?? []);
  const themeLessons = catalog.data?.filter((lesson) => plan.theme && lesson.hasPrintables &&
    (themeIds.has(lesson.id) || (!theme && lesson.themeId === plan.theme?.id))) ?? [];
  const todayIds = plan.items.filter((item) => item.lesson.hasPrintables).map((item) => item.lessonId);
  const ids = [...new Set([...themeLessons.map((lesson) => lesson.id), ...todayIds])];
  const documents = useLessonDocuments(ids);
  const blocks = documents.data.flatMap((document) => document.lesson.printables?.map((printable) => ({
    lesson: document.lesson, packId: document.packId, printable,
  })) ?? []);
  const thumbnails = printableThumbnails(blocks, concepts.data ?? []);
  const todayPath = todayPrintPath(todayIds);
  const themePath = plan.theme
    ? `/admin/print/theme/${encodeURIComponent(plan.theme.id)}?routeId=${encodeURIComponent(plan.route.id)}` : undefined;
  const loading = catalog.loading || concepts.loading || documents.loading;
  const error = catalog.error ?? concepts.error ?? documents.error;
  if (!loading && !error && !thumbnails.length) return null;
  return <section className="family-weekly-cards" aria-label="本周卡片">
    <div className="family-section-heading">
      <div><h3><PrinterOutlined /> 本周卡片</h3>{plan.theme && <span className="muted">{plan.theme.title.zh}</span>}</div>
      <div className="toolbar">
        {themeLessons.length > 0 && themePath && <Button type="primary" icon={<PrinterOutlined />}
          href={themePath} target="_blank" rel="noopener noreferrer">打印本主题卡片</Button>}
        {todayPath && <Button icon={<PrinterOutlined />} href={todayPath} target="_blank" rel="noopener noreferrer">打印今天的卡片</Button>}
      </div>
    </div>
    <ResourceState loading={loading} error={error} retry={() => { catalog.reload(); concepts.reload(); documents.reload(); }}>
      <ul className="family-printable-list">
        {thumbnails.map((item) => <li key={item.key}>
          {item.contrast ? <span className="family-printable-image" aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: contrastSvg(item.contrast.pattern, item.contrast.palette, { size: 100 }) }} />
            : item.imageUrl ? <img className="family-printable-image" src={item.imageUrl} alt="" />
              : <span className="family-printable-image family-lesson-icon" aria-hidden="true"><PrinterOutlined /></span>}
          <span>{item.name}{!item.contrast && !item.imageUrl && <small className="muted">图片缺失，请检查词库</small>}</span>
        </li>)}
      </ul>
    </ResourceState>
  </section>;
}
