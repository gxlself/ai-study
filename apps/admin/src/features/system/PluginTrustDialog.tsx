import { useState } from 'react';
import { Alert, Button, Checkbox, Modal } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import type { PluginInfo } from '@sprout/schema';
import { ActionError, Permissions } from './shared';
import { PLUGIN_TRUST_WARNING } from './plugin-review';

export default function PluginTrustDialog({
  plugin, sourceUrl, entryUrl, operation, busy, error, onCancel, onConfirm,
}: {
  plugin: Pick<PluginInfo, 'id' | 'name' | 'version' | 'permissions'>;
  sourceUrl: string;
  entryUrl?: string;
  operation: '安装' | '启用';
  busy: boolean;
  error?: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [trustedFor, setTrustedFor] = useState<string | null>(null);
  const key = JSON.stringify([plugin.id, plugin.version, sourceUrl, entryUrl, plugin.permissions]);
  const trusted = trustedFor === key;
  return <Modal open title={`${operation}「${plugin.name.zh}」？`} className="system-dialog"
    onCancel={() => { if (!busy) onCancel(); }} closable={!busy} keyboard={!busy} maskClosable={!busy}
    footer={[
      <Button key="cancel" disabled={busy} onClick={onCancel}>取消</Button>,
      <Button key="confirm" type="primary" icon={<SafetyCertificateOutlined />} loading={busy}
        disabled={!trusted || !entryUrl} onClick={() => { if (trusted && entryUrl && !busy) onConfirm(); }}>
        {`信任并${operation}`}
      </Button>,
    ]}>
    <div className="stacked">
      <Alert type="warning" showIcon title={PLUGIN_TRUST_WARNING}
        description="权限只是作者声明，不是运行时隔离或安全审核；插件可能读取播放端的页面与本地凭据。" />
      <dl className="system-metadata">
        <div><dt>插件</dt><dd>{plugin.id} · v{plugin.version}</dd></div>
        <div><dt>来源</dt><dd>{sourceUrl}</dd></div>
        <div className="system-metadata-wide"><dt>来源入口 URL</dt><dd>{entryUrl ?? '服务端未提供有效入口，无法核实来源。'}</dd></div>
      </dl>
      <section aria-label="声明的权限">
        <h3>声明的权限</h3>
        <Permissions permissions={plugin.permissions} details />
      </section>
      <Checkbox checked={trusted} disabled={busy}
        onChange={(event) => setTrustedFor(event.target.checked ? key : null)}>
        我已核对来源和权限，信任此插件
      </Checkbox>
      <ActionError error={error} />
    </div>
  </Modal>;
}
