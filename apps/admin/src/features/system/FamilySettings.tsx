import { useEffect, useState } from 'react';
import { Button, Form, Input, Popconfirm } from 'antd';
import { LockOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { normalizeHttpUrl } from './helpers';
import { ActionError } from './shared';
import type { SystemAction } from './shared';
import type { SystemSettings } from './types';

export function FamilySettings({ settings, action, onSaved }: {
  settings: SystemSettings; action: SystemAction; onSaved: (patch: Partial<SystemSettings>) => void;
}) {
  const [form] = Form.useForm<Pick<SystemSettings, 'familyName' | 'serverUrlHint'>>();
  useEffect(() => {
    form.setFieldsValue({ familyName: settings.familyName, serverUrlHint: settings.serverUrlHint });
  }, [form, settings.familyName, settings.serverUrlHint]);

  return (
    <section className="page-section" aria-labelledby="family-settings-title">
      <h2 id="family-settings-title">家庭</h2>
      <Form
        form={form}
        layout="vertical"
        noValidate
        className="system-form"
        disabled={action.busy}
        onFinish={(values) => void action.run('family-save', async () => {
          const patch = {
            familyName: values.familyName.trim(),
            serverUrlHint: values.serverUrlHint?.trim() ? normalizeHttpUrl(values.serverUrlHint)! : '',
          };
          await api.put('/api/settings', patch);
          onSaved(patch);
        }, '家庭设置已保存。')}
      >
        <Form.Item name="familyName" label="家庭名称" rules={[
          { required: true, whitespace: true, message: '请输入家庭名称。' },
          { max: 100, message: '家庭名称不能超过 100 个字符。' },
        ]}>
          <Input autoComplete="off" maxLength={100} />
        </Form.Item>
        <Form.Item
          name="serverUrlHint"
          label="局域网播放地址（可选）"
          rules={[{ max: 2048, message: '地址不能超过 2048 个字符。' }, {
            validator: (_, value?: string) => !value?.trim() || normalizeHttpUrl(value)
              ? Promise.resolve()
              : Promise.reject(new Error('请输入完整的 HTTP 或 HTTPS 地址，不要包含账号密码。')),
          }]}
        >
          <Input type="url" placeholder="http://192.168.1.20:4310/" autoComplete="url" maxLength={2048} />
        </Form.Item>
        <div className="stacked">
          <ActionError error={action.lastKey === 'family-save' ? action.error : null} />
          <div><Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={action.pending === 'family-save'}>保存家庭设置</Button></div>
        </div>
      </Form>
    </section>
  );
}

interface PasswordDraft {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function PasswordSettings({ action }: { action: SystemAction }) {
  const [form] = Form.useForm<PasswordDraft>();
  const [candidate, setCandidate] = useState<PasswordDraft | null>(null);

  return (
    <section className="page-section" aria-labelledby="password-settings-title">
      <h2 id="password-settings-title">管理员密码</h2>
      <Form
        form={form}
        layout="vertical"
        noValidate
        className="system-form"
        disabled={action.busy}
        onValuesChange={() => setCandidate(null)}
        onFinish={setCandidate}
      >
        <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码。' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <div className="two-column">
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码。' },
              { min: 6, message: '新密码至少需要 6 个字符。' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再输入一次新密码。' },
              ({ getFieldValue }) => ({
                validator: (_, value: string) => !value || value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的新密码不一致。')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </div>
        <div className="stacked">
          <ActionError error={action.lastKey === 'password-save' ? action.error : null} />
          <div>
            <Popconfirm
              title="确认修改管理员密码？"
              description={<div className="system-confirm-copy">修改后请使用新密码登录，并妥善保存。</div>}
              open={!!candidate}
              trigger={[]}
              onOpenChange={(open) => { if (!open && !action.busy) setCandidate(null); }}
              onCancel={() => setCandidate(null)}
              okText="确认修改"
              cancelText="取消"
              okButtonProps={{ loading: action.pending === 'password-save' }}
              cancelButtonProps={{ disabled: action.busy }}
              onConfirm={async () => {
                if (!candidate) return;
                const { oldPassword, newPassword } = candidate;
                const success = await action.run('password-save', () =>
                  api.post('/api/auth/password', { oldPassword, newPassword }),
                '密码已修改。');
                setCandidate(null);
                if (success) form.resetFields();
              }}
            >
              <Button icon={<LockOutlined />} htmlType="submit" loading={action.pending === 'password-save'}>修改密码</Button>
            </Popconfirm>
          </div>
        </div>
      </Form>
    </section>
  );
}
