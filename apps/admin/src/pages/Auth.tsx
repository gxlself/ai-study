import { useState } from 'react';
import { Alert, App, Button, Checkbox, DatePicker, Form, Input, Select, Steps } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, HeartFilled, LockOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ChildInput, type LanguageMode } from '@sprout/schema';
import { api, isMockMode, setToken } from '../lib/api';
import { useResource } from '../lib/hooks';
import { BirthdayWarning, useBirthdayConfirmation } from '../features/family/BirthdayConfirmation';

const languages = [
  { value: 'zh-en', label: '中文 + 英文', description: '先听中文，再听英文' },
  { value: 'zh', label: '中文', description: '只显示和朗读中文' },
  { value: 'en-zh', label: '英文 + 中文', description: '先听英文，再听中文' },
  { value: 'en', label: '英文', description: '只显示和朗读英文' },
];

interface SetupValues {
  familyName: string; password: string; confirm: string;
  name: string; birthday: Dayjs | null; languageMode: LanguageMode;
  remember: boolean;
}

export default function Auth({ onAuthenticated }: { onAuthenticated: () => void }) {
  const status = useResource<{ initialized: boolean }>('/api/setup/status');
  const { message } = App.useApp();
  const confirmBirthday = useBirthdayConfirmation();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string>();
  const [form] = Form.useForm<SetupValues>();
  const birthday = Form.useWatch('birthday', form);
  const initialized = status.data?.initialized;

  async function submit(values: SetupValues) {
    setBusy(true);
    setError(undefined);
    try {
      if (!initialized && !await confirmBirthday(values.birthday)) return;
      const result = initialized
        ? await api.post<{ token: string }>('/api/auth/login', { password: values.password })
        : await api.post<{ token: string }>('/api/setup', {
          familyName: values.familyName,
          password: values.password,
          child: ChildInput.parse({
            name: values.name, birthday: values.birthday?.format('YYYY-MM-DD'), languageMode: values.languageMode,
          }),
        });
      setToken(result.token, values.remember === true);
      void message.success(initialized ? '欢迎回来' : '家庭已创建');
      onAuthenticated();
    } catch (err) { setError(err instanceof Error ? err.message : '暂时无法登录，请稍后重试'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <div className="auth-brand"><HeartFilled /><span>芽芽成长<small>SPROUT</small></span></div>
    <section className="auth-form">
      <h1>{initialized === false ? '开启一家人的成长旅程' : '欢迎回家'}</h1>
      <p className="muted">{initialized === false ? '建立家庭和孩子的第一份成长档案' : '芽芽成长 · 家长工作台'}</p>
      {isMockMode() && <Alert type="info" title="开发演示数据 · 与真实家庭数据隔离" showIcon />}
      {status.loading ? <p role="status">正在连接家庭服务器…</p> : status.error ?
        <Alert type="error" title={status.error.message} action={<Button icon={<ReloadOutlined />} onClick={status.reload}>重试</Button>} /> :
        <Form<SetupValues> form={form} layout="vertical" onFinish={(values) => void submit(values)} disabled={busy}
          initialValues={{ familyName: '我的家', birthday: null, languageMode: 'zh-en', remember: false }}
          validateMessages={{ required: '请填写${label}' }} requiredMark="optional">
          {!initialized && <Steps size="small" current={step} items={[{ title: '家庭设置' }, { title: '孩子档案' }]} />}
          {error && <Alert type="error" showIcon title={error} />}
          {!initialized && <Form.Item hidden={step !== 0} name="familyName" label="家庭名" rules={[{ required: true }, { max: 40, message: '家庭名不超过 40 个字' }]}><Input autoComplete="organization" /></Form.Item>}
          <Form.Item hidden={!initialized && step !== 0} name="password" label="管理员密码"
            rules={[{ required: true, message: '请输入管理员密码' }, ...(!initialized ? [{ min: 6, message: '密码至少 6 位' }] : [])]}>
            <Input.Password prefix={<LockOutlined />} autoComplete={initialized ? 'current-password' : 'new-password'} />
          </Form.Item>
          {!initialized && <>
            <Form.Item hidden={step !== 0} name="confirm" label="再次输入密码" dependencies={['password']} rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({ validator: (_, value) => value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('两次密码不一致')) }),
            ]}><Input.Password autoComplete="new-password" /></Form.Item>
            <Form.Item hidden={step !== 1} name="name" label="孩子名字" rules={[{ required: true }, { max: 20, message: '名字不超过 20 个字' }]}><Input autoComplete="off" /></Form.Item>
            <Form.Item hidden={step !== 1} name="birthday" label="生日"
              extra={<BirthdayWarning birthday={birthday} />}
              rules={[{ required: true, message: '请选择生日' },
                { validator: (_, value) => value?.isAfter(dayjs(), 'day')
                  ? Promise.reject(new Error('生日不能晚于今天')) : Promise.resolve() }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="选择宝宝的出生日期"
                showNow={false} />
            </Form.Item>
            <Form.Item hidden={step !== 1} name="languageMode" label="语言模式" rules={[{ required: true }]}>
              <Select options={languages.map((item) => ({ value: item.value, label: `${item.label} · ${item.description}` }))} />
            </Form.Item>
          </>}
          <Form.Item name="remember" valuePropName="checked" hidden={!initialized && step !== 1}>
            <Checkbox>在此设备保持登录</Checkbox>
          </Form.Item>
          <div className="auth-actions">
            {!initialized && step === 1 && <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)}>上一步</Button>}
            {!initialized && step === 0
              ? <Button type="primary" block icon={<ArrowRightOutlined />} onClick={async () => {
                try { await form.validateFields(['familyName', 'password', 'confirm']); setStep(1); } catch { /* 表单显示校验信息。 */ }
              }}>下一步</Button>
              : <Button type="primary" block htmlType="submit" loading={busy}>{initialized ? '登录' : '创建家庭'}</Button>}
          </div>
        </Form>}
    </section>
    <p className="auth-footer">一起看一会儿，再去玩一会儿。</p>
  </main>;
}
