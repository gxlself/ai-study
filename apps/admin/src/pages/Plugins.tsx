import { useId, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Popconfirm, Tabs, Tag } from 'antd';
import { AppstoreOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { PluginInfo } from '@sprout/schema';
import { api } from '../lib/api';
import { useResource } from '../lib/hooks';
import { formatAge } from '../lib/format';
import { EmptyState, PageTitle, ResourceState } from '../components/ui';
import {
  ActionError, ConfirmedSwitch, FilePicker, Permissions, useSystemAction,
} from '../features/system/shared';
import { groupPlugins, normalizeHttpUrl } from '../features/system/helpers';
import '../features/system/system.css';

const TRUST_WARNING = '第三方插件会在播放端执行代码，可能访问网络、麦克风、摄像头或本地存储。权限声明不等于安全审核或隔离保护，仅安装可信来源。';

function InstallPlugin({ onClose, onInstalled }: { onClose: () => void; onInstalled: () => void }) {
  const [source, setSource] = useState<'zip' | 'remote'>('zip');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [candidate, setCandidate] = useState<{ source: 'zip' | 'remote'; file: File | null; manifestUrl?: string } | null>(null);
  const [form] = Form.useForm<{ manifestUrl?: string; trusted: boolean }>();
  const formId = useId();
  const action = useSystemAction();

  async function install() {
    if (!candidate) return;
    const selected = candidate;
    const success = await action.run('install', () => selected.source === 'zip' && selected.file
      ? api.upload<PluginInfo>('/api/plugins/install', selected.file)
      : api.post<PluginInfo>('/api/plugins/remote', { manifestUrl: selected.manifestUrl }),
    '插件已安装，请核对其权限声明。');
    setCandidate(null);
    if (success) { onInstalled(); onClose(); }
  }

  return (
    <Modal
      open
      title="添加第三方插件"
      className="system-dialog"
      onCancel={() => { if (!action.busy) onClose(); }}
      closable={!action.busy}
      keyboard={!action.busy}
      maskClosable={!action.busy}
      footer={[
        <Button key="cancel" disabled={action.busy} onClick={onClose}>取消</Button>,
        <Popconfirm
          key="install"
          title="信任此来源并安装？"
          description={<div className="system-confirm-copy">安装后插件可能立即启用。同 ID 插件可能被替换，远程代码也可能随来源更新。</div>}
          open={!!candidate}
          trigger={[]}
          onOpenChange={(open) => { if (!open && !action.busy) setCandidate(null); }}
          onCancel={() => setCandidate(null)}
          onConfirm={install}
          okText="信任并安装"
          cancelText="取消"
          okButtonProps={{ loading: action.busy }}
          cancelButtonProps={{ disabled: action.busy }}
        >
          <Button type="primary" icon={<PlusOutlined />} form={formId} htmlType="submit" loading={action.busy}>
            安装插件
          </Button>
        </Popconfirm>,
      ]}
    >
      {action.feedback}
      <div className="stacked">
        <Alert type="warning" showIcon title="请先确认插件来源" description={TRUST_WARNING} />
        <Form
          id={formId}
          form={form}
          layout="vertical"
          noValidate
          disabled={action.busy}
          initialValues={{ trusted: false }}
          onValuesChange={() => setCandidate(null)}
          onFinish={(values) => {
            if (source === 'zip' && !file) { setFileError('请选择插件 ZIP 压缩包。'); return; }
            setCandidate({ source, file, manifestUrl: values.manifestUrl ? normalizeHttpUrl(values.manifestUrl) : undefined });
          }}
        >
          <Tabs
            activeKey={source}
            onChange={(key) => {
              setSource(key as typeof source);
              form.setFieldValue('trusted', false);
              setCandidate(null);
              action.clearError();
            }}
            items={[
              {
                key: 'zip',
                label: '上传 ZIP',
                disabled: action.busy,
                children: source === 'zip' && (
                  <Form.Item label="插件文件" required validateStatus={fileError ? 'error' : undefined} help={fileError}>
                    <FilePicker
                      file={file}
                      extension="zip"
                      disabled={action.busy}
                      onChange={(next) => { setFile(next); setFileError(undefined); setCandidate(null); }}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'remote',
                label: '远程地址',
                disabled: action.busy,
                children: source === 'remote' && (
                  <Form.Item
                    name="manifestUrl"
                    label="plugin.json 地址"
                    rules={[
                      { required: true, whitespace: true, message: '请输入插件清单地址。' },
                      { max: 2048, message: '地址不能超过 2048 个字符。' },
                      {
                        validator: (_, value: string | undefined) => !value || normalizeHttpUrl(value)
                          ? Promise.resolve()
                          : Promise.reject(new Error('请输入不含账号密码的 HTTP 或 HTTPS 地址。')),
                      },
                    ]}
                  >
                    <Input type="url" autoComplete="url" placeholder="https://example.com/plugin.json" maxLength={2048} />
                  </Form.Item>
                ),
              },
            ]}
          />
          <Form.Item
            name="trusted"
            valuePropName="checked"
            rules={[{
              validator: (_, value: boolean) => value
                ? Promise.resolve()
                : Promise.reject(new Error('请先确认您了解第三方代码及权限风险。')),
            }]}
          >
            <Checkbox>我信任此来源，理解第三方代码及权限风险</Checkbox>
          </Form.Item>
          <ActionError error={action.error} />
        </Form>
      </div>
    </Modal>
  );
}

export default function Plugins() {
  const resource = useResource<PluginInfo[]>('/api/plugins');
  const action = useSystemAction();
  const [installOpen, setInstallOpen] = useState(false);
  const { builtin, external } = groupPlugins(resource.data ?? []);
  const activities = builtin.flatMap((plugin) => plugin.activities.map((activity) => ({ plugin, activity })));
  const disabled = action.busy || resource.loading;

  return (
    <div className="system-page">
      {action.feedback}
      <PageTitle
        title="活动插件"
        subtitle="内置活动与家庭扩展"
        extra={
          <div className="system-actions">
            <Button icon={<ReloadOutlined />} loading={resource.loading} disabled={action.busy} onClick={() => resource.reload()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={disabled} onClick={() => setInstallOpen(true)}>
              添加插件
            </Button>
          </div>
        }
      />
      <div className="stacked">
        <ActionError error={action.error} />
        <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload}>
          <section className="page-section" aria-labelledby="builtin-plugins-title">
            <div className="system-section-heading">
              <h2 id="builtin-plugins-title"><AppstoreOutlined /> 内置活动</h2>
              <Tag color="blue">{activities.length} 种活动</Tag>
            </div>
            {activities.length ? (
              <div className="system-builtin-grid">
                {activities.map(({ plugin, activity }) => (
                  <article className="system-builtin" key={`${plugin.id}:${activity.type}`}>
                    <h3 className="system-wrap">{activity.name.zh}</h3>
                    <p className="muted system-wrap">{activity.type}</p>
                    {activity.ageRange && (
                      <p className="muted">{formatAge(activity.ageRange[0])}至{formatAge(activity.ageRange[1])}</p>
                    )}
                    <Tag color={plugin.enabled ? 'success' : 'default'}>{plugin.enabled ? '已启用' : '未启用'}</Tag>
                    {!!plugin.errors?.length && <p className="system-wrap">{plugin.errors.join('；')}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                description="暂未读取到内置活动，请刷新重试。"
                action={<Button icon={<ReloadOutlined />} onClick={() => resource.reload()}>刷新</Button>}
              />
            )}
          </section>
          <section className="page-section stacked" aria-labelledby="external-plugins-title">
            <div className="system-section-heading">
              <h2 id="external-plugins-title">第三方插件</h2>
              <Tag>{external.length} 个插件</Tag>
            </div>
            <Alert type="warning" showIcon title="第三方插件权限风险" description={TRUST_WARNING} />
            {external.length ? (
              <div className="item-grid">
                {external.map((plugin) => {
                  const entry = plugin.entryUrl ? normalizeHttpUrl(plugin.entryUrl) : undefined;
                  return (
                    <article className="system-item" key={plugin.id}>
                      <div className="system-item-header">
                        <div>
                          <h3 className="system-wrap">{plugin.name.zh}</h3>
                          <p className="muted system-wrap">{plugin.id} · v{plugin.version}</p>
                        </div>
                        <ConfirmedSwitch
                          label={`${plugin.enabled ? '停用' : '启用'}插件 ${plugin.name.zh}`}
                          checked={plugin.enabled}
                          disabled={disabled}
                          loading={action.pending === `toggle:${plugin.id}`}
                          confirmEnable
                          title={`${plugin.enabled ? '停用' : '启用'}「${plugin.name.zh}」？`}
                          description={plugin.enabled
                            ? '依赖此插件的课程步骤将无法使用，已有学习记录不会因此删除。'
                            : <><p>请确认来源可信，并核对权限：</p><Permissions permissions={plugin.permissions} details /></>}
                          onChange={(enabled) => action.run(`toggle:${plugin.id}`, async () => {
                            await api.put(`/api/plugins/${encodeURIComponent(plugin.id)}`, { enabled });
                            resource.reload();
                          }, enabled ? '插件已启用。' : '插件已停用。')}
                        />
                      </div>
                      <Tag color={plugin.source === 'remote' ? 'orange' : 'default'}>
                        {plugin.source === 'remote' ? '远程插件' : '本地安装'}
                      </Tag>
                      {plugin.description?.zh && <p className="system-wrap">{plugin.description.zh}</p>}
                      {plugin.entryUrl && (
                        <p className="muted system-wrap">
                          入口：{entry
                            ? <a href={entry} target="_blank" rel="noopener noreferrer">{entry}</a>
                            : plugin.entryUrl}
                        </p>
                      )}
                      <Permissions permissions={plugin.permissions} />
                      {!!plugin.permissions.length && (
                        <details><summary>权限风险详情</summary><Permissions permissions={plugin.permissions} details /></details>
                      )}
                      <ul className="system-activity-list">
                        {plugin.activities.map((activity) => (
                          <li key={activity.type}>
                            <strong className="system-wrap">{activity.name.zh}</strong>
                            <div className="muted system-wrap">{activity.type}</div>
                            {activity.ageRange && <div className="muted">{formatAge(activity.ageRange[0])}至{formatAge(activity.ageRange[1])}</div>}
                          </li>
                        ))}
                      </ul>
                      {!!plugin.errors?.length && (
                        <Alert
                          type="error"
                          showIcon
                          title="插件加载问题"
                          description={<ul>{plugin.errors.map((error, index) => <li key={index} className="system-wrap">{error}</li>)}</ul>}
                        />
                      )}
                      <div className="system-actions">
                        <Popconfirm
                          title={`删除「${plugin.name.zh}」？`}
                          description={<div className="system-confirm-copy">此操作不可撤销。依赖该插件的课程步骤将无法使用，重新使用前需再次安装。</div>}
                          okText="删除插件"
                          cancelText="取消"
                          okButtonProps={{ danger: true, loading: action.pending === `delete:${plugin.id}` }}
                          onConfirm={() => action.run(`delete:${plugin.id}`, async () => {
                            await api.delete(`/api/plugins/${encodeURIComponent(plugin.id)}`);
                            resource.reload();
                          }, '插件已删除。')}
                        >
                          <Button danger icon={<DeleteOutlined />} disabled={disabled}>删除插件</Button>
                        </Popconfirm>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                description="还没有第三方插件，内置活动仍可正常使用。"
                action={<Button icon={<PlusOutlined />} onClick={() => setInstallOpen(true)}>添加插件</Button>}
              />
            )}
          </section>
        </ResourceState>
      </div>
      {installOpen && <InstallPlugin onClose={() => setInstallOpen(false)} onInstalled={() => resource.reload()} />}
    </div>
  );
}
