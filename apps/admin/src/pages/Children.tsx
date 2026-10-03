import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { ageOf, type ChildProfile, type ResolvedConcept } from '@sprout/schema';
import { App, Button, Popconfirm, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { PageTitle, ResourceState, EmptyState } from '../components/ui';
import { useFamily } from '../context';
import { api } from '../lib/api';
import { formatAge } from '../lib/format';
import { useResource } from '../lib/hooks';
import ChildEditor from '../features/family/ChildEditor';
import CoViewNotice from '../features/family/CoViewNotice';
import { ChildAvatar, FetchWarning, MutationError, RefreshButton } from '../features/family/components';
import { LANGUAGE_OPTIONS, SCREEN_MODE_LABELS } from '../features/family/model';
import '../features/family/family.css';

export default function Children() {
  const family = useFamily();
  const { message } = App.useApp();
  const profiles = useResource<ChildProfile[]>('/api/children');
  const animals = useResource<ResolvedConcept[]>('/api/lexicon?category=animals');
  const [editing, setEditing] = useState<ChildProfile | null>();
  const [deleting, setDeleting] = useState<string>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    setEditing(undefined);
    setError(undefined);
  }, [family.childId]);

  async function saved(child: ChildProfile) {
    setEditing(undefined);
    profiles.reload();
    await family.refreshChildren();
    family.selectChild(child.id);
  }

  async function remove(child: ChildProfile) {
    setDeleting(child.id);
    setError(undefined);
    try {
      await api.delete(`/api/children/${encodeURIComponent(child.id)}`);
      void message.success('孩子档案及相关记录已删除');
      profiles.reload();
      await family.refreshChildren();
    } catch (failure) {
      setError(failure);
    } finally {
      setDeleting(undefined);
    }
  }

  function refresh() {
    profiles.reload();
    animals.reload();
    void family.refreshChildren();
  }

  return (
    <div className="family-page">
      <PageTitle title="孩子档案" subtitle="每个孩子都有自己的成长节奏"
        extra={<div className="toolbar">
          <RefreshButton onClick={refresh} loading={profiles.loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>新建档案</Button>
        </div>} />
      <MutationError error={error} title="档案未能删除" />
      <FetchWarning error={animals.error} retry={animals.reload} />
      <ResourceState loading={profiles.loading} error={profiles.error} retry={profiles.reload}>
        {profiles.data?.length ? (
          <section className="page-section">
            <div className="item-grid">
              {profiles.data.map((child) => (
                <article className="family-child-item stacked" key={child.id}>
                  <div className="family-profile-heading">
                    <ChildAvatar child={child} concepts={animals.data ?? []} />
                    <div className="stacked">
                      <h2>{child.name}</h2>
                      <span className="muted">{child.nickname && `${child.nickname} · `}{formatAge(ageOf(child.birthday).months)}</span>
                    </div>
                    {family.childId === child.id && <Tag color="green">当前孩子</Tag>}
                  </div>
                  <div className="muted">生日：{child.birthday}</div>
                  <div>{LANGUAGE_OPTIONS.find((mode) => mode.value === child.languageMode)?.label}</div>
                  <Tag color={child.screen.mode === 'co-view' ? 'blue' : 'gold'}>屏幕模式：{SCREEN_MODE_LABELS[child.screen.mode ?? 'auto']}</Tag>
                  <CoViewNotice key={`${child.updatedAt}:${ageOf(child.birthday).months}`} child={child} />
                  <div className="toolbar">
                    <Button icon={<CheckOutlined />} disabled={family.childId === child.id || !!deleting}
                      onClick={() => family.selectChild(child.id)}>
                      {family.childId === child.id ? '已选中' : '设为当前'}
                    </Button>
                    <Button icon={<EditOutlined />} disabled={!!deleting} onClick={() => setEditing(child)}>编辑</Button>
                    <Popconfirm
                      title={`删除${child.name}的档案？`}
                      description="学习记录与里程碑观察也会一并删除，无法撤销。"
                      okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }}
                      onConfirm={() => remove(child)} disabled={!!deleting}
                    >
                      <Button danger icon={<DeleteOutlined />} loading={deleting === child.id} disabled={!!deleting && deleting !== child.id}>删除</Button>
                    </Popconfirm>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : <EmptyState description="还没有孩子档案"
          action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>添加第一个孩子</Button>} />}
      </ResourceState>
      {editing !== undefined && (
        <ChildEditor key={editing?.id ?? 'new'} child={editing ?? undefined}
          onClose={() => setEditing(undefined)} onSaved={saved} />
      )}
    </div>
  );
}
