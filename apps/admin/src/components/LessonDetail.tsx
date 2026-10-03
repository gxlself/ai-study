import { useEffect, useState } from 'react';
import { CopyOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PrinterOutlined, PushpinOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Drawer, Modal, Popconfirm, Space, Tag } from 'antd';
import { useNavigate } from 'react-router';
import { ageOf, BUILTIN_ACTIVITY_META, type ChildProfile, type PluginInfo, type ResolvedConcept } from '@sprout/schema';
import { useFamily } from '../context';
import { api } from '../lib/api';
import { useResource } from '../lib/hooks';
import { formatAge, formatDuration } from '../lib/format';
import { pinAgeWarning } from '../lib/lesson-age';
import { DomainTags, LessonTypeTags, ResourceState } from './ui';
import Preview from './Preview';
import IssueList from '../features/content/IssueList';
import { assetUrl, CUSTOM_PACK, messageOf, responseLessonId, toggleLessonPlan, type LessonDocument } from '../features/content/model';
import '../features/content/content.css';

export default function LessonDetail({ lessonId, onClose }: { lessonId: string | null; onClose: () => void }) {
  const resource = useResource<LessonDocument>(lessonId ? `/api/lessons/${encodeURIComponent(lessonId)}` : null);
  const concepts = useResource<ResolvedConcept[]>(lessonId ? '/api/lexicon' : null);
  const plugins = useResource<PluginInfo[]>(lessonId ? '/api/plugins' : null);
  const { child, refreshChildren } = useFamily();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string>();
  useEffect(() => { setPreview(false); }, [lessonId]);
  const document = resource.data;
  const lesson = document?.lesson;
  const custom = document?.packId === CUSTOM_PACK;
  const pinned = lesson ? child?.plan.pinned.includes(lesson.id) : false;
  const skipped = lesson ? child?.plan.skipped.includes(lesson.id) : false;
  const ageWarning = child && lesson ? pinAgeWarning(ageOf(child.birthday).months, lesson.ageRange) : undefined;
  const cover = lesson ? assetUrl(lesson.cover?.image ?? (lesson.cover?.concept ? `concept:${lesson.cover.concept}` : undefined), document?.packId, concepts.data) : undefined;
  const activityNames = new Map(plugins.data?.flatMap((plugin) => plugin.activities.map((activity) => [activity.type, activity.name.zh] as const)));
  function close() { setPreview(false); onClose(); }
  async function copy() {
    if (!lesson) return;
    setBusy('copy');
    try {
      const result = await api.post<unknown>(`/api/lessons/${encodeURIComponent(lesson.id)}/duplicate`);
      const id = responseLessonId(result);
      if (!id) throw new Error('复制已提交，但服务端未返回课程标识，请回课程库查看');
      close();
      navigate(`/lessons/${encodeURIComponent(id)}/edit`);
    } catch (cause) { void message.error(messageOf(cause)); }
    finally { setBusy(undefined); }
  }
  async function plan(action: 'pinned' | 'skipped') {
    if (!child || !lesson) return;
    setBusy(action);
    try {
      const latest = await api.get<ChildProfile>(`/api/children/${encodeURIComponent(child.id)}`);
      if (action === 'pinned' && !latest.plan.pinned.includes(lesson.id)) {
        const warning = pinAgeWarning(ageOf(latest.birthday).months, lesson.ageRange);
        if (warning) void message.warning(warning);
      }
      await api.put(`/api/children/${encodeURIComponent(child.id)}`, { plan: toggleLessonPlan(latest.plan, lesson.id, action) });
      await refreshChildren();
      void message.success(`${child.name}的课程安排已更新`);
    } catch (cause) { void message.error(messageOf(cause)); }
    finally { setBusy(undefined); }
  }
  async function remove() {
    if (!lesson || !custom) return;
    setBusy('delete');
    try {
      await api.delete(`/api/lessons/${encodeURIComponent(lesson.id)}`);
      void message.success('课程已删除');
      close();
    } catch (cause) { void message.error(messageOf(cause)); }
    finally { setBusy(undefined); }
  }
  return (
    <>
      <Drawer title={lesson?.title.zh ?? '课程详情'} open={lessonId !== null} onClose={close}
        size={760} destroyOnHidden className="content-detail"
        footer={lesson && <Space wrap>
          <Button icon={<EyeOutlined />} type="primary" onClick={() => setPreview(true)}>预览课程</Button>
          {!!lesson.printables?.length && <Button icon={<PrinterOutlined />} onClick={() => {
            close(); navigate(`/print/lesson/${encodeURIComponent(lesson.id)}`);
          }}>打印实体卡片</Button>}
          <Button icon={<CopyOutlined />} loading={busy === 'copy'} disabled={!!busy} onClick={() => void copy()}>复制为我的课程</Button>
          {custom && <Button icon={<EditOutlined />} disabled={!!busy} onClick={() => {
            close(); navigate(`/lessons/${encodeURIComponent(lesson.id)}/edit`);
          }}>编辑</Button>}
          {custom && <Popconfirm title="删除这节自定义课程？" description="删除后无法撤销。" okText="删除" cancelText="保留" onConfirm={remove}>
            <Button danger icon={<DeleteOutlined />} disabled={!!busy} loading={busy === 'delete'}>删除</Button>
          </Popconfirm>}
        </Space>}>
        <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload}>
          {lesson && <>
            <div className="content-detail-intro">
              {cover && <img src={cover} alt={lesson.title.zh} className="content-detail-cover" />}
              <div>
                {lesson.title.en && <p lang="en">{lesson.title.en}</p>}
                {lesson.summary && <p>{lesson.summary.zh}{lesson.summary.en && <span className="content-secondary" lang="en">{lesson.summary.en}</span>}</p>}
                <DomainTags domains={lesson.domains} />
                <LessonTypeTags audience={lesson.audience} hasPrintables={!!lesson.printables?.length} />
              </div>
            </div>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" items={[
              { key: 'age', label: '适龄', children: `${formatAge(lesson.ageRange[0])} 至 ${formatAge(lesson.ageRange[1])}` },
              { key: 'duration', label: '建议时长', children: formatDuration(lesson.durationMin * 60) },
              { key: 'coview', label: '陪同', children: ({ required: '必须陪同', recommended: '建议陪同', optional: '可选陪同' })[lesson.coView] },
              { key: 'pack', label: '内容包', children: document?.packId },
            ]} />
            {lesson.audience === 'parent' && <Alert type="info" showIcon title="这是一节家长指引课"
              description="屏幕给家长看，读完后放下设备去陪宝宝玩；不会计入孩子屏幕时间。" />}
            {!!lesson.tags?.length && <div className="content-tags">{lesson.tags.map((tag, index) => <Tag key={`${tag}-${index}`}>{tag}</Tag>)}</div>}
            <div className="content-plan-actions">
              <strong>{child ? `${child.name}的课程安排` : '尚未选择孩子'}</strong>
              <Space wrap>
                <Button icon={<PushpinOutlined />} type={pinned ? 'primary' : 'default'} disabled={!child || !!busy}
                  loading={busy === 'pinned'} onClick={() => void plan('pinned')}>{pinned ? '取消置顶' : '置顶给孩子'}</Button>
                <Popconfirm title={skipped ? '恢复自动安排这节课程？' : '不再为孩子自动安排这节课程？'}
                  okText={skipped ? '恢复' : '跳过'} cancelText="取消" onConfirm={() => plan('skipped')} disabled={!child || !!busy}>
                  <Button icon={<StopOutlined />} disabled={!child || !!busy} loading={busy === 'skipped'}>{skipped ? '恢复安排' : '跳过课程'}</Button>
                </Popconfirm>
              </Space>
            </div>
            {ageWarning && <Alert type="warning" showIcon title="置顶课程月龄提醒" description={ageWarning} />}
            <IssueList issues={document?.issues ?? []} />
            <section className="page-section">
              <h2>学习目标</h2>
              <ul className="content-readable-list">{lesson.objectives.map((objective, index) => <li key={index}>{objective.zh}
                {objective.en && <span lang="en" className="content-secondary">{objective.en}</span>}</li>)}</ul>
            </section>
            <section className="page-section">
              <h2>家长指南</h2><p>{lesson.parentGuide.intro}</p>
              {!!lesson.parentGuide.tips?.length && <ul className="content-readable-list">{lesson.parentGuide.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul>}
              {!!lesson.parentGuide.phrases?.length && <>
                <h3>可以这样说</h3>
                {lesson.parentGuide.phrases.map((phrase, index) => <blockquote key={index}>{phrase.zh}
                  {phrase.en && <span lang="en" className="content-secondary">{phrase.en}</span>}</blockquote>)}
              </>}
              {lesson.parentGuide.why && <><h3>理念依据</h3><p>{lesson.parentGuide.why}</p></>}
              {!!lesson.parentGuide.refs?.length && <p className="muted">参考文献：{lesson.parentGuide.refs.join('、')}</p>}
            </section>
            <section className="page-section">
              <h2>课程步骤</h2>
              <ol className="content-readable-list">{lesson.steps.map((step, index) => <li key={index}>
                <strong>{step.title?.zh ?? activityNames.get(step.type) ?? BUILTIN_ACTIVITY_META[step.type as keyof typeof BUILTIN_ACTIVITY_META]?.zh ?? step.type}</strong>
                {step.title?.en && <span className="content-secondary">{step.title.en}</span>}
                {step.parentTip && <p>{step.parentTip}</p>}
                <span className="muted">{activityNames.get(step.type) ?? step.type}</span>
              </li>)}</ol>
            </section>
            <section className="page-section">
              <h2>线下延伸活动</h2>
              {lesson.offline.map((activity, index) => <article key={index} className="content-offline">
                <div className="content-section-heading"><h3>{activity.title}</h3>{activity.minutes && <Tag>{activity.minutes} 分钟</Tag>}</div>
                {!!activity.materials?.length && <p>材料：{activity.materials.join('、')}</p>}
                <ol className="content-readable-list">{activity.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
                {activity.question && <p><strong>可以问宝宝：</strong>{activity.question}</p>}
                {activity.levels?.easier && <p><strong>更简单：</strong>{activity.levels.easier}</p>}
                {activity.levels?.harder && <p><strong>更有挑战：</strong>{activity.levels.harder}</p>}
                {activity.safety && <Alert type="warning" showIcon title={activity.safety} />}
                {!!activity.domains?.length && <DomainTags domains={activity.domains} />}
              </article>)}
            </section>
          </>}
        </ResourceState>
      </Drawer>
      <Modal open={preview && !!lesson} title={lesson?.title.zh ?? '课程预览'} footer={null} width={1040}
        onCancel={() => setPreview(false)} destroyOnHidden>
        {preview && lesson && <Preview lessonId={lesson.id} title={`${lesson.title.zh}预览`} />}
      </Modal>
    </>
  );
}
