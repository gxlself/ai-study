import { useState } from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useFamily } from '../context';
import { useResource } from '../lib/hooks';
import { PageTitle, ResourceState } from '../components/ui';
import { AboutSettings } from '../features/system/AboutSettings';
import { BackupSettings } from '../features/system/BackupSettings';
import { FamilySettings, PasswordSettings } from '../features/system/FamilySettings';
import { TtsSettings } from '../features/system/TtsSettings';
import { useSystemAction } from '../features/system/shared';
import type { SystemSettings } from '../features/system/types';
import '../features/system/system.css';

export default function Settings() {
  const resource = useResource<SystemSettings>('/api/settings');
  const { refreshChildren } = useFamily();
  const action = useSystemAction();
  const [saved, setSaved] = useState<Partial<SystemSettings>>({});
  const [refreshError, setRefreshError] = useState(false);
  const settings = resource.data ? { ...resource.data, ...saved } : undefined;
  const onSaved = (patch: Partial<SystemSettings>) => setSaved((previous) => ({ ...previous, ...patch }));

  async function afterRestore() {
    setSaved({});
    resource.reload();
    try { await refreshChildren(); setRefreshError(false); }
    catch { setRefreshError(true); }
  }

  return (
    <div className="system-page">
      {action.feedback}
      <PageTitle title="家庭设置" subtitle="声音、安全与家庭数据" />
      {refreshError && (
        <Alert
          type="warning"
          showIcon
          title="备份已恢复，孩子档案需要重新加载"
          action={<Button icon={<ReloadOutlined />} onClick={() => void afterRestore()}>重新加载</Button>}
        />
      )}
      <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload}>
        {settings && (
          <>
            <FamilySettings settings={settings} action={action} onSaved={onSaved} />
            <TtsSettings settings={settings} action={action} onSaved={onSaved} />
          </>
        )}
      </ResourceState>
      <PasswordSettings action={action} />
      <BackupSettings action={action} onRestored={() => void afterRestore()} />
      <AboutSettings />
    </div>
  );
}
