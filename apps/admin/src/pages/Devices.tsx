import { useId, useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { DeviceInfo } from '@sprout/schema';
import { useFamily } from '../context';
import { api } from '../lib/api';
import { useResource } from '../lib/hooks';
import { EmptyState, PageTitle, ResourceState } from '../components/ui';
import { ActionError, useSystemAction } from '../features/system/shared';
import { formatLastSeen, isLoopbackAddress, playerAddress } from '../features/system/helpers';
import type { SystemSettings } from '../features/system/types';
import { deviceAccessBody, deviceDraft, type DeviceDraft } from '../features/system/device-access';
import '../features/system/system.css';

const KIND_LABELS: Record<string, string> = { tv: '电视', tablet: '平板', browser: '浏览器' };

function DeviceEditor({ device, onClose, onSaved }: {
  device?: DeviceInfo; onClose: () => void; onSaved: () => void;
}) {
  const family = useFamily();
  const [form] = Form.useForm<DeviceDraft>();
  const [candidate, setCandidate] = useState<DeviceDraft | null>(null);
  const [paired, setPaired] = useState<DeviceInfo | null>(null);
  const formId = useId();
  const action = useSystemAction();
  const defaults = deviceDraft(device, family.childId);
  const allChildren = Form.useWatch('allChildren', form) ?? defaults.allChildren;
  const allowedChildIds: string[] = Form.useWatch('allowedChildIds', form) ?? defaults.allowedChildIds;
  const boundChildId: string = Form.useWatch('childId', form) ?? defaults.childId;
  const childOptions = [
    { value: '', label: '暂不绑定孩子' },
    ...family.children.map((child) => ({
      value: child.id, label: child.nickname || child.name,
      disabled: !allChildren && !allowedChildIds.includes(child.id),
    })),
  ];
  if (device?.childId && !family.children.some((child) => child.id === device.childId)) {
    childOptions.push({ value: device.childId, label: '当前绑定档案暂不可用' });
  }
  const permissionOptions = family.children.map((child) => ({
    value: child.id, label: child.nickname || child.name,
  }));
  for (const id of allowedChildIds) {
    if (!permissionOptions.some((option) => option.value === id)) {
      permissionOptions.push({ value: id, label: `档案暂不可用：${id}` });
    }
  }

  function close() {
    if (paired) onSaved();
    onClose();
  }

  async function save() {
    if (!candidate) return;
    const selected = candidate;
    const success = await action.run('save', async () => {
      const body = deviceAccessBody(selected);
      let target = device ?? paired;
      if (!target) {
        target = await api.post<DeviceInfo>('/api/pair/approve', {
          name: body.name, childId: body.childId, code: selected.code?.trim(),
        });
        // 配对成功后保存范围失败时，重试只更新该设备，不消耗第二次配对码。
        setPaired(target);
      }
      await api.put<DeviceInfo>(`/api/devices/${encodeURIComponent(target.id)}`, body);
    },
    device ? '设备信息已更新。' : '配对已确认，请保持播放端打开。');
    setCandidate(null);
    if (success) { onSaved(); onClose(); }
  }

  return (
    <Modal
      open
      title={device ? '编辑设备' : paired ? '设置已配对设备' : '添加播放设备'}
      className="system-dialog"
      onCancel={() => { if (!action.busy) close(); }}
      keyboard={!action.busy}
      closable={!action.busy}
      maskClosable={!action.busy}
      footer={[
        <Button key="cancel" disabled={action.busy} onClick={close}>取消</Button>,
        <Popconfirm
          key="save"
          open={!!candidate}
          trigger={[]}
          onOpenChange={(open) => { if (!open && !action.busy) setCandidate(null); }}
          title={device ? '确认更新设备信息？' : '确认配对此设备？'}
          description={
            <div className="system-confirm-copy">
              {device
                ? '改绑后，设备将使用新孩子的课程计划和屏幕设置；解除绑定后需要重新选择孩子。'
                : '请核对配对码来自您自己的电视或平板，配对后设备将可以访问家庭课程与绑定孩子的信息。'}
              <p>允许范围：{candidate?.allChildren ? '全部孩子（含以后添加的档案）' :
                candidate?.allowedChildIds.map((id) => family.children.find((child) => child.id === id)?.name ?? id).join('、') || '不允许任何孩子'}。</p>
            </div>
          }
          okText={device ? '确认保存' : '确认配对'}
          cancelText="取消"
          okButtonProps={{ loading: action.busy }}
          cancelButtonProps={{ disabled: action.busy }}
          onCancel={() => setCandidate(null)}
          onConfirm={save}
        >
          <Button type="primary" icon={device || paired ? <EditOutlined /> : <LinkOutlined />} form={formId} htmlType="submit"
            loading={action.busy} disabled={family.loading}>
            {device || paired ? '保存' : '配对设备'}
          </Button>
        </Popconfirm>,
      ]}
    >
      {action.feedback}
      <Form
        id={formId}
        form={form}
        layout="vertical"
        noValidate
        disabled={action.busy}
        initialValues={defaults}
        onValuesChange={() => setCandidate(null)}
        onFinish={setCandidate}
      >
        {!device && !paired && (
          <>
            <Alert type="info" showIcon title="配对码有效期为 10 分钟" description="请在播放端打开配对页，并在这里输入它显示的 6 位数字。" />
            <Form.Item
              name="code"
              label="6 位配对码"
              rules={[
                { required: true, message: '请输入播放端显示的配对码。' },
                { pattern: /^\d{6}$/, message: '配对码应为 6 位数字。', transform: (value: string) => value?.trim() },
              ]}
            >
              <Input inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="000000" autoFocus />
            </Form.Item>
          </>
        )}
        <Form.Item
          name="name"
          label="设备名称"
          rules={[
            { required: true, whitespace: true, message: '请输入设备名称。' },
            { max: 80, message: '设备名称不能超过 80 个字符。' },
          ]}
        >
          <Input maxLength={80} placeholder="例如：客厅电视" autoFocus={!!device} autoComplete="off" />
        </Form.Item>
        {paired && <Alert type="info" showIcon title="设备已经配对"
          description="孩子访问范围尚未保存，请重试保存；不会再次提交配对码。" />}
        <Form.Item name="allChildren" valuePropName="checked" label="允许的孩子">
          <Checkbox disabled={family.loading}>允许全部孩子（含以后添加的档案）</Checkbox>
        </Form.Item>
        <Form.Item name="allowedChildIds" hidden={allChildren}>
          <Checkbox.Group className="system-child-permissions" options={permissionOptions}
            disabled={action.busy || family.loading} />
        </Form.Item>
        {!allChildren && !allowedChildIds.length && <Alert type="warning" showIcon title="尚未允许任何孩子"
          description="此设备将不能切换到孩子或上报学习记录。" />}
        <Form.Item name="childId" label="绑定孩子" dependencies={['allChildren', 'allowedChildIds']} rules={[{
          validator: (_, value: string) => !value || form.getFieldValue('allChildren') ||
            (form.getFieldValue('allowedChildIds') as string[] ?? []).includes(value)
            ? Promise.resolve() : Promise.reject(new Error('绑定孩子必须在允许范围内，请勾选该孩子或解除绑定。')),
        }]}>
          <Select
            options={childOptions}
            loading={family.loading}
            disabled={action.busy || family.loading}
            showSearch={{ optionFilterProp: 'label' }}
            notFoundContent="没有匹配的孩子档案"
          />
        </Form.Item>
        {!allChildren && boundChildId && !allowedChildIds.includes(boundChildId) &&
          <Alert type="warning" showIcon title="绑定孩子不在允许范围内" description="请重新勾选该孩子，或选择暂不绑定孩子后保存。" />}
        {!family.loading && !family.children.length && (
          <Alert type="info" showIcon title="尚未添加孩子档案" description="可以先完成配对，添加孩子档案后再绑定。" />
        )}
        <ActionError error={action.error} />
      </Form>
    </Modal>
  );
}

export default function Devices() {
  const resource = useResource<DeviceInfo[]>('/api/devices');
  const settings = useResource<SystemSettings>('/api/settings');
  const family = useFamily();
  const action = useSystemAction();
  const [editor, setEditor] = useState<DeviceInfo | 'new' | null>(null);
  const address = playerAddress(settings.data?.serverUrlHint, window.location.origin);
  const disabled = action.busy || resource.loading;

  function childName(device: DeviceInfo) {
    if (!device.childId) return '未绑定';
    const child = family.children.find((item) => item.id === device.childId);
    return child ? child.nickname || child.name : family.loading ? '正在读取档案…' : '绑定档案暂不可用';
  }
  function allowedNames(device: DeviceInfo) {
    if (device.allowedChildIds === null) return '全部孩子';
    if (device.allowedChildIds === undefined) return '尚未设置';
    return device.allowedChildIds.map((id) => {
      const child = family.children.find((item) => item.id === id);
      return child ? child.nickname || child.name : '档案暂不可用';
    }).join('、') || '不允许任何孩子';
  }

  function controls(device: DeviceInfo) {
    return (
      <div className="system-actions">
        <Button icon={<EditOutlined />} disabled={disabled} onClick={() => setEditor(device)} aria-label={`编辑设备 ${device.name}`}>
          编辑设备
        </Button>
        <Popconfirm
          title={`吊销「${device.name}」？`}
          description={<div className="system-confirm-copy">此设备的访问令牌将失效，需要重新配对才能再次连接。已有学习记录不会删除。</div>}
          okText="确认吊销"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: action.pending === device.id }}
          onConfirm={() => action.run(device.id, async () => {
            await api.delete(`/api/devices/${encodeURIComponent(device.id)}`);
            resource.reload();
          }, '设备访问权限已吊销。')}
        >
          <Button danger icon={<DeleteOutlined />} disabled={disabled} loading={action.pending === device.id} aria-label={`吊销设备 ${device.name}`}>
            吊销
          </Button>
        </Popconfirm>
      </div>
    );
  }

  return (
    <div className="system-page">
      {action.feedback}
      <PageTitle
        title="播放设备"
        subtitle="管理家中的电视、平板与浏览器"
        extra={
          <div className="system-actions">
            <Button icon={<ReloadOutlined />} loading={resource.loading} disabled={action.busy} onClick={() => resource.reload()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={disabled} onClick={() => setEditor('new')}>添加设备</Button>
          </div>
        }
      />
      <section className="page-section stacked" aria-label="已配对设备">
        <ActionError error={action.error} />
        <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload}>
          {resource.data?.length ? (
            <>
              <div className="safe-table system-desktop-devices">
                <Table<DeviceInfo>
                  rowKey="id"
                  dataSource={resource.data}
                  pagination={false}
                  scroll={{ x: 820 }}
                  columns={[
                    {
                      title: '设备', key: 'name',
                      render: (_, device) => <div><strong className="system-wrap">{device.name}</strong><div className="muted">{Object.hasOwn(KIND_LABELS, device.kind) ? KIND_LABELS[device.kind] : device.kind}</div></div>,
                    },
                    { title: '绑定孩子', key: 'child', render: (_, device) => <Tag color={device.childId ? 'green' : 'default'}>{childName(device)}</Tag> },
                    { title: '允许的孩子', key: 'allowed', render: (_, device) => <span className="system-wrap">{allowedNames(device)}</span> },
                    { title: '最后在线', dataIndex: 'lastSeenAt', render: (value: string | null) => formatLastSeen(value) },
                    { title: '操作', key: 'actions', width: 260, render: (_, device) => controls(device) },
                  ]}
                />
              </div>
              <div className="item-grid system-mobile-devices">
                {resource.data.map((device) => (
                  <article className="system-item" key={device.id}>
                    <div className="system-item-header">
                      <h3 className="system-wrap">{device.name}</h3>
                      <Tag>{Object.hasOwn(KIND_LABELS, device.kind) ? KIND_LABELS[device.kind] : device.kind}</Tag>
                    </div>
                    <dl className="system-metadata">
                      <div><dt>绑定孩子</dt><dd>{childName(device)}</dd></div>
                      <div><dt>允许的孩子</dt><dd>{allowedNames(device)}</dd></div>
                      <div><dt>最后在线</dt><dd>{formatLastSeen(device.lastSeenAt)}</dd></div>
                    </dl>
                    {controls(device)}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              description="还没有配对设备，在电视或 iPad 上打开播放端后即可添加。"
              action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor('new')}>添加设备</Button>}
            />
          )}
        </ResourceState>
      </section>
      <section className="page-section stacked" aria-labelledby="device-lan-title">
        <h2 id="device-lan-title">在电视或 iPad 上打开播放端</h2>
        {settings.loading ? <p className="muted" role="status">正在读取局域网地址…</p> : (
          <>
            {settings.error && (
              <Alert
                type="warning"
                showIcon
                title="未能读取服务器地址，暂时显示当前网站地址"
                description={settings.error.message}
                action={<Button icon={<ReloadOutlined />} onClick={() => settings.reload()}>重试</Button>}
              />
            )}
            <Typography.Paragraph
              className="system-lan-address"
              copyable={{ text: address, tooltips: ['复制播放地址', '已复制'] }}
            >
              <a href={address} target="_blank" rel="noopener noreferrer">{address}</a>
            </Typography.Paragraph>
            {isLoopbackAddress(address) && (
              <Alert
                type="warning"
                showIcon
                title="当前地址仅能在这台电脑上访问"
                description="请在家庭设置中填写运行服务器的电脑或 NAS 的局域网地址，例如 http://192.168.1.20:4310/。电视上不能使用 localhost。"
              />
            )}
          </>
        )}
        <ol className="system-steps">
          <li>让电视或 iPad 与运行芽芽服务器的电脑、NAS 连接到同一个家庭网络。</li>
          <li>在电视浏览器或 iPad 的 Safari 中打开上面的播放地址；iPad 可通过分享菜单添加到主屏幕。</li>
          <li>在播放端打开设备配对，回到这里输入 6 位配对码，并选择绑定的孩子。</li>
          <li>连接失败时，请确认服务器仍在运行、端口可访问，且路由器未开启访客网络隔离。</li>
        </ol>
        <p className="muted">播放地址不要带 /admin。请勿把家庭服务器直接暴露到公共网络。</p>
      </section>
      {editor && (
        <DeviceEditor
          device={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => resource.reload()}
        />
      )}
    </div>
  );
}
