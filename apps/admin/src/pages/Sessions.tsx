import { ageOf, type ChildProfile, type DeviceInfo, type LessonSummary, type SessionRecord } from '@sprout/schema';
import { Alert, Button, DatePicker, Progress, Select, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import LessonDetail from '../components/LessonDetail';
import { EmptyState, LessonTypeTags, PageTitle, ResourceState } from '../components/ui';
import { useFamily } from '../context';
import { formatAge, formatDuration } from '../lib/format';
import { useResource } from '../lib/hooks';
import {
  DomainDistribution, FetchWarning, NoChild, RefreshButton, ScreenChart,
} from '../features/family/components';
import { completionPercent, sessionsPath } from '../features/family/model';
import type { FamilyStats } from '../features/family/types';
import '../features/family/family.css';

function SessionsContent({ child }: { child: ChildProfile }) {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => [dayjs().subtract(29, 'day'), dayjs()]);
  const [limit, setLimit] = useState(200);
  const [page, setPage] = useState(1);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const sessions = useResource<SessionRecord[]>(sessionsPath(child.id, range, limit));
  const stats = useResource<FamilyStats>(`/api/children/${encodeURIComponent(child.id)}/stats?days=30`);
  const lessons = useResource<LessonSummary[]>('/api/lessons');
  const devices = useResource<DeviceInfo[]>('/api/devices');
  const byLesson = new Map((lessons.data ?? []).map((lesson) => [lesson.id, lesson]));
  const byDevice = new Map((devices.data ?? []).map((device) => [device.id, device]));
  const sessionCount = stats.data?.days.reduce((sum, day) => sum + day.lessons, 0) ?? 0;
  const completedCount = stats.data?.days.reduce((sum, day) => sum + day.completed, 0) ?? 0;
  const columns: TableColumnsType<SessionRecord> = [
    {
      title: '开始时间', dataIndex: 'startedAt', width: 175,
      render: (value: string) => dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm') : '时间不可用',
      sorter: (a, b) => a.startedAt.localeCompare(b.startedAt),
      defaultSortOrder: 'descend',
    },
    {
      title: '课程', dataIndex: 'lessonId', width: 220,
      render: (id: string) => <Button type="link" onClick={() => setLessonId(id)}>{byLesson.get(id)?.title.zh ?? id}</Button>,
    },
    {
      title: '实际时长', dataIndex: 'durationSec', width: 130,
      render: (seconds: number) => formatDuration(seconds), sorter: (a, b) => a.durationSec - b.durationSec,
    },
    { title: '课程类型', key: 'audience', width: 140, render: (_, session) =>
      <LessonTypeTags audience={session.audience} /> },
    {
      title: '完成度', key: 'completion', width: 200,
      render: (_, session) => {
        const percent = completionPercent(session);
        return <div className="family-session-progress">
          {percent === null ? <span className="muted">暂无步骤数据</span>
            : <Progress percent={percent} size="small" status="normal" strokeColor="#459982" />}
          <div><Tag color={session.completed ? 'green' : 'default'}>{session.completed ? '已完成' : '未完成'}</Tag>
            <span className="muted">{session.stepsCompleted}/{session.stepsTotal} 步</span></div>
        </div>;
      },
    },
    {
      title: '设备', dataIndex: 'deviceId', width: 170,
      render: (id: string | undefined) => id
        ? byDevice.get(id)?.name ?? `设备 ${id}`
        : <span className="muted">未关联设备</span>,
    },
  ];

  function refresh() {
    sessions.reload();
    stats.reload();
    lessons.reload();
    devices.reload();
  }

  return (
    <div className="family-page">
      <PageTitle title="学习记录" subtitle={`${child.nickname || child.name} · ${formatAge(ageOf(child.birthday).months)}`}
        extra={<RefreshButton onClick={refresh} loading={sessions.loading || stats.loading} />} />
      <section className="page-section">
        <h2>近 30 天统计</h2>
        <ResourceState loading={stats.loading} error={stats.error} retry={stats.reload}>
          {stats.data && (
            <>
              <div className="metric-grid">
                <div className="metric"><span className="muted">孩子屏幕总时长</span><strong>{formatDuration(stats.data.totalSec)}</strong></div>
                <div className="metric"><span className="muted">学习次数</span><strong>{sessionCount}</strong></div>
                <div className="metric"><span className="muted">完整完成</span><strong>{completedCount}</strong></div>
              </div>
              <p className="muted">家长指引课不计入孩子的屏幕时间；记录只是家庭回顾，不设置打卡目标或排行。</p>
              <div className="two-column">
                <section><h3>屏幕使用趋势</h3><ScreenChart days={stats.data.days} /></section>
                <section><h3>领域分布</h3><DomainDistribution domains={stats.data.domains} /></section>
              </div>
            </>
          )}
        </ResourceState>
      </section>
      <section className="page-section">
        <h2>学习明细</h2>
        <div className="toolbar family-session-filter">
          <DatePicker.RangePicker
            aria-label="学习记录日期范围" value={range} format="YYYY-MM-DD" allowClear
            placeholder={['开始日期', '结束日期']}
            onChange={(value) => {
              setRange(value?.[0] && value[1] ? [value[0], value[1]] : null);
              setPage(1);
            }}
            disabledDate={(date) => date.isAfter(dayjs(), 'day')}
            presets={[
              { label: '近 7 天', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: '近 30 天', value: [dayjs().subtract(29, 'day'), dayjs()] },
              { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
            ]}
          />
          <Select aria-label="记录读取上限" className="family-session-limit" value={limit}
            onChange={(value) => { setLimit(value); setPage(1); }}
            options={[{ value: 200, label: '最近 200 条' }, { value: 1000, label: '最近 1000 条' }, { value: 5000, label: '最近 5000 条' }]} />
          {!range && <Tag>全部日期</Tag>}
        </div>
        <FetchWarning error={lessons.error} retry={lessons.reload} />
        <FetchWarning error={devices.error} retry={devices.reload} />
        {sessions.data && sessions.data.length >= limit && <Alert showIcon type="info"
          title={`已达到 ${limit} 条读取上限，当前列表可能不是全部记录。`}
          description="可缩小日期范围，或选择更大的读取上限。" />}
        <ResourceState loading={sessions.loading} error={sessions.error} retry={sessions.reload}>
          <div className="safe-table">
            <Table<SessionRecord>
              rowKey="id" columns={columns} dataSource={sessions.data ?? []} scroll={{ x: 895 }}
              locale={{ emptyText: <EmptyState description={range ? '所选日期内还没有学习记录' : '还没有学习记录'} /> }}
              pagination={{
                current: page, pageSize: 20, showSizeChanger: false, onChange: setPage,
                showTotal: (total) => `已读取 ${total} 条`,
              }}
            />
          </div>
        </ResourceState>
      </section>
      <LessonDetail lessonId={lessonId} onClose={() => setLessonId(null)} />
    </div>
  );
}

export default function Sessions() {
  const { child, loading } = useFamily();
  if (child) return <SessionsContent key={child.id} child={child} />;
  return <div className="family-page"><PageTitle title="学习记录" />
    <ResourceState loading={loading} error={null}><NoChild /></ResourceState></div>;
}
