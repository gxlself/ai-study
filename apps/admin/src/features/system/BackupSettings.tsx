import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Modal, Popconfirm } from 'antd';
import { DownloadOutlined, ImportOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { errorMessage, parseBackup } from './helpers';
import { ActionError, FilePicker } from './shared';
import type { SystemAction } from './shared';

interface RestoreResult {
  ok?: boolean;
  devicesRequirePairing?: boolean;
}

function backupFilename() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `sprout-backup-${date}.json`;
}

function RestoreBackup({ action, onClose, onRestored }: {
  action: SystemAction; onClose: () => void; onRestored: (result: RestoreResult | undefined) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [validation, setValidation] = useState<{ state: 'empty' | 'loading' | 'ready' | 'error'; error?: string }>({ state: 'empty' });

  useEffect(() => {
    if (!file) { setValidation({ state: 'empty' }); return; }
    let active = true;
    setValidation({ state: 'loading' });
    void file.text().then((text) => {
      parseBackup(text);
      if (active) setValidation({ state: 'ready' });
    }).catch((error: unknown) => {
      if (active) setValidation({ state: 'error', error: errorMessage(error) });
    });
    return () => { active = false; };
  }, [file]);

  const canRestore = !!file && acknowledged && validation.state === 'ready' && !action.busy;
  return (
    <Modal
      open
      title="从备份恢复"
      className="system-dialog"
      onCancel={() => { if (!action.busy) onClose(); }}
      closable={!action.busy}
      keyboard={!action.busy}
      maskClosable={!action.busy}
      footer={[
        <Button key="cancel" disabled={action.busy} onClick={onClose}>取消</Button>,
        <Popconfirm
          key="restore"
          title="覆盖恢复家庭数据？"
          description={<div className="system-confirm-copy">现有孩子档案、学习记录、观察记录、设备信息、设置和自定义内容将被备份覆盖。此操作无法撤销。</div>}
          okText="确认覆盖恢复"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: action.pending === 'backup-restore' }}
          cancelButtonProps={{ disabled: action.busy }}
          disabled={!canRestore}
          onConfirm={async () => {
            if (!file || !canRestore) return;
            let result: RestoreResult | undefined;
            const success = await action.run('backup-restore', async () => {
              result = await api.upload<RestoreResult>('/api/backup/restore', file);
            }, '备份已恢复，请核对孩子档案和设备绑定。');
            if (success) { onClose(); onRestored(result); }
          }}
        >
          <Button danger type="primary" icon={<ImportOutlined />} disabled={!canRestore} loading={action.pending === 'backup-restore'}>
            覆盖恢复
          </Button>
        </Popconfirm>,
      ]}
    >
      <div className="stacked">
        <Alert
          type="warning"
          showIcon
          title="恢复会覆盖当前家庭数据"
          description="请先下载当前备份并妥善保存。恢复后播放设备需要重新配对。备份含家庭隐私信息，仅恢复您信任的文件。"
        />
        <div>
          <Button
            icon={<DownloadOutlined />}
            disabled={action.busy}
            loading={action.pending === 'backup-download'}
            onClick={() => void action.run('backup-download', () => api.download('/api/backup', backupFilename()), '当前备份已下载。')}
          >
            先下载当前备份
          </Button>
        </div>
        <FilePicker
          file={file}
          extension="json"
          disabled={action.busy}
          onChange={(next) => {
            setFile(next);
            setAcknowledged(false);
            setValidation({ state: next ? 'loading' : 'empty' });
            action.clearError();
          }}
        />
        {validation.state === 'loading' && <p role="status">正在检查备份文件…</p>}
        {validation.state === 'error' && <Alert type="error" showIcon title="备份格式不正确" description={validation.error} role="alert" />}
        {validation.state === 'ready' && <Alert type="info" showIcon title="JSON 格式有效" description="服务器将在恢复前继续校验备份结构。" />}
        <Checkbox checked={acknowledged} disabled={action.busy} onChange={(event) => setAcknowledged(event.target.checked)}>
          我理解恢复会覆盖当前数据，且已保留需要的备份
        </Checkbox>
        <ActionError error={action.lastKey?.startsWith('backup-') ? action.error : null} />
      </div>
    </Modal>
  );
}

export function BackupSettings({ action, onRestored }: { action: SystemAction; onRestored: () => void }) {
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restored, setRestored] = useState<{ devicesRequirePairing: boolean } | null>(null);
  return (
    <section className="page-section stacked" aria-labelledby="backup-settings-title">
      <h2 id="backup-settings-title">备份与恢复</h2>
      <p className="muted">
        JSON 备份包含孩子档案、学习记录、里程碑观察、设备信息、家庭设置和自定义课程、词条；不包含设备访问令牌，也不包含照片、音频等媒体文件。请同时保留内容包及服务器 <code>data/custom</code> 素材目录的副本。
      </p>
      <div className="system-actions">
        <Button
          icon={<DownloadOutlined />}
          disabled={action.busy}
          loading={action.pending === 'backup-download'}
          onClick={() => void action.run('backup-download', () => api.download('/api/backup', backupFilename()), '备份已下载，请妥善保管。')}
        >
          下载备份
        </Button>
        <Button
          danger
          icon={<ImportOutlined />}
          disabled={action.busy}
          onClick={() => { action.clearError(); setRestoreOpen(true); }}
        >
          从备份恢复
        </Button>
      </div>
      {!restoreOpen && <ActionError error={action.lastKey?.startsWith('backup-') ? action.error : null} />}
      {restored && (
        <Alert
          type="success"
          showIcon
          title="家庭数据已恢复"
          description={restored.devicesRequirePairing
            ? '原有设备访问令牌已失效，请在播放设备页重新配对电视或平板。'
            : '请核对孩子档案和设备绑定，必要时重新配对播放设备。'}
        />
      )}
      {restoreOpen && (
        <RestoreBackup
          action={action}
          onClose={() => setRestoreOpen(false)}
          onRestored={(result) => { setRestored({ devicesRequirePairing: result?.devicesRequirePairing === true }); onRestored(); }}
        />
      )}
    </section>
  );
}
