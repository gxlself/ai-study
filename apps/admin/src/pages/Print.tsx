import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Spin } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router';
import { contrastSvg } from '@sprout/activities/contrast-svg';
import type { Printable, ResolvedConcept, Route as GrowthRoute } from '@sprout/schema';
import { api } from '../lib/api';
import { useResource } from '../lib/hooks';
import { buildPrintPages, resolvePrintConcept, type PrintBlock } from '../features/print/model';
import { useLessonDocuments } from '../features/print/useLessonDocuments';
import '../features/print/print.css';

function titleFor(printable: Printable) {
  return printable.title || (printable.kind === 'cards' ? '可打印词卡' : '高对比卡片');
}

function PrintHeader({ title, subtitle, ready }: { title: string; subtitle?: string; ready: boolean }) {
  const navigate = useNavigate();
  return <header className="print-toolbar">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    <div className="print-actions">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回后台</Button>
      <Button type="primary" icon={<PrinterOutlined />} disabled={!ready} onClick={() => window.print()}>打印</Button>
    </div>
  </header>;
}

function PrintHelp() {
  return <Alert className="print-help" type="info" showIcon title="使用实体卡片"
    description="选择 A4 纵向、实际大小打印，建议使用厚纸或过塑，裁剪后剪圆角，卡片由成人拿取。6 个月宝宝看卡距离 20–30 厘米，慢慢移动，每次几分钟，跟随宝宝的反应随时停下。宝宝啃咬或玩耍时须成人全程看护；卡片用于屏幕外的亲子互动，不需要播放背景声音。" />;
}

function PrintableCards({ block, concepts }: { block: PrintBlock; concepts: ResolvedConcept[] }) {
  if (block.printable.kind !== 'cards') return null;
  const { printable } = block;
  const pages = buildPrintPages([block]).filter((page) => page.kind === 'cards');
  return <section className="print-section">
    <div className="print-section-title">
      <h2>{titleFor(printable)}</h2>
      <span className="muted">{block.lesson.title.zh} · {printable.size === 'large' ? '大卡' : printable.size === 'medium' ? '中卡' : '小卡'}</span>
    </div>
    <div className="print-card-pages">
      {pages.map((page, pageIndex) => <div className={`print-card-page print-card-page-${printable.size}`} key={pageIndex}>
        {page.items.map((ref, index) => {
          const concept = resolvePrintConcept(ref, block.packId, concepts);
          const zh = concept?.zh ?? (typeof ref === 'string' ? `词条缺失：${ref}` : '词条缺失');
          const en = concept?.en;
          return <article className="print-card" key={`${String(ref)}-${index}`}>
            {concept?.imageUrl ? <img className="print-card-image" src={concept.imageUrl} alt="" /> : <span role="alert">图片缺失，请检查词库后再打印</span>}
            {printable.showText && <div className="print-card-title">{zh}</div>}
            {printable.showEnglish && en && <div className="print-card-english" lang="en">{en}</div>}
          </article>;
        })}
      </div>)}
    </div>
  </section>;
}

function PrintableContrast({ block }: { block: PrintBlock }) {
  if (block.printable.kind !== 'contrast') return null;
  const printable = block.printable;
  return <section className="print-section">
    <div className="print-section-title">
      <h2>{titleFor(printable)}</h2>
      <span className="muted">{block.lesson.title.zh} · 高对比卡</span>
    </div>
    <div className="print-contrast-pages">
      {printable.patterns.map((pattern, index) => <div className="print-contrast-page" key={`${pattern}-${index}`}
        dangerouslySetInnerHTML={{ __html: contrastSvg(pattern, printable.palette, { size: 900 }) }} />)}
    </div>
  </section>;
}

function PrintDocument({ blocks, concepts, title, subtitle }: {
  blocks: PrintBlock[]; concepts: ResolvedConcept[]; title: string; subtitle?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failedImages, setFailedImages] = useState(false);
  useEffect(() => {
    let active = true;
    setReady(false);
    setFailedImages(false);
    const images = Array.from(root.current?.querySelectorAll('img') ?? []);
    Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => {
      if (!active) return;
      const failed = images.some((image) => image.naturalWidth === 0);
      setFailedImages(failed);
      setReady(!failed && blocks.every((block) => block.printable.kind !== 'cards' ||
        block.printable.items.every((ref) => !!resolvePrintConcept(ref, block.packId, concepts)?.imageUrl)));
    });
    return () => { active = false; };
  }, [blocks, concepts]);
  return <main className="print-page">
    <PrintHeader title={title} subtitle={subtitle} ready={ready && blocks.length > 0} />
    <PrintHelp />
    {failedImages && <Alert className="print-help" type="error" showIcon title="有图片未能加载，暂不能打印"
      description="请检查内容包或网络后刷新，避免打印出缺图卡片。" />}
    <div className="print-document" ref={root}>
      {blocks.length ? blocks.map((block, index) => <div key={`${block.lesson.id}-${index}`}>
        <PrintableCards block={block} concepts={concepts} />
        <PrintableContrast block={block} />
      </div>) : <Empty description="这份课程没有可打印材料" />}
    </div>
  </main>;
}

function LoadingView() {
  return <main className="print-page"><div className="print-loading"><Spin tip="正在准备打印材料" /></div></main>;
}

function ErrorView({ error }: { error: Error }) {
  return <main className="print-page"><div className="print-error"><Alert type="error" showIcon title="打印材料暂时无法打开" description={error.message} /></div></main>;
}

function LessonPrint() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const ids = [...new Set([...(id ? [id] : []), ...params.getAll('lessonId')])];
  const documents = useLessonDocuments(ids);
  const concepts = useResource<ResolvedConcept[]>('/api/lexicon');
  if (documents.loading || concepts.loading) return <LoadingView />;
  if (documents.error || concepts.error) return <ErrorView error={documents.error ?? concepts.error ?? new Error('打印资料加载失败')} />;
  const lesson = documents.data[0]?.lesson;
  const blocks = documents.data.flatMap((document) => document.lesson.printables?.map((printable) => ({
    lesson: document.lesson, packId: document.packId, printable,
  })) ?? []);
  return <PrintDocument blocks={blocks} concepts={concepts.data ?? []}
    title={ids.length > 1 ? '打印今天的卡片' : lesson ? `打印：${lesson.title.zh}` : '打印课程'}
    subtitle={ids.length > 1 ? documents.data.map((document) => document.lesson.title.zh).join('、')
      : lesson ? `${lesson.audience === 'parent' ? '家长指引课' : '亲子共看课'} · 屏幕外亲子互动材料` : undefined} />;
}

function ThemePrint() {
  const { themeId } = useParams<{ themeId: string }>();
  const [params] = useSearchParams();
  const routes = useResource<{ id: string; title: GrowthRoute['title']; packId: string }[]>('/api/routes');
  const [routeState, setRouteState] = useState<{ routes: GrowthRoute[]; error: Error | null; loading: boolean }>({ routes: [], error: null, loading: true });
  const idsKey = routes.data?.map((route) => route.id).join('|');
  const requested = params.get('routeId');
  useEffect(() => {
    let active = true;
    if (!routes.data) return;
    setRouteState({ routes: [], error: null, loading: true });
    const routeIds = requested ? [requested] : routes.data.map((route) => route.id);
    Promise.all(routeIds.map((id) => api.get<GrowthRoute>(`/api/routes/${encodeURIComponent(id)}`))).then(
      (items) => { if (active) setRouteState({ routes: items, error: null, loading: false }); },
      (error: unknown) => { if (active) setRouteState({ routes: [], error: error instanceof Error ? error : new Error('主题加载失败'), loading: false }); },
    );
    return () => { active = false; };
  }, [idsKey, requested, routes.data]);
  const theme = routeState.routes.flatMap((route) => route.stages).flatMap((stage) => stage.themes).find((item) => item.id === themeId);
  const ids = [...new Set(theme?.lessons ?? [])];
  const documents = useLessonDocuments(ids);
  const concepts = useResource<ResolvedConcept[]>('/api/lexicon');
  const error = routes.error ?? routeState.error ?? documents.error ?? concepts.error;
  if (error) return <ErrorView error={error} />;
  if (routes.loading || routeState.loading || documents.loading || concepts.loading) return <LoadingView />;
  if (!theme) return <ErrorView error={new Error('未找到这个主题，请确认对应内容包已启用。')} />;
  const blocks = documents.data.flatMap((document) => document.lesson.printables?.map((printable) => ({
    lesson: document.lesson, packId: document.packId, printable,
  })) ?? []);
  return <PrintDocument blocks={blocks} concepts={concepts.data ?? []}
    title={theme ? `打印主题：${theme.title.zh}` : '打印主题卡片'}
    subtitle={theme ? `${theme.weeks} 周 · 主题内课程的实体材料` : themeId} />;
}

export default function PrintRoutes() {
  return <Routes>
    <Route path="/print/lesson/:id" element={<LessonPrint />} />
    <Route path="/print/theme/:themeId" element={<ThemePrint />} />
    <Route path="*" element={<Link to="/">返回后台</Link>} />
  </Routes>;
}
