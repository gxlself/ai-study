import { useEffect, useMemo, useState } from 'react';
import { AppstoreOutlined, CopyOutlined, EditOutlined, EyeOutlined, PictureOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined, TableOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, InputNumber, Pagination, Segmented, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useSearchParams } from 'react-router';
import { DOMAINS, DOMAIN_LABELS, type LessonSummary, type PackInfo, type ResolvedConcept } from '@sprout/schema';
import { api } from '../lib/api';
import { useResource } from '../lib/hooks';
import { formatAge, formatDuration } from '../lib/format';
import { DomainTags, EmptyState, LessonTypeTags, PageTitle, ResourceState } from '../components/ui';
import LessonDetail from '../components/LessonDetail';
import { assetUrl, CUSTOM_PACK, messageOf, responseLessonId } from '../features/content/model';
import { useThemes } from '../features/content/useThemes';
import '../features/content/content.css';

export default function Lessons() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { message } = App.useApp();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [copying, setCopying] = useState<string>();
  const query = useMemo(() => {
    const filtered = new URLSearchParams();
    for (const key of ['age', 'domain', 'q', 'packId', 'themeId']) {
      const value = params.get(key);
      if (value) filtered.set(key, value);
    }
    return filtered.toString();
  }, [params]);
  const lessons = useResource<LessonSummary[]>(`/api/lessons${query ? `?${query}` : ''}`);
  const packs = useResource<PackInfo[]>('/api/packs');
  const concepts = useResource<ResolvedConcept[]>('/api/lexicon');
  const themes = useThemes();
  const packNames = new Map(packs.data?.map((pack) => [pack.id, pack.name.zh]));
  const rows = lessons.data ?? [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));

  function filter(key: string, value: string | number | undefined | null) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === undefined || value === null || value === '') next.delete(key);
      else next.set(key, String(value));
      return next;
    }, { replace: true });
    setPage(1);
  }
  const urlSearch = params.get('q') ?? '';
  useEffect(() => { setSearch(urlSearch); }, [urlSearch]);
  useEffect(() => {
    if (search === urlSearch) return;
    const timer = window.setTimeout(() => {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        if (search.trim()) next.set('q', search.trim()); else next.delete('q');
        return next;
      }, { replace: true });
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, urlSearch, setParams]);
  function clearFilters() {
    setSearch('');
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const key of ['age', 'domain', 'q', 'packId', 'themeId']) next.delete(key);
      return next;
    }, { replace: true });
    setPage(1);
  }
  async function duplicate(lesson: LessonSummary) {
    setCopying(lesson.id);
    try {
      const response = await api.post<unknown>(`/api/lessons/${encodeURIComponent(lesson.id)}/duplicate`);
      const id = responseLessonId(response);
      if (!id) throw new Error('复制已提交，但服务端未返回课程标识，请刷新课程库查看');
      navigate(`/lessons/${encodeURIComponent(id)}/edit`);
    } catch (cause) { void message.error(messageOf(cause)); }
    finally { setCopying(undefined); }
  }
  function imageFor(lesson: LessonSummary) {
    return lesson.cover?.imageUrl ?? assetUrl(
      lesson.cover?.image ?? (lesson.cover?.concept ? `concept:${lesson.cover.concept}` : undefined),
      lesson.packId, concepts.data,
    );
  }
  function actions(lesson: LessonSummary) {
    return <Space size={4}>
      <Tooltip title="课程详情"><Button aria-label={`查看${lesson.title.zh}`} icon={<EyeOutlined />} onClick={() => setDetailId(lesson.id)} /></Tooltip>
      {lesson.packId === CUSTOM_PACK && <Tooltip title="编辑课程"><Button aria-label={`编辑${lesson.title.zh}`} icon={<EditOutlined />}
        onClick={() => navigate(`/lessons/${encodeURIComponent(lesson.id)}/edit`)} /></Tooltip>}
      <Tooltip title="复制为我的课程"><Button aria-label={`复制${lesson.title.zh}`} icon={<CopyOutlined />}
        loading={copying === lesson.id} disabled={!!copying} onClick={() => void duplicate(lesson)} /></Tooltip>
      {lesson.hasPrintables && <Tooltip title="打印实体卡片"><Button aria-label={`打印${lesson.title.zh}`} icon={<PrinterOutlined />}
        onClick={() => navigate(`/print/lesson/${encodeURIComponent(lesson.id)}`)} /></Tooltip>}
    </Space>;
  }
  const columns: ColumnsType<LessonSummary> = [
    { title: '课程', key: 'title', width: 300, render: (_, lesson) => <button type="button" className="content-table-title" onClick={() => setDetailId(lesson.id)}>
      {imageFor(lesson) && <img src={imageFor(lesson)} alt="" loading="lazy" />}
      <span><strong>{lesson.title.zh}</strong>{lesson.title.en && <small lang="en">{lesson.title.en}</small>}</span>
    </button> },
    { title: '适用月龄', key: 'age', width: 145, render: (_, lesson) => `${lesson.ageRange[0]}–${lesson.ageRange[1]} 月` },
    { title: '领域', key: 'domains', width: 200, render: (_, lesson) => <DomainTags domains={lesson.domains} /> },
    { title: '时长', key: 'duration', width: 100, render: (_, lesson) => formatDuration(lesson.durationMin * 60) },
    { title: '课程类型', key: 'type', width: 180, render: (_, lesson) => <LessonTypeTags audience={lesson.audience} hasPrintables={lesson.hasPrintables} /> },
    { title: '内容包', key: 'pack', width: 160, render: (_, lesson) => packNames.get(lesson.packId) ?? lesson.packId },
    { title: '操作', key: 'actions', width: 148, render: (_, lesson) => actions(lesson) },
  ];
  return (
    <>
      <PageTitle title="课程库" subtitle="亲子共学课程"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/lessons/new')}>新建课程</Button>} />
      <div className="toolbar content-filters">
        <Input.Search aria-label="搜索课程" placeholder="搜索课程" allowClear value={search} onChange={(event) => setSearch(event.target.value)}
          onSearch={(value) => filter('q', value.trim())} />
        <InputNumber aria-label="月龄筛选" placeholder="月龄（月）" min={0} max={72} precision={0}
          value={params.has('age') && Number.isFinite(Number(params.get('age'))) ? Number(params.get('age')) : null}
          onChange={(value) => filter('age', value)} />
        <Select aria-label="领域筛选" placeholder="全部领域" allowClear value={params.get('domain') ?? undefined}
          options={DOMAINS.map((domain) => ({ value: domain, label: DOMAIN_LABELS[domain].zh }))} onChange={(value) => filter('domain', value)} />
        <Select aria-label="内容包筛选" placeholder="全部内容包" allowClear value={params.get('packId') ?? undefined} loading={packs.loading}
          options={packs.data?.filter((pack) => pack.enabled).map((pack) => ({ value: pack.id, label: pack.name.zh }))}
          onChange={(value) => {
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              if (value) next.set('packId', value); else next.delete('packId');
              next.delete('themeId');
              return next;
            }, { replace: true });
            setPage(1);
          }} />
        <Select aria-label="主题筛选" placeholder="全部主题" allowClear showSearch optionFilterProp="label"
          value={params.get('themeId') ?? undefined} loading={themes.loading}
          options={themes.themes.filter((theme) => !params.get('packId') || theme.packId === params.get('packId'))}
          onChange={(value) => filter('themeId', value)} />
        {query && <Button onClick={clearFilters}>清除筛选</Button>}
      </div>
      {(packs.error || themes.error || concepts.error) && <Alert type="warning" showIcon title="部分筛选或图片资料未加载"
        description={(packs.error ?? themes.error ?? concepts.error)?.message}
        action={<Button icon={<ReloadOutlined />} onClick={() => { packs.reload(); themes.reload(); concepts.reload(); }}>重试</Button>} />}
      <div className="content-section-heading">
        <span className="muted">{lessons.loading ? '正在读取课程…' : `共 ${rows.length} 节课程`}</span>
        <Segmented aria-label="课程视图" value={view}
          options={[{ value: 'grid', icon: <AppstoreOutlined />, label: '卡片' }, { value: 'table', icon: <TableOutlined />, label: '表格' }]}
          onChange={(value) => setView(value as 'grid' | 'table')} />
      </div>
      <ResourceState loading={lessons.loading} error={lessons.error} retry={lessons.reload}>
        {rows.length === 0
          ? <EmptyState description={query ? '没有符合筛选条件的课程' : '还没有课程'}
              action={query ? <Button onClick={clearFilters}>清除筛选</Button> : <Button icon={<PlusOutlined />} onClick={() => navigate('/lessons/new')}>新建课程</Button>} />
          : view === 'table'
            ? <div className="safe-table"><Table<LessonSummary> rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1000 }}
                pagination={{ current: currentPage, pageSize, total: rows.length, pageSizeOptions: [12, 24, 48], showSizeChanger: true,
                  onChange: (next, size) => { setPage(next); setPageSize(size); } }} /></div>
            : <>
                <div className="item-grid content-lesson-grid">
                  {rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((lesson) => (
                    <article className="content-lesson-card" key={lesson.id}>
                      <button type="button" className="content-lesson-cover" onClick={() => setDetailId(lesson.id)} aria-label={`查看课程：${lesson.title.zh}`}>
                        {imageFor(lesson) ? <img src={imageFor(lesson)} alt={lesson.title.zh} loading="lazy" /> : <PictureOutlined />}
                      </button>
                      <div className="content-lesson-body">
                        <div className="content-card-eyebrow">
                          <span>{formatAge(lesson.ageRange[0])}至{formatAge(lesson.ageRange[1])}</span>
                          <span>{formatDuration(lesson.durationMin * 60)}</span>
                        </div>
                        <h2><button type="button" className="content-link-button" onClick={() => setDetailId(lesson.id)}>{lesson.title.zh}</button></h2>
                        {lesson.title.en && <p lang="en" className="content-secondary">{lesson.title.en}</p>}
                        <LessonTypeTags audience={lesson.audience} hasPrintables={lesson.hasPrintables} />
                        <DomainTags domains={lesson.domains} />
                        {lesson.summary?.zh && <p className="content-lesson-summary">{lesson.summary.zh}</p>}
                        <div className="content-card-footer">
                          <Tag>{packNames.get(lesson.packId) ?? lesson.packId}</Tag>{actions(lesson)}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="content-pagination"><Pagination current={currentPage} pageSize={pageSize} total={rows.length}
                  pageSizeOptions={[12, 24, 48]} showSizeChanger onChange={(next, size) => { setPage(next); setPageSize(size); }} /></div>
              </>}
      </ResourceState>
      <LessonDetail lessonId={detailId} onClose={() => { setDetailId(null); lessons.reload(); }} />
    </>
  );
}
