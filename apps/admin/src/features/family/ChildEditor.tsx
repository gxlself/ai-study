import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import {
  ageOf,
  DOMAINS,
  DOMAIN_LABELS,
  type ChildProfile,
  type LessonSummary,
  type ResolvedConcept,
  type Route,
  type ValidationIssue,
} from '@sprout/schema';
import {
  Alert, App, Avatar, Button, DatePicker, Drawer, Form, Input, InputNumber,
  Popconfirm, Select, Switch, TimePicker, Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { formatAge } from '../../lib/format';
import { effectiveScreenMode, sessionHardLimit } from '../../lib/screen-policy';
import { FetchWarning, MutationError } from './components';
import {
  childFormValues, errorIssues, LANGUAGE_OPTIONS, prepareChildInput, SCREEN_MODE_EXPLANATION,
  SCREEN_MODE_LABELS, stageForAge, timeWindowError,
} from './model';
import type { ChildFormValues, RouteSummary } from './types';

type ChildFieldName = NonNullable<Parameters<ReturnType<typeof Form.useForm<ChildFormValues>>[0]['setFields']>[0][number]['name']>;
const FIELD_NAMES: Record<string, ChildFieldName> = {
  name: ['name'], nickname: ['nickname'], birthday: ['birthday'], avatar: ['avatar'],
  languageMode: ['languageMode'], showPinyin: ['showPinyin'],
  'screen.sessionMaxMin': ['screen', 'sessionMaxMin'],
  'screen.dailyMaxMin': ['screen', 'dailyMaxMin'],
  'screen.windows': ['screen', 'windows'],
  'screen.mode': ['screen', 'mode'],
  'screen.distanceReminder': ['screen', 'distanceReminder'],
  'plan.routeId': ['plan', 'routeId'], 'plan.themeId': ['plan', 'themeId'],
  'plan.pinned': ['plan', 'pinned'], 'plan.skipped': ['plan', 'skipped'],
  'plan.focusDomains': ['plan', 'focusDomains'],
};

export default function ChildEditor({ child, onClose, onSaved }: {
  child?: ChildProfile;
  onClose: () => void;
  onSaved: (child: ChildProfile) => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ChildFormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const routes = useResource<RouteSummary[]>('/api/routes');
  const animals = useResource<ResolvedConcept[]>('/api/lexicon?category=animals');
  const lessons = useResource<LessonSummary[]>('/api/lessons');
  const routeId = Form.useWatch(['plan', 'routeId'], form) ?? child?.plan.routeId ?? 'sprout.core.route';
  const route = useResource<Route>(`/api/routes/${encodeURIComponent(routeId)}`);
  const birthday = Form.useWatch('birthday', form);
  const languageMode = Form.useWatch('languageMode', form) ?? child?.languageMode ?? 'zh-en';
  const screenMode = Form.useWatch(['screen', 'mode'], form) ?? child?.screen.mode ?? 'auto';
  const sessionMax = Form.useWatch(['screen', 'sessionMaxMin'], form);
  const dailyMax = Form.useWatch(['screen', 'dailyMaxMin'], form);
  const pinned: string[] = Form.useWatch(['plan', 'pinned'], form) ?? child?.plan.pinned ?? [];
  const skipped: string[] = Form.useWatch(['plan', 'skipped'], form) ?? child?.plan.skipped ?? [];
  const avatar = Form.useWatch('avatar', form) ?? child?.avatar;
  const selectedTheme = Form.useWatch(['plan', 'themeId'], form);
  const validBirthday = birthday?.isValid() && !birthday.isAfter(dayjs(), 'day');
  const stage = validBirthday && birthday ? stageForAge(route.data, ageOf(birthday.format('YYYY-MM-DD')).months) : undefined;
  const ageMonths = validBirthday && birthday ? ageOf(birthday.format('YYYY-MM-DD')).months : undefined;
  const coViewUnavailable = ageMonths !== undefined && ageMonths < 18;
  const youngCoView = ageMonths !== undefined && ageMonths >= 18 && ageMonths < 24 && screenMode === 'co-view';
  const resolvedMode = effectiveScreenMode(ageMonths ?? 0, screenMode, stage?.screen.childScreen);
  const hardLimit = sessionHardLimit(ageMonths ?? 0, resolvedMode);
  const overRecommendation = stage && (
    (sessionMax != null && sessionMax > stage.screen.sessionMaxMin) ||
    (dailyMax != null && dailyMax > stage.screen.dailyMaxMin)
  );
  const availableRoutes = routes.data ?? [];
  const routeOptions = availableRoutes.map((item) => ({ value: item.id, label: item.title.zh }));
  if (!routeOptions.some((item) => item.value === routeId)) {
    routeOptions.push({ value: routeId, label: route.data?.title.zh ?? `当前路线：${routeId}` });
  }
  const conceptOptions = [...new Map((animals.data ?? []).map((item) => [item.id, item])).values()]
    .map((item) => ({ value: item.id, label: item.zh, imageUrl: item.imageUrl }));
  if (avatar && !conceptOptions.some((item) => item.value === avatar)) {
    conceptOptions.push({ value: avatar, label: '当前头像', imageUrl: '' });
  }
  const lessonOptions = (lessons.data ?? []).map((lesson) => ({
    value: lesson.id,
    label: `${lesson.title.zh} · ${lesson.ageRange[0]}–${lesson.ageRange[1]} 个月`,
  }));
  for (const id of [...new Set([...pinned, ...skipped])]) {
    if (!lessonOptions.some((item) => item.value === id)) {
      lessonOptions.push({ value: id, label: `暂不可用的课程：${id}` });
    }
  }
  const knownTheme = route.data?.stages.some((item) => item.themes.some((theme) => theme.id === selectedTheme));
  const themeOptions = [
    { value: '', label: '自动（按月龄安排）' },
    ...(selectedTheme && !knownTheme ? [{ value: selectedTheme, label: `当前主题：${selectedTheme}` }] : []),
    ...(route.data?.stages ?? []).map((item) => ({
      label: `${item.title.zh} · ${item.ageRange[0]}–${item.ageRange[1]} 个月`,
      options: item.themes.map((theme) => ({ value: theme.id, label: `${theme.title.zh} · ${theme.weeks} 周` })),
    })),
  ];

  function showFieldIssues(issues: ValidationIssue[]) {
    form.setFields(issues.flatMap((issue) => {
      const name = FIELD_NAMES[issue.path] ?? FIELD_NAMES[issue.path.split('.').slice(0, 2).join('.')];
      return name ? [{ name, errors: [issue.message] }] : [];
    }));
  }

  async function save(values: ChildFormValues) {
    const result = prepareChildInput(values);
    if (!result.input) {
      showFieldIssues(result.issues);
      setError(new Error(result.issues.map((issue) => issue.message).join(' ')));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const saved = child
        ? await api.put<ChildProfile>(`/api/children/${encodeURIComponent(child.id)}`, result.input)
        : await api.post<ChildProfile>('/api/children', result.input);
      void message.success(child ? '孩子档案已更新' : '孩子档案已创建');
      await onSaved(saved);
    } catch (failure) {
      setError(failure);
      showFieldIssues(errorIssues(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      title={child ? `编辑${child.name}的档案` : '新建孩子档案'}
      size="min(640px, 100vw)"
      onClose={() => { if (!saving) onClose(); }}
      mask={{ closable: false }}
      keyboard={!saving}
      closable={!saving}
      destroyOnHidden
      footer={
        <div className="toolbar family-editor-actions">
          <Button disabled={saving} onClick={onClose}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => form.submit()}>保存档案</Button>
        </div>
      }
    >
      <Form<ChildFormValues>
        form={form}
        className="family-editor"
        layout="vertical"
        initialValues={childFormValues(child)}
        onFinish={save}
        onFinishFailed={() => setError(new Error('请检查标出的必填项和设置。'))}
        disabled={saving}
        scrollToFirstError
      >
        <MutationError error={error} title="档案未能保存" />
        <section className="family-editor-section">
          <h3>基本资料</h3>
          <div className="family-form-grid">
            <Form.Item name="name" label="名字" rules={[
              { required: true, whitespace: true, message: '请输入孩子的名字' },
              { max: 20, message: '名字最多 20 个字' },
            ]}>
              <Input maxLength={20} autoComplete="off" />
            </Form.Item>
            <Form.Item name="nickname" label="昵称" rules={[{ max: 20, message: '昵称最多 20 个字' }]}>
              <Input maxLength={20} autoComplete="off" />
            </Form.Item>
            <Form.Item name="birthday" label="生日" rules={[
              { required: true, message: '请选择生日' },
              { validator: (_, value) => value?.isAfter(dayjs(), 'day')
                ? Promise.reject(new Error('生日不能晚于今天')) : Promise.resolve() },
            ]}>
              <DatePicker format="YYYY-MM-DD" placeholder="选择生日" disabledDate={(date) => date.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="avatar" label="头像" extra={animals.data?.length === 0 ? '词库暂时没有动物词条，可稍后再选。' : undefined}>
              <Select
                allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="选择动物头像"
                loading={animals.loading} options={conceptOptions}
                optionRender={(option) => (
                  <span className="family-avatar-option">
                    <Avatar src={option.data.imageUrl || undefined} size={28}>{String(option.label).slice(0, 1)}</Avatar>
                    <span>{option.label}</span>
                  </span>
                )}
              />
            </Form.Item>
          </div>
          <FetchWarning error={animals.error} retry={animals.reload} />
          <Form.Item name="languageMode" label="语言模式" extra={LANGUAGE_OPTIONS.find((item) => item.value === languageMode)?.description}>
            <Select options={LANGUAGE_OPTIONS} />
          </Form.Item>
          <Form.Item name="showPinyin" label="显示拼音" valuePropName="checked">
            <Switch checkedChildren="显示" unCheckedChildren="不显示" />
          </Form.Item>
        </section>

        <section className="family-editor-section">
          <h3>屏幕设置</h3>
          {stage ? (
            <p className="family-editor-note">
              {formatAge(ageOf(birthday!.format('YYYY-MM-DD')).months)} · {stage.title.zh}：
              单次推荐 {stage.screen.sessionMaxMin} 分钟，每日推荐 {stage.screen.dailyMaxMin} 分钟。
            </p>
          ) : <p className="family-editor-note">{validBirthday ? '当前阶段推荐值暂不可用。' : '选择生日后显示阶段推荐值。'}</p>}
          <FetchWarning error={route.error} retry={route.reload} />
          <div className="family-form-grid">
            <Form.Item name={['screen', 'sessionMaxMin']} label="单次上限（分钟）"
              extra="留空跟随阶段默认值"
              dependencies={[['screen', 'mode'], ['birthday']]}
              rules={[{ type: 'number', min: 1, max: hardLimit, message: `单次上限应为 1 至 ${hardLimit} 分钟` }]}>
              <InputNumber min={1} max={hardLimit} placeholder={stage ? `默认 ${stage.screen.sessionMaxMin}` : '阶段默认'} />
            </Form.Item>
            <Form.Item name={['screen', 'dailyMaxMin']} label="每日上限（分钟）"
              extra="留空跟随阶段默认值；最多 60 分钟"
              rules={[{ type: 'number', min: 1, max: 60, message: '每日上限应为 1 至 60 分钟，不能超过 60 分钟' }]}>
              <InputNumber min={1} max={60} placeholder={stage ? `默认 ${stage.screen.dailyMaxMin}` : '阶段默认'} />
            </Form.Item>
          </div>
          {overRecommendation && <Alert showIcon type="warning" title="超过推荐值" description="当前设置高于本阶段默认时长，请优先安排屏幕外的亲子互动。" />}
          <Form.Item
            name={['screen', 'mode']}
            label="孩子侧屏幕模式"
            extra={SCREEN_MODE_EXPLANATION}
            getValueProps={(value: ChildFormValues['screen']['mode']) => ({ value: value ?? 'auto' })}
            normalize={(value: ChildFormValues['screen']['mode']) => value || undefined}
          >
            <Select
              options={[
                { value: 'auto', label: SCREEN_MODE_LABELS.auto },
                { value: 'parent-only', label: SCREEN_MODE_LABELS['parent-only'] },
                {
                  value: 'co-view',
                  label: coViewUnavailable ? '开启亲子共看（18 个月后可用）' : SCREEN_MODE_LABELS['co-view'],
                  disabled: coViewUnavailable,
                },
              ]}
            />
          </Form.Item>
          <Alert
            showIcon
            type="info"
            title="循证提示"
            description={<>
              屏幕只是引子：6–17 个月请使用家长指引和打印材料；亲子共看时要在场互动，不能背景播放或自动连播。
              <div className="muted">中国眼保健文件对 0–3 岁“不接触屏幕”的口径更严格，开启共看是家庭自愿的设计取舍；依据详见 <code>docs/research/evidence-review.md</code> 第 9 节。</div>
            </>}
          />
          {youngCoView && (
            <Alert
              showIcon
              type="warning"
              title="18–23 个月的亲子共看提醒"
              description="每次最多 8 分钟，必须由家长全程陪同；看完后请马上回到屏幕外的游戏和对话。"
            />
          )}
          <Form.List name={['screen', 'windows']} rules={[{
            validator: (_, windows: ChildFormValues['screen']['windows']) => {
              const warning = timeWindowError((windows ?? []).map((window) => ({
                start: window.start?.isValid() ? window.start.format('HH:mm') : '',
                end: window.end?.isValid() ? window.end.format('HH:mm') : '',
              })));
              return warning ? Promise.reject(new Error(warning)) : Promise.resolve();
            },
          }]}>
            {(fields, { add, remove }, { errors }) => (
              <div>
                <h3>可用时段</h3>
                {fields.map((field) => (
                  <div className="family-time-window" key={field.key}>
                    <Form.Item name={[field.name, 'start']} rules={[{ required: true, message: '请选择开始时间' }]}>
                      <TimePicker aria-label={`时段 ${field.name + 1} 开始时间`} format="HH:mm" placeholder="开始时间" needConfirm={false} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'end']} rules={[{ required: true, message: '请选择结束时间' }]}>
                      <TimePicker aria-label={`时段 ${field.name + 1} 结束时间`} format="HH:mm" placeholder="结束时间" needConfirm={false} />
                    </Form.Item>
                    <Popconfirm title="移除此可用时段？" okText="移除" cancelText="取消" onConfirm={() => remove(field.name)}>
                      <Tooltip title="移除时段"><Button danger type="text" icon={<DeleteOutlined />} aria-label={`移除时段 ${field.name + 1}`} /></Tooltip>
                    </Popconfirm>
                  </div>
                ))}
                {fields.length === 0 && <p className="muted">未限制可用时段。</p>}
                <Form.ErrorList errors={errors} />
                <Button icon={<PlusOutlined />} disabled={saving || fields.length >= 24} onClick={() => add({ start: null, end: null })}>添加时段</Button>
              </div>
            )}
          </Form.List>
          <Form.Item name={['screen', 'distanceReminder']} label="开始前护眼距离提醒" valuePropName="checked" style={{ marginTop: 20 }}>
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
        </section>

        <section className="family-editor-section">
          <h3>学习计划</h3>
          <FetchWarning error={routes.error} retry={routes.reload} />
          <Form.Item name={['plan', 'routeId']} label="成长路线" rules={[{ required: true, message: '请选择成长路线' }]}>
            <Select
              loading={routes.loading} options={routeOptions}
              onChange={() => form.setFieldValue(['plan', 'themeId'], null)}
            />
          </Form.Item>
          <Form.Item name={['plan', 'themeId']} label="当前主题"
            getValueProps={(value: string | null) => ({ value: value ?? '' })}
            normalize={(value: string) => value || null}>
            <Select showSearch={{ optionFilterProp: 'label' }} loading={route.loading} options={themeOptions} />
          </Form.Item>
          <FetchWarning error={lessons.error} retry={lessons.reload} />
          <Form.Item name={['plan', 'pinned']} label="置顶课程">
            <Select mode="multiple" showSearch={{ optionFilterProp: 'label' }}
              placeholder="选择每天优先安排的课程" loading={lessons.loading}
              options={lessonOptions.map((item) => ({ ...item, disabled: skipped.includes(item.value) }))} />
          </Form.Item>
          <Form.Item name={['plan', 'skipped']} label="跳过课程" dependencies={[['plan', 'pinned']]} rules={[{
            validator: (_, value: string[]) => (value ?? []).some((id) => (form.getFieldValue(['plan', 'pinned']) as string[] ?? []).includes(id))
              ? Promise.reject(new Error('同一课程不能同时置顶和跳过')) : Promise.resolve(),
          }]}>
            <Select mode="multiple" showSearch={{ optionFilterProp: 'label' }}
              placeholder="不再自动安排的课程" loading={lessons.loading}
              options={lessonOptions.map((item) => ({ ...item, disabled: pinned.includes(item.value) }))} />
          </Form.Item>
          <Form.Item name={['plan', 'focusDomains']} label="加强领域">
            <Select mode="multiple" placeholder="按孩子的兴趣选择"
              options={DOMAINS.map((domain) => ({ value: domain, label: DOMAIN_LABELS[domain].zh }))} />
          </Form.Item>
        </section>
      </Form>
    </Drawer>
  );
}
