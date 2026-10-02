import { CheckOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import {
  MilestoneObservationInput, type MilestoneItem, type MilestoneObservation,
} from '@sprout/schema';
import { App, Button, DatePicker, Input, Popconfirm, Radio, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useId, useState } from 'react';
import { api } from '../../lib/api';
import { MutationError } from './components';
import { MILESTONE_DOMAINS } from './model';

export default function ObservationEditor({ childId, item, observation, onSaved }: {
  childId: string;
  item: MilestoneItem;
  observation?: MilestoneObservation;
  onSaved: (itemId: string, observation?: MilestoneObservation) => void;
}) {
  const { message } = App.useApp();
  const inputId = useId();
  const [status, setStatus] = useState<MilestoneObservationInput['status'] | undefined>(observation?.status);
  const [note, setNote] = useState(observation?.note ?? '');
  const [date, setDate] = useState<Dayjs | null>(dayjs(observation?.observedAt ?? undefined));
  const [busy, setBusy] = useState<'save' | 'delete'>();
  const [error, setError] = useState<unknown>();
  const dirty = status !== observation?.status || note !== (observation?.note ?? '') ||
    (!!observation && date?.format('YYYY-MM-DD') !== observation.observedAt);
  const path = `/api/children/${encodeURIComponent(childId)}/milestones/${encodeURIComponent(item.id)}`;

  async function save() {
    if (!status) {
      setError(new Error('请先选择已做到、正在萌芽或还没有。'));
      return;
    }
    if (!date?.isValid() || date.isAfter(dayjs(), 'day')) {
      setError(new Error('请选择不晚于今天的观察日期。'));
      return;
    }
    const parsed = MilestoneObservationInput.safeParse({ status, note: note.trim(), observedAt: date.format('YYYY-MM-DD') });
    if (!parsed.success) {
      setError(new Error('请检查观察内容，备注最多 500 个字。'));
      return;
    }
    setBusy('save');
    setError(undefined);
    try {
      const saved = await api.put<MilestoneObservation>(path, parsed.data);
      setStatus(saved.status);
      setNote(saved.note ?? '');
      setDate(dayjs(saved.observedAt));
      onSaved(item.id, saved);
      void message.success('观察已保存');
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(undefined);
    }
  }

  async function clear() {
    setBusy('delete');
    setError(undefined);
    try {
      await api.delete(path);
      onSaved(item.id);
      setStatus(undefined);
      setNote('');
      setDate(dayjs());
      void message.success('观察已清除');
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <article className="family-observation">
      <div className="family-section-heading">
        <Tag>{MILESTONE_DOMAINS[item.domain]}</Tag>
        {observation && !dirty && <span className="muted"><CheckOutlined /> 已记录 · {observation.observedAt}</span>}
        {dirty && <Tag color="gold">未保存</Tag>}
      </div>
      <h3 id={`${inputId}-title`}>{item.zh}</h3>
      <p className="muted" lang="en">{item.en}</p>
      <Radio.Group
        aria-labelledby={`${inputId}-title`}
        optionType="button" buttonStyle="solid" value={status}
        disabled={!!busy}
        onChange={(event) => { setStatus(event.target.value); setError(undefined); }}
        options={[
          { value: 'yes', label: '已做到' },
          { value: 'emerging', label: '正在萌芽' },
          { value: 'not-yet', label: '还没有' },
        ]}
      />
      <div className="family-observation-fields">
        <div>
          <label className="family-field-label" htmlFor={`${inputId}-note`}>备注</label>
          <Input.TextArea id={`${inputId}-note`} value={note} disabled={!!busy} maxLength={500} showCount
            autoSize={{ minRows: 2, maxRows: 5 }} placeholder="记录这次发现的细节"
            onChange={(event) => setNote(event.target.value)} />
        </div>
        <div>
          <label className="family-field-label" htmlFor={`${inputId}-date`}>观察日期</label>
          <DatePicker id={`${inputId}-date`} value={date} disabled={!!busy} format="YYYY-MM-DD"
            onChange={setDate} disabledDate={(value) => value.isAfter(dayjs(), 'day')} placeholder="选择日期" />
        </div>
      </div>
      <MutationError error={error} title="观察未能更新" />
      <div className="toolbar" style={{ marginTop: 22, marginBottom: 0 }}>
        <Button icon={<SaveOutlined />} type="primary" disabled={!!busy || (!dirty && !!observation)}
          loading={busy === 'save'} onClick={() => void save()}>保存观察</Button>
        {observation && (
          <Popconfirm title="清除此条观察？" description="状态、备注与观察日期将一起清除。"
            okText="确认清除" cancelText="取消" okButtonProps={{ danger: true }}
            disabled={!!busy} onConfirm={clear}>
            <Button icon={<DeleteOutlined />} danger disabled={!!busy} loading={busy === 'delete'}>清除</Button>
          </Popconfirm>
        )}
      </div>
    </article>
  );
}
