import { ageOf, type ChildProfile, type MilestoneObservation } from '@sprout/schema';
import { Alert, Button, Progress, Tabs, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { EmptyState, PageTitle, ResourceState } from '../components/ui';
import { useFamily } from '../context';
import { formatAge } from '../lib/format';
import { useResource } from '../lib/hooks';
import { NoChild, RefreshButton } from '../features/family/components';
import { milestoneAgeFor, milestoneAges, milestoneProgress } from '../features/family/model';
import ObservationEditor from '../features/family/ObservationEditor';
import type { FamilyMilestones } from '../features/family/types';
import '../features/family/family.css';

function MilestonesContent({ child }: { child: ChildProfile }) {
  const resource = useResource<FamilyMilestones>(`/api/children/${encodeURIComponent(child.id)}/milestones`);
  const [observations, setObservations] = useState<MilestoneObservation[]>();
  const [selectedAge, setSelectedAge] = useState<number>();
  const months = ageOf(child.birthday).months;
  const ages = milestoneAges(resource.data?.items ?? []);
  const currentAge = milestoneAgeFor(months, ages);
  const activeAge = selectedAge !== undefined && ages.includes(selectedAge) ? selectedAge : currentAge;
  const recorded = observations ?? resource.data?.observations ?? [];
  const disclaimer = resource.data?.disclaimer;
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (resource.data) setObservations(resource.data.observations);
  }, [resource.data]);

  function update(itemId: string, observation?: MilestoneObservation) {
    setObservations((current) => {
      const next = (current ?? resource.data?.observations ?? []).filter((item) => item.itemId !== itemId);
      return observation ? [...next, observation] : next;
    });
  }

  function refresh() {
    setRevision((value) => value + 1);
    setObservations(undefined);
    resource.reload();
  }

  return (
    <div className="family-page">
      <PageTitle title="里程碑观察" subtitle={`${child.nickname || child.name} · ${formatAge(months)}`}
        extra={<RefreshButton onClick={refresh} loading={resource.loading} />} />
      <Alert showIcon type="info" title="观察成长，不是诊断工具"
        description={typeof disclaimer === 'string' ? disclaimer : disclaimer
          ? <><p>{disclaimer.zh}</p><p lang="en">{disclaimer.en}</p></>
          : '每个孩子的发展节奏不同。这些记录不能替代专业评估。'} />
      <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload}>
        {resource.data?.items.length ? (
          <>
            <section className="page-section">
              <h2>各月龄观察进度</h2>
              <div className="family-milestone-summary">
                {ages.map((age) => {
                  const progress = milestoneProgress(resource.data!.items, recorded, age);
                  return <div key={age}>
                    <Button type={age === activeAge ? 'primary' : 'default'} onClick={() => setSelectedAge(age)}>
                      {age} 个月{age === currentAge ? ' · 当前' : ''}
                    </Button>
                    <Progress percent={progress.total ? Math.round(progress.done / progress.total * 100) : 0}
                      size="small" strokeColor="#459982" />
                    <span className="muted">已做到 {progress.done}/{progress.total} · 待观察 {progress.pending}</span>
                  </div>;
                })}
              </div>
            </section>
            <section className="page-section">
              <Tabs
                activeKey={activeAge === undefined ? undefined : String(activeAge)}
                onChange={(value) => setSelectedAge(Number(value))}
                items={ages.map((age) => ({
                  key: String(age),
                  label: <span>{age} 个月 {age === currentAge && <Tag color="green">当前</Tag>}</span>,
                  children: <div>
                    {resource.data!.items.filter((item) => item.ageMonths === age).map((item) => {
                      const observation = recorded.find((entry) => entry.itemId === item.id);
                      return <ObservationEditor
                        key={`${revision}:${item.id}:${observation?.updatedAt ?? 'unobserved'}`}
                        childId={child.id} item={item} observation={observation} onSaved={update}
                      />;
                    })}
                  </div>,
                }))}
              />
            </section>
          </>
        ) : <EmptyState description="暂时没有里程碑条目，内容加载后即可开始观察" />}
      </ResourceState>
    </div>
  );
}

export default function Milestones() {
  const { child, loading } = useFamily();
  if (child) return <MilestonesContent key={child.id} child={child} />;
  return <div className="family-page"><PageTitle title="里程碑观察" />
    <ResourceState loading={loading} error={null}><NoChild /></ResourceState></div>;
}
