import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Popconfirm, Switch, Tag, Upload, message } from 'antd';
import { InboxOutlined, LinkOutlined } from '@ant-design/icons';
import type { Credit, ValidationIssue } from '@sprout/schema';
import { errorMessage, fileSelectionError, normalizeHttpUrl, permissionInfo, validationIssues } from './helpers';

export function useSystemAction() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [notice, feedback] = message.useMessage();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function run(key: string, task: () => Promise<unknown>, success?: string): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setPending(key);
    setLastKey(key);
    setError(null);
    try {
      await task();
      if (mounted.current && success) void notice.success(success);
      return true;
    } catch (failure) {
      if (mounted.current) setError(failure);
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setPending(null);
    }
  }

  return { pending, lastKey, busy: pending !== null, error, clearError: () => setError(null), run, feedback };
}

export type SystemAction = ReturnType<typeof useSystemAction>;

export function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return <p className="muted" role="status">未发现校验问题。</p>;
  return (
    <ul className="system-issue-list">
      {issues.map((issue, index) => (
        <li key={`${issue.path}-${index}`}>
          <Tag color={issue.level === 'error' ? 'error' : 'warning'}>
            {issue.level === 'error' ? '错误' : '提醒'}
          </Tag>
          <div>
            <strong className="system-wrap">{issue.path || '内容整体'}</strong>
            <div className="system-wrap">{issue.message}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  const issues = validationIssues(error);
  return (
    <Alert
      type="error"
      showIcon
      title="操作未完成"
      description={
        <div className="system-wrap">
          <div>{errorMessage(error)}</div>
          {issues.length > 0 && <IssueList issues={issues} />}
        </div>
      }
      role="alert"
    />
  );
}

export function CreditsList({ credits }: { credits: Credit[] }) {
  if (!credits.length) return <p className="muted">此内容包尚未提供素材署名。</p>;
  return (
    <ul className="system-credit-list">
      {credits.map((credit, index) => {
        const url = credit.url ? normalizeHttpUrl(credit.url) : undefined;
        return (
          <li key={`${credit.name}-${index}`}>
            <div className="system-inline">
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="system-wrap">
                  {credit.name || '未命名素材'} <LinkOutlined />
                </a>
              ) : <strong className="system-wrap">{credit.name || '未命名素材'}</strong>}
              <Tag>{credit.license || '未声明许可'}</Tag>
            </div>
            {credit.note && <p className="muted system-wrap">{credit.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function Permissions({ permissions, details = false }: { permissions: string[]; details?: boolean }) {
  if (!permissions.length) return <p className="muted">未声明额外权限，不代表已通过安全审核。</p>;
  const unique = [...new Set(permissions)];
  return details ? (
    <ul className="system-permissions">
      {unique.map((permission) => {
        const { label, risk } = permissionInfo(permission);
        return <li key={permission}><Tag color="warning">{label}</Tag><span>{risk}</span></li>;
      })}
    </ul>
  ) : (
    <div className="system-inline">
      {unique.map((permission) => <Tag color="warning" key={permission}>{permissionInfo(permission).label}</Tag>)}
    </div>
  );
}

export function FilePicker({
  file, extension, disabled, onChange,
}: {
  file: File | null;
  extension: 'zip' | 'json';
  disabled?: boolean;
  onChange: (file: File | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stacked">
      <Upload.Dragger
        accept={`.${extension}`}
        multiple={false}
        maxCount={1}
        disabled={disabled}
        fileList={file ? [{ uid: 'system-selected-file', name: file.name, size: file.size }] : []}
        beforeUpload={(candidate) => {
          const issue = fileSelectionError(candidate, extension);
          setError(issue);
          if (issue) {
            onChange(null);
            return Upload.LIST_IGNORE;
          }
          onChange(candidate);
          return false;
        }}
        onRemove={() => { onChange(null); setError(null); return true; }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">{extension === 'zip' ? '选择 ZIP 压缩包' : '选择 JSON 备份文件'}</p>
      </Upload.Dragger>
      {error && <Alert type="error" showIcon title={error} role="alert" />}
    </div>
  );
}

export function ConfirmedSwitch({
  checked, disabled, loading, label, title, description, confirmEnable = false, onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  title: ReactNode;
  description: ReactNode;
  confirmEnable?: boolean;
  onChange: (next: boolean) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popconfirm
      title={title}
      description={<div className="system-confirm-copy">{description}</div>}
      open={open}
      onOpenChange={(next) => { if (!next && !loading) setOpen(false); }}
      onConfirm={async () => { if (await onChange(!checked)) setOpen(false); }}
      onCancel={() => setOpen(false)}
      okText={checked ? '确认停用' : '信任并启用'}
      cancelText="取消"
      okButtonProps={{ danger: checked, loading }}
      cancelButtonProps={{ disabled: loading }}
      trigger={[]}
    >
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        loading={loading}
        checkedChildren="启用"
        unCheckedChildren="停用"
        onChange={(next) => {
          if (!next || confirmEnable) setOpen(true);
          else void onChange(next);
        }}
      />
    </Popconfirm>
  );
}
