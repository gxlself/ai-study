import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SaveOutlined, SoundOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Drawer, Input, Pagination, Popconfirm, Segmented, Select, Space, Tag, Tooltip } from 'antd';
import { CONCEPT_CATEGORIES, Concept, validateConcepts, type ConceptCategory, type ResolvedConcept, type ValidationIssue } from '@sprout/schema';
import { api, ApiError } from '../lib/api';
import { useResource } from '../lib/hooks';
import { EmptyState, PageTitle, ResourceState } from '../components/ui';
import { CATEGORY_LABELS, CONTRACT_SCHEMAS, CUSTOM_PACK, messageOf } from '../features/content/model';
import { asSchema, normalizeOptionalValues, type JsonSchema } from '../features/content/schema';
import { SchemaObject } from '../features/content/SchemaForm';
import IssueList, { focusIssue } from '../features/content/IssueList';
import { usePronunciation } from '../features/content/usePronunciation';
import '../features/content/content.css';

const CONCEPT_SCHEMA = asSchema(asSchema(asSchema(CONTRACT_SCHEMAS.lexicon.properties).concepts).items);

export default function Lexicon() {
  const { message } = App.useApp();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ConceptCategory>();
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [editing, setEditing] = useState<ResolvedConcept | 'new' | null>(null);
  const [detail, setDetail] = useState<ResolvedConcept | null>(null);
  const [deleting, setDeleting] = useState<string>();
  const pronunciation = usePronunciation();
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (source === 'custom') params.set('packId', CUSTOM_PACK);
    return params.toString();
  }, [query, category, source]);
  const lexicon = useResource<ResolvedConcept[]>(`/api/lexicon${queryString ? `?${queryString}` : ''}`);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const words = lexicon.data ?? [];
  const currentPage = Math.min(page, Math.max(1, Math.ceil(words.length / pageSize)));
  async function remove(concept: ResolvedConcept) {
    if (concept.packId !== CUSTOM_PACK) return;
    setDeleting(concept.id);
    try {
      await api.delete(`/api/lexicon/${encodeURIComponent(concept.id)}`);
      pronunciation.stop();
      void message.success('词条已删除');
      lexicon.reload();
      if (detail?.id === concept.id && detail.packId === CUSTOM_PACK) setDetail(null);
    } catch (cause) { void message.error(messageOf(cause)); }
    finally { setDeleting(undefined); }
  }
  function listen(concept: ResolvedConcept, lang: 'zh' | 'en') {
    void pronunciation.speak(`${concept.packId}:${concept.id}:${lang}`, lang, concept[lang]);
  }
  return (
    <>
      <PageTitle title="词库" subtitle="双语概念与生活中的事物"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>新建词条</Button>} />
      <div className="toolbar content-filters">
        <Input.Search aria-label="搜索词条" placeholder="搜索中文、英文或拼音" allowClear value={search}
          onChange={(event) => setSearch(event.target.value)} onSearch={(value) => { setQuery(value.trim()); setPage(1); }} />
        <Select aria-label="词条类别" placeholder="全部类别" value={category} allowClear
          options={CONCEPT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
          onChange={(value) => { setCategory(value); setPage(1); }} />
        <Segmented aria-label="词条来源" value={source} options={[{ label: '全部词条', value: 'all' }, { label: '我的词条', value: 'custom' }]}
          onChange={(value) => { setSource(String(value)); setPage(1); }} />
        <span className="muted">{lexicon.loading ? '正在读取…' : `${words.length} 个词条`}</span>
      </div>
      <ResourceState loading={lexicon.loading} error={lexicon.error} retry={lexicon.reload}>
        {!words.length ? <EmptyState description={query || category ? '没有符合条件的词条' : '还没有词条'}
          action={query || category
            ? <Button onClick={() => { setSearch(''); setQuery(''); setCategory(undefined); }}>清除筛选</Button>
            : <Button icon={<PlusOutlined />} onClick={() => setEditing('new')}>新建词条</Button>} />
          : <>
              <div className="content-lexicon-grid">
                {words.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((concept) => {
                  const key = `${concept.packId}:${concept.id}`;
                  return <article className="content-word-card" key={key}>
                    <button type="button" className="content-word-image" onClick={() => listen(concept, 'zh')} aria-label={`朗读${concept.zh}`}>
                      <img src={concept.imageUrl} alt={concept.zh} loading="lazy" />
                    </button>
                    <div className="content-word-body">
                      <h2>{concept.zh}</h2>
                      <p lang="en">{concept.en}</p>
                      <p className="content-word-pinyin">{concept.pinyin || '\u00a0'}</p>
                      <div className="content-tags"><Tag>{CATEGORY_LABELS[concept.category]}</Tag>{concept.packId === CUSTOM_PACK && <Tag color="green">我的词条</Tag>}</div>
                      <div className="content-word-actions">
                        <Space size={4}>
                          {(['zh', 'en'] as const).map((lang) => <Tooltip key={lang} title={`${lang === 'zh' ? '中文' : '英文'}试听`}>
                            <Button aria-label={`${concept.zh}${lang === 'zh' ? '中文' : '英文'}试听`}
                              icon={pronunciation.playing === `${key}:${lang}` ? <StopOutlined /> : <SoundOutlined />}
                              onClick={() => listen(concept, lang)} size="small">{lang === 'zh' ? '中' : '英'}</Button>
                          </Tooltip>)}
                        </Space>
                        <Space size={4}>
                          <Tooltip title="词条详情"><Button icon={<EyeOutlined />} size="small" aria-label={`查看${concept.zh}`} onClick={() => setDetail(concept)} /></Tooltip>
                          {concept.packId === CUSTOM_PACK && <>
                            <Tooltip title="编辑词条"><Button icon={<EditOutlined />} size="small" aria-label={`编辑${concept.zh}`} onClick={() => setEditing(concept)} /></Tooltip>
                            <Popconfirm title={`删除“${concept.zh}”？`} description="引用此词条的课程可能需要修改。" okText="删除" cancelText="保留" onConfirm={() => remove(concept)}>
                              <Tooltip title="删除词条"><Button icon={<DeleteOutlined />} danger size="small" aria-label={`删除${concept.zh}`}
                                loading={deleting === concept.id} disabled={!!deleting} /></Tooltip>
                            </Popconfirm>
                          </>}
                        </Space>
                      </div>
                    </div>
                  </article>;
                })}
              </div>
              <div className="content-pagination"><Pagination current={currentPage} total={words.length} pageSize={pageSize}
                pageSizeOptions={[12, 24, 48]} showSizeChanger onChange={(next, size) => { setPage(next); setPageSize(size); }} /></div>
            </>}
      </ResourceState>
      {editing && <ConceptEditor key={editing === 'new' ? 'new' : editing.id} concept={editing === 'new' ? undefined : editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setDetail(null); lexicon.reload(); }} />}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.zh ?? '词条详情'} size={520} destroyOnHidden>
        {detail && <div className="stacked">
          <img className="content-word-detail-image" src={detail.imageUrl} alt={detail.zh} />
          <Descriptions column={1} items={[
            { key: 'en', label: '英文', children: detail.en },
            { key: 'pinyin', label: '拼音', children: detail.pinyin || '未填写' },
            { key: 'category', label: '类别', children: CATEGORY_LABELS[detail.category] },
            { key: 'measure', label: '量词', children: detail.measure || '未填写' },
            { key: 'plural', label: '英文复数', children: detail.plural || '未填写' },
            { key: 'sound', label: '拟声', children: detail.sound ? `${detail.sound.zh} / ${detail.sound.en}` : '未填写' },
            { key: 'phrase', label: '短句', children: detail.phrase ? `${detail.phrase.zh} / ${detail.phrase.en}` : '未填写' },
            { key: 'age', label: '适用月龄', children: detail.ageRange ? `${detail.ageRange[0]}–${detail.ageRange[1]} 月` : '不限' },
            { key: 'color', label: '颜色', children: detail.color || '未填写' },
            { key: 'value', label: '数值', children: detail.value ?? '未填写' },
            { key: 'tags', label: '标签', children: detail.tags?.join('、') || '未填写' },
            { key: 'id', label: '标识符', children: detail.id },
            { key: 'pack', label: '内容包', children: detail.packId },
          ]} />
          <Space wrap>
            <Button icon={<SoundOutlined />} onClick={() => listen(detail, 'zh')}>中文试听</Button>
            <Button icon={<SoundOutlined />} onClick={() => listen(detail, 'en')}>英文试听</Button>
            {detail.packId === CUSTOM_PACK && <Button icon={<EditOutlined />} onClick={() => { setEditing(detail); setDetail(null); }}>编辑词条</Button>}
          </Space>
        </div>}
      </Drawer>
    </>
  );
}

function ConceptEditor({ concept, onClose, onSaved }: {
  concept?: ResolvedConcept; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => concept ? { ...Concept.parse(concept) } : {
    id: `word-${Date.now().toString(36)}`, category: 'family', zh: '', en: '', image: '',
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState('');
  const [uploads, setUploads] = useState<Set<string>>(new Set());
  const form = useRef<HTMLDivElement>(null);
  const { message, modal } = App.useApp();
  const resource = useResource<Record<string, JsonSchema>>('/api/schemas');
  const schema = resource.data ? asSchema(asSchema(asSchema(resource.data.lexicon?.properties).concepts).items) : CONCEPT_SCHEMA;
  const normalized = normalizeOptionalValues(draft, schema);
  const parsed = Concept.safeParse(normalized);
  const localIssues: ValidationIssue[] = parsed.success ? validateConcepts([parsed.data]) : parsed.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'), message: issue.message, level: 'error',
  }));
  const issues = [...localIssues, ...serverIssues];
  const onUploading = useCallback((path: string, busy: boolean) => {
    setUploads((current) => {
      if (current.has(path) === busy) return current;
      const next = new Set(current);
      if (busy) next.add(path); else next.delete(path);
      return next;
    });
  }, []);
  function close() {
    if (saving || uploads.size) return;
    if (!dirty) { onClose(); return; }
    modal.confirm({ title: '放弃未保存的词条？', okText: '放弃', cancelText: '继续编辑', onOk: onClose });
  }
  async function save() {
    setReviewed(true);
    const first = localIssues.find((issue) => issue.level === 'error');
    if (!parsed.success || first) {
      window.requestAnimationFrame(() => focusIssue(first?.path ?? '', form.current));
      return;
    }
    if (uploads.size) return;
    setSaving(true);
    setError('');
    setServerIssues([]);
    try {
      if (concept) await api.put(`/api/lexicon/${encodeURIComponent(concept.id)}`, parsed.data);
      else await api.post('/api/lexicon', parsed.data);
      void message.success(concept ? '词条已更新' : '词条已创建');
      onSaved();
    } catch (cause) {
      setError(messageOf(cause));
      if (cause instanceof ApiError) {
        setServerIssues(cause.issues);
        if (cause.issues[0]) window.requestAnimationFrame(() => focusIssue(cause.issues[0].path, form.current));
      }
    } finally { setSaving(false); }
  }
  return (
    <Drawer open title={concept ? '编辑词条' : '新建词条'} size={680} onClose={close}
      maskClosable={!dirty && !saving && !uploads.size} keyboard={!dirty && !saving} destroyOnHidden
      footer={<Space wrap>
        <Button disabled={saving || !!uploads.size} onClick={close}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!!uploads.size} onClick={() => void save()}>保存词条</Button>
        {!!uploads.size && <span role="status">上传中…</span>}
      </Space>}>
      <div ref={form} className="content-concept-editor">
        {error && <Alert type="error" title="词条未保存" description={error} showIcon />}
        {resource.error && <Alert type="warning" title="表单配置暂时不可用，已使用本地契约" action={<Button onClick={resource.reload}>重试</Button>} />}
        {reviewed && <IssueList issues={issues} onLocate={(path) => focusIssue(path, form.current)} />}
        <SchemaObject schema={schema} value={draft} packId={CUSTOM_PACK} disabled={saving || !!uploads.size}
          readOnlyPaths={concept ? ['id'] : []} issues={reviewed ? issues : []} onUploading={onUploading}
          onChange={(value) => { setDirty(true); setDraft(asSchema(value)); setServerIssues([]); setError(''); }} />
      </div>
    </Drawer>
  );
}
