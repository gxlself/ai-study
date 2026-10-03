import { useId, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Switch, Tabs, Tag } from 'antd';
import { AppstoreOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { PluginInfo } from '@sprout/schema';
import { api } from '../lib/api';
import { useResource } from '../lib/hooks';
import { formatAge } from '../lib/format';
import { EmptyState, PageTitle, ResourceState } from '../components/ui';
import {
  ActionError, ConfirmedSwitch, FilePicker, Permissions, useSystemAction,
} from '../features/system/shared';
import { groupPlugins, normalizeHttpUrl } from '../features/system/helpers';
import PluginTrustDialog from '../features/system/PluginTrustDialog';
import {
  inspectPluginZip, inspectRemotePlugin, matchesPluginReview, pluginEntryUrl, pluginSourceUrl,
  PLUGIN_TRUST_WARNING, samePluginDeclaration, type PluginReview,
} from '../features/system/plugin-review';
import '../features/system/system.css';

const TRUST_WARNING = `${PLUGIN_TRUST_WARNING}。权限声明不等于安全审核或隔离保护。`;

function InstallPlugin({ onClose, onInstalled }: { onClose: () => void; onInstalled: () => void }) {
  const [source, setSource] = useState<'zip' | 'remote'>('zip');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [candidate, setCandidate] = useState<{
    source: 'zip' | 'remote'; file: File | null; manifestUrl?: string; review: PluginReview;
  } | null>(null);
  const [form] = Form.useForm<{ manifestUrl?: string }>();
  const formId = useId();
  const action = useSystemAction();

  async function install() {
    if (!candidate) return;
    const selected = candidate;
    const success = await action.run('install', async () => {
      const plugin = selected.source === 'zip' && selected.file
        ? await api.upload<PluginInfo>('/api/plugins/install', selected.file)
        : await api.post<PluginInfo>('/api/plugins/remote', { manifestUrl: selected.manifestUrl });
      onInstalled();
      if (!matchesPluginReview(plugin, selected.review, location.origin)) {
        try { await api.put(`/api/plugins/${encodeURIComponent(plugin.id)}`, { enabled: false }); }
        catch {
          throw new Error('服务端清单与确认内容不同，而且自动停用失败。请立即停用此插件并检查播放设备。');
        }
        onInstalled();
        throw new Error('服务端返回的权限或入口与刚才确认的清单不同，插件已停用，请刷新后重新核对。');
      }
    }, '插件已安装。');
    if (success) { onInstalled(); onClose(); }
  }

  async function inspect(values: { manifestUrl?: string }) {
    if (source === 'zip' && !file) { setFileError('请选择插件 ZIP 压缩包。'); return; }
    await action.run('inspect', async () => {
      if (source === 'zip' && file && file.size > 50 * 1024 * 1024) throw new Error('插件 ZIP 不能超过 50 MB。');
      const manifestUrl = values.manifestUrl ? normalizeHttpUrl(values.manifestUrl) : undefined;
      const review = source === 'zip' && file
        ? inspectPluginZip(new Uint8Array(await file.arrayBuffer()), file.name, location.origin)
        : await inspectRemotePlugin(manifestUrl ?? '');
      setCandidate({ source, file, manifestUrl, review });
    });
  }

  return (
    <>
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
        <Button key="inspect" type="primary" icon={<EyeOutlined />} form={formId} htmlType="submit"
          loading={action.pending === 'inspect'} disabled={action.busy || !!candidate}>查看权限</Button>,
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
          disabled={action.busy || !!candidate}
          onValuesChange={() => setCandidate(null)}
          onFinish={(values) => void inspect(values)}
        >
          <Tabs
            activeKey={source}
            onChange={(key) => {
              setSource(key as typeof source);
              setCandidate(null);
              action.clearError();
            }}
            items={[
              {
                key: 'zip',
                label: '上传 ZIP',
                disabled: action.busy || !!candidate,
                children: source === 'zip' && (
                  <Form.Item label="插件文件" required validateStatus={fileError ? 'error' : undefined} help={fileError}>
                    <FilePicker
                      file={file}
                      extension="zip"
                      disabled={action.busy || !!candidate}
                      onChange={(next) => { setFile(next); setFileError(undefined); setCandidate(null); }}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'remote',
                label: '远程地址',
                disabled: action.busy || !!candidate,
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
          <ActionError error={action.error} />
        </Form>
      </div>
    </Modal>
    {candidate && <PluginTrustDialog
      plugin={candidate.review.manifest} sourceUrl={candidate.review.sourceUrl} entryUrl={candidate.review.entryUrl}
      operation="安装" busy={action.busy} error={action.error}
      onCancel={() => { setCandidate(null); action.clearError(); }} onConfirm={() => void install()} />}
    </>
  );
}

export default function Plugins() {
  const resource = useResource<PluginInfo[]>('/api/plugins');
  const action = useSystemAction();
  const [installOpen, setInstallOpen] = useState(false);
  const [enablePlugin, setEnablePlugin] = useState<PluginInfo | null>(null);
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
                        {plugin.enabled ? <ConfirmedSwitch
                          label={`${plugin.enabled ? '停用' : '启用'}插件 ${plugin.name.zh}`}
                          checked={plugin.enabled}
                          disabled={disabled}
                          loading={action.pending === `toggle:${plugin.id}`}
                          title={`停用「${plugin.name.zh}」？`}
                          description="依赖此插件的课程步骤将无法使用，已有学习记录不会因此删除。"
                          onChange={(enabled) => action.run(`toggle:${plugin.id}`, async () => {
                            await api.put(`/api/plugins/${encodeURIComponent(plugin.id)}`, { enabled });
                            resource.reload();
                          }, enabled ? '插件已启用。' : '插件已停用。')}
                        /> : <Switch checked={false} disabled={disabled}
                          aria-label={`启用插件 ${plugin.name.zh}`} checkedChildren="启用" unCheckedChildren="停用"
                          onChange={() => { action.clearError(); setEnablePlugin(plugin); }} />}
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
      {enablePlugin && <PluginTrustDialog plugin={enablePlugin}
        sourceUrl={pluginSourceUrl(enablePlugin, location.origin)}
        entryUrl={pluginEntryUrl(enablePlugin.entryUrl, location.origin)}
        operation="启用" busy={action.busy} error={action.error}
        onCancel={() => { setEnablePlugin(null); action.clearError(); }}
        onConfirm={() => void action.run(`toggle:${enablePlugin.id}`, async () => {
          const latest = (await api.get<PluginInfo[]>('/api/plugins')).find((plugin) => plugin.id === enablePlugin.id);
          if (!latest) throw new Error('插件已不存在，请关闭确认框并刷新。');
          if (!samePluginDeclaration(enablePlugin, latest, location.origin)) {
            setEnablePlugin(latest);
            resource.reload();
            throw new Error('插件来源或权限已变化，请重新核对并勾选确认。');
          }
          await api.put(`/api/plugins/${encodeURIComponent(enablePlugin.id)}`, { enabled: true });
          resource.reload();
          setEnablePlugin(null);
        }, '插件已启用。')} />}
    </div>
  );
}
