import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftOutlined, CheckCircleOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { Alert, App, Button, Popconfirm, Select, Tag } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { Lesson, PARENT_ACTIVITY_TYPES, type Audience, type Printable, type PluginInfo, type ResolvedConcept, type ValidationIssue } from '@sprout/schema';
import { api, ApiError } from '../lib/api';
import { useResource } from '../lib/hooks';
import { EmptyState, PageTitle, ResourceState } from '../components/ui';
import Preview from '../components/Preview';
import {
  activityChoices, choicesForAudience, CONTRACT_SCHEMAS, CUSTOM_PACK, messageOf, newLesson, newStep, responseLessonId,
  stepDraft, validateDraft, type ActivityChoice, type LessonDocument, type StepDraft,
} from '../features/content/model';
import { asSchema, isRecord, reorder, type JsonSchema } from '../features/content/schema';
import { SchemaObject } from '../features/content/SchemaForm';
import IssueList, { focusIssue } from '../features/content/IssueList';
import StepEditor from '../features/content/StepEditor';
import PrintablesEditor from '../features/content/PrintablesEditor';
import { useThemes } from '../features/content/useThemes';
import '../features/content/content.css';

export default function LessonEditor() {
  const { id } = useParams<{ id: string }>();
  const lesson = useResource<LessonDocument>(id ? `/api/lessons/${encodeURIComponent(id)}` : null);
  const schemas = useResource<Record<string, JsonSchema>>('/api/schemas');
  const plugins = useResource<PluginInfo[]>('/api/plugins');
  const lexicon = useResource<ResolvedConcept[]>('/api/lexicon');
  const activities = useMemo(() => activityChoices(plugins.data ?? [], schemas.data ?? {}), [plugins.data, schemas.data]);
  const loading = lesson.loading || schemas.loading || plugins.loading || lexicon.loading;
  const error = lesson.error ?? schemas.error ?? plugins.error ?? lexicon.error;
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [copying, setCopying] = useState(false);

  async function copy() {
    if (!id) return;
    setCopying(true);
    try {
      const result = await api.post<unknown>(`/api/lessons/${encodeURIComponent(id)}/duplicate`);
      const nextId = responseLessonId(result);
      if (!nextId) throw new Error('复制已提交，但服务端未返回课程标识，请回课程库查看');
      navigate(`/lessons/${encodeURIComponent(nextId)}/edit`, { replace: true });
    } catch (cause) { void message.error(messageOf(cause)); }
    finally { setCopying(false); }
  }
  return (
    <ResourceState loading={loading} error={error} retry={() => {
      lesson.reload(); schemas.reload(); plugins.reload(); lexicon.reload();
    }}>
      {id && lesson.data && lesson.data.packId !== CUSTOM_PACK
        ? <>
            <PageTitle title="课程编辑器" />
            <Alert type="info" showIcon title="这节课程来自只读内容包" />
            <div className="content-footer-actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/lessons')}>返回课程库</Button>
              <Button type="primary" loading={copying} onClick={() => void copy()}>复制为我的课程</Button>
            </div>
          </>
        : (!id || lesson.data) && schemas.data && lexicon.data && (
            <EditorWorkspace key={id ?? 'new'} initial={lesson.data?.lesson} existingId={id} concepts={lexicon.data}
              schema={schemas.data.lesson ?? CONTRACT_SCHEMAS.lesson} activities={activities} initialIssues={lesson.data?.issues ?? []} />
          )}
    </ResourceState>
  );
}

function EditorWorkspace({ initial, existingId, concepts, schema, activities, initialIssues }: {
  initial?: Lesson;
  existingId?: string;
  concepts: ResolvedConcept[];
  schema: JsonSchema;
  activities: ActivityChoice[];
  initialIssues: ValidationIssue[];
}) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [metadata, setMetadata] = useState<Record<string, unknown>>(() => ({ ...(initial ?? newLesson()) }));
  const [steps, setSteps] = useState<StepDraft[]>(() => (initial?.steps ?? []).map((step) => {
    const draft = stepDraft(step);
    if (!activities.find((activity) => activity.type === step.type)?.schema) draft.mode = 'json';
    return draft;
  }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>(initialIssues);
  const [saveError, setSaveError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [rawErrors, setRawErrors] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<Set<string>>(new Set());
  const [selectedActivity, setSelectedActivity] = useState<string>();
  const [dragging, setDragging] = useState<string>();
  const [preview, setPreview] = useState<Lesson>();
  const form = useRef<HTMLDivElement>(null);
  const themes = useThemes();
  const validation = useMemo(() => validateDraft(metadata, steps, concepts, activities), [metadata, steps, concepts, activities]);
  const issues = useMemo(() => [
    ...validation.issues,
    ...serverIssues,
    ...Object.entries(rawErrors).map(([path, text]): ValidationIssue => ({ path, message: text, level: 'error' })),
  ], [validation.issues, serverIssues, rawErrors]);
  const errors = issues.filter((issue) => issue.level === 'error');
  const uploading = uploads.size > 0;
  const audience: Audience = metadata.audience === 'parent' ? 'parent' : 'child';
  const availableActivities = choicesForAudience(activities, audience);
  const incompatible = audience === 'parent' && steps.some((draft) => !PARENT_ACTIVITY_TYPES.includes(draft.step.type));

  useEffect(() => {
    if (validation.lesson && !validation.issues.some((issue) => issue.level === 'error') && !Object.keys(rawErrors).length) {
      setPreview(validation.lesson);
    }
  }, [validation, rawErrors]);
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);
  useEffect(() => {
    const end = () => setDragging(undefined);
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, []);

  const onUploading = useCallback((path: string, busy: boolean) => {
    setUploads((current) => {
      if (current.has(path) === busy) return current;
      const next = new Set(current);
      if (busy) next.add(path); else next.delete(path);
      return next;
    });
  }, []);
  const onInvalidJson = useCallback((path: string, text?: string) => {
    setRawErrors((current) => {
      if (current[path] === text) return current;
      const next = { ...current };
      if (text) next[path] = text; else delete next[path];
      return next;
    });
  }, []);
  function edited() {
    setDirty(true);
    setServerIssues([]);
    setSaveError('');
  }
  function updateSteps(next: StepDraft[]) { edited(); setSteps(next); }
  function locate(path: string) {
    window.requestAnimationFrame(() => focusIssue(path, form.current));
  }
  function check() {
    setReviewed(true);
    if (errors.length) locate(errors[0].path);
    else void message.success('本地校验通过');
  }
  async function save() {
    setReviewed(true);
    const localErrors = [...validation.issues, ...Object.entries(rawErrors).map(([path, text]): ValidationIssue => ({ path, message: text, level: 'error' }))];
    const first = localErrors.find((issue) => issue.level === 'error');
    if (first || !validation.lesson) { if (first) locate(first.path); return; }
    if (uploading) { void message.warning('图片上传中，请稍候'); return; }
    setSaving(true);
    setServerIssues([]);
    setSaveError('');
    try {
      const result = existingId
        ? await api.put<unknown>(`/api/lessons/${encodeURIComponent(existingId)}`, validation.lesson)
        : await api.post<unknown>('/api/lessons', validation.lesson);
      const parsed = Lesson.safeParse(isRecord(result) && result.lesson ? result.lesson : result);
      const saved = parsed.success ? parsed.data : validation.lesson;
      const savedId = responseLessonId(result) ?? saved.id;
      setDirty(false);
      setMetadata({ ...saved });
      setSteps(saved.steps.map((step, index) => ({ ...stepDraft(step), key: steps[index]?.key ?? stepDraft(step).key, mode: steps[index]?.mode ?? 'form' })));
      void message.success('课程已保存');
      if (!existingId || savedId !== existingId) navigate(`/lessons/${encodeURIComponent(savedId)}/edit`, { replace: true });
    } catch (cause) {
      setSaveError(messageOf(cause));
      if (cause instanceof ApiError && cause.issues.length) {
        setServerIssues(cause.issues);
        locate(cause.issues.find((issue) => issue.level === 'error')?.path ?? cause.issues[0].path);
      }
    } finally { setSaving(false); }
  }

  const context = {
    concepts, issues: reviewed ? issues : issues.filter((issue) => issue.path.startsWith('steps.')),
    packId: CUSTOM_PACK, disabled: saving || uploading, readOnlyPaths: existingId ? ['id', 'schemaVersion'] : ['schemaVersion'],
    optionsByPath: { themeId: themes.themes }, onUploading, onInvalidJson,
  };
  const back = <Button icon={<ArrowLeftOutlined />} disabled={saving || uploading} onClick={dirty ? undefined : () => navigate('/lessons')}>课程库</Button>;
  return (
    <div className="content-editor" ref={form}>
      <PageTitle title={existingId ? '编辑课程' : '新建课程'}
        subtitle={<span>{dirty ? '有未保存的修改' : existingId ? '自定义课程' : '新草稿'} · 格式版本 1</span>}
        extra={<>
          {dirty ? <Popconfirm title="放弃未保存的修改？" okText="离开" cancelText="继续编辑" onConfirm={() => navigate('/lessons')}>{back}</Popconfirm> : back}
          <Button icon={<CheckCircleOutlined />} onClick={check} disabled={saving || uploading}>检查课程</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={uploading} onClick={() => void save()}>保存课程</Button>
        </>} />
      {saveError && <Alert showIcon type="error" title="课程未保存" description={saveError} />}
      {(reviewed || serverIssues.length > 0) && <IssueList issues={issues} onLocate={locate} />}
      <div className="content-editor-layout">
        <div className="content-editor-main">
          <section className="page-section">
            <h2>基本信息</h2>
            <div className="content-field" data-content-path="audience" tabIndex={-1}>
              <label htmlFor="lesson-audience">课程面向谁</label>
              <Select id="lesson-audience" aria-label="课程面向谁" value={audience} disabled={saving}
                options={[{ value: 'parent', label: '家长指引课' }, { value: 'child', label: '亲子共看课（18 个月起）' }]}
                onChange={(next: Audience) => {
                  edited();
                  setSelectedActivity(undefined);
                  setMetadata((current) => {
                    const range = current.ageRange as [number, number];
                    return { ...current, audience: next, coView: 'required',
                      ageRange: next === 'child' ? [Math.max(18, range[0]), Math.max(18, range[1])] : range,
                    };
                  });
                }} />
              <p className="muted">{audience === 'parent'
                ? '屏幕给家长看，读完后去陪玩，不计入孩子屏幕时间。'
                : '必须家长全程陪同；18–23 月龄每次最多 8 分钟，24 个月起单次最多 20 分钟。'}</p>
            </div>
            <SchemaObject {...context} schema={schema} value={metadata}
              only={['id', 'title', 'summary', 'ageRange', 'domains', 'themeId', 'tags', 'durationMin', 'coView', 'cover']}
              onChange={(value) => { edited(); setMetadata(asSchema(value)); }} />
            {themes.error && <Alert type="warning" title="主题列表暂时不可用" description={themes.error.message}
              action={<Button onClick={themes.reload}>重试</Button>} />}
          </section>
          <section className="page-section">
            <h2>目标与家长指南</h2>
            <SchemaObject {...context} schema={schema} value={metadata} only={['objectives', 'parentGuide']}
              onChange={(value) => { edited(); setMetadata(asSchema(value)); }} />
          </section>
          <section className="page-section" data-content-path="steps" tabIndex={-1}>
            <div className="content-section-heading"><h2>课程步骤</h2><span className="muted">{steps.length} / 8 步</span></div>
            {incompatible && <Alert type="warning" showIcon title="家长指引课仅允许活动指引和儿歌"
              description="已有不适合的步骤会保留为错误状态；请删去这些步骤，并添加家长活动指引或儿歌后保存。" />}
            {steps.length === 0 && <EmptyState description="还没有课程步骤" />}
            <div className="content-steps">
              {steps.map((draft, index) => (
                <StepEditor key={draft.key} {...context} disabled={saving || uploading} draft={draft} index={index}
                  count={steps.length} activity={activities.find((activity) => activity.type === draft.step.type)}
                  dragging={dragging === draft.key}
                  onChange={(next) => updateSteps(steps.map((item) => item.key === draft.key ? next : item))}
                  onMove={(to) => updateSteps(reorder(steps, index, to))}
                  onDelete={() => updateSteps(steps.filter((item) => item.key !== draft.key))}
                  onCopy={() => {
                    const copy = { ...structuredClone(draft), key: stepDraft(draft.step).key };
                    const next = [...steps];
                    next.splice(index + 1, 0, copy);
                    updateSteps(next);
                  }}
                  onDragStart={setDragging}
                  onDrop={(key) => {
                    const from = steps.findIndex((item) => item.key === dragging);
                    const to = steps.findIndex((item) => item.key === key);
                    if (from >= 0 && to >= 0) updateSteps(reorder(steps, from, to));
                    setDragging(undefined);
                  }} />
              ))}
            </div>
            <div className="content-add-step">
              <Select aria-label="选择活动类型" placeholder="选择活动类型" value={selectedActivity}
                showSearch optionFilterProp="label" disabled={saving || uploading || steps.length >= 8}
                onChange={setSelectedActivity} options={availableActivities.map((activity) => ({
                  value: activity.type, disabled: !activity.enabled,
                  label: `${activity.name}${activity.ageRange ? ` · ${activity.ageRange[0]}–${activity.ageRange[1]} 月` : ''}${!activity.enabled ? '（未启用）' : ''}`,
                }))} />
              <Button icon={<PlusOutlined />} disabled={!selectedActivity || steps.length >= 8 || saving || uploading}
                onClick={() => {
                  const activity = availableActivities.find((item) => item.type === selectedActivity && item.enabled);
                  if (activity) { updateSteps([...steps, newStep(activity)]); setSelectedActivity(undefined); }
                }}>添加步骤</Button>
            </div>
          </section>
          <section className="page-section">
            <h2>线下延伸活动</h2>
            <SchemaObject {...context} schema={schema} value={metadata} only={['offline']}
              onChange={(value) => { edited(); setMetadata(asSchema(value)); }} />
          </section>
          <section className="page-section">
            <PrintablesEditor value={Array.isArray(metadata.printables) ? metadata.printables as Printable[] : undefined}
              concepts={concepts} issues={reviewed ? issues : []} disabled={saving}
              onChange={(printables) => { edited(); setMetadata((current) => ({ ...current, printables })); }} />
          </section>
        </div>
        <aside className="content-editor-preview">
          <div className="content-section-heading">
            <h2>实时预览</h2>
            <Tag color={errors.length ? 'warning' : 'success'}>{errors.length ? '草稿待完善' : '本地校验通过'}</Tag>
          </div>
          {preview
            ? <Preview lesson={preview} packId={CUSTOM_PACK} title="自定义课程实时预览" />
            : <EmptyState description="课程尚未完整" />}
          {preview && errors.length > 0 && <p className="muted" role="status">当前显示最近一次有效草稿</p>}
          {uploading && <p role="status">正在上传素材…</p>}
          <div className="content-preview-summary">
            <span>{steps.length} 个步骤</span><span>{metadata.durationMin as number} 分钟</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
