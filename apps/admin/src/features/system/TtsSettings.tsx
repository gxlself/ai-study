import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Select, Tag } from 'antd';
import { ReloadOutlined, SaveOutlined, SoundOutlined, StopOutlined } from '@ant-design/icons';
import type { Lang } from '@sprout/schema';
import { api } from '../../lib/api';
import { useResource } from '../../lib/hooks';
import { ResourceState } from '../../components/ui';
import { ActionError } from './shared';
import type { SystemAction } from './shared';
import type { SystemSettings, TtsProvider, TtsStatus } from './types';
import { normalizeHttpUrl } from './helpers';

const PROVIDERS: Record<TtsProvider, string> = {
  auto: '自动选择', 'macos-say': 'macOS 本地朗读', none: '不生成音频',
};
const SAMPLE_TEXT: Record<Lang, string> = {
  zh: '你好，欢迎来到芽芽成长。',
  en: 'Hello, welcome to Sprout.',
};

interface TtsDraft {
  ttsProvider: TtsProvider;
  zh: string;
  en: string;
}

export function TtsSettings({ settings, action, onSaved }: {
  settings: SystemSettings; action: SystemAction; onSaved: (patch: Partial<SystemSettings>) => void;
}) {
  const status = useResource<TtsStatus>('/api/tts/status');
  const [form] = Form.useForm<TtsDraft>();
  const [dirty, setDirty] = useState(false);
  const [audio, setAudio] = useState<{ url: string; lang: Lang } | null>(null);
  const [playbackHint, setPlaybackHint] = useState('');
  const audioElement = useRef<HTMLAudioElement>(null);
  const provider: TtsProvider = Form.useWatch('ttsProvider', form) ?? settings.ttsProvider;

  useEffect(() => {
    form.setFieldsValue({
      ttsProvider: settings.ttsProvider, zh: settings.ttsVoices.zh, en: settings.ttsVoices.en,
    });
    setDirty(false);
  }, [form, settings.ttsProvider, settings.ttsVoices.zh, settings.ttsVoices.en]);

  useEffect(() => {
    const element = audioElement.current;
    if (!element || !audio) return;
    let active = true;
    void element.play().catch(() => { if (active) setPlaybackHint('音频已就绪，请点击播放。'); });
    return () => { active = false; element.pause(); };
  }, [audio]);

  async function save(values: TtsDraft) {
    const patch = { ttsProvider: values.ttsProvider, ttsVoices: { zh: values.zh || '', en: values.en || '' } };
    await api.put('/api/settings', patch);
    onSaved(patch);
    setDirty(false);
    status.reload();
  }

  function voiceOptions(lang: Lang) {
    const available = [...new Set(status.data?.voices[lang] ?? [])].filter(Boolean);
    const current = settings.ttsVoices[lang];
    return [
      { value: '', label: '系统默认声音' },
      ...available.map((voice) => ({ value: voice, label: voice })),
      ...(current && !available.includes(current) ? [{ value: current, label: `${current}（当前配置）` }] : []),
    ];
  }

  async function preview(lang: Lang) {
    let values: TtsDraft;
    try { values = await form.validateFields(); } catch { return; }
    audioElement.current?.pause();
    setAudio(null);
    setPlaybackHint('');
    await action.run(`tts-preview:${lang}`, async () => {
      if (dirty) await save(values);
      const current = await api.get<TtsStatus>('/api/tts/status');
      if (!current.available) throw new Error('当前语音服务不可用。请检查服务器的语音支持或更换 provider 后重试。');
      const response = await api.post<{ url: string }>('/api/tts', { lang, text: SAMPLE_TEXT[lang] });
      const url = normalizeHttpUrl(new URL(response.url, window.location.origin).href);
      if (!url) throw new Error('服务器返回的试听音频地址无效，请重试。');
      setAudio({ url, lang });
    });
  }

  return (
    <section className="page-section" aria-labelledby="tts-settings-title">
      <div className="system-section-heading">
        <h2 id="tts-settings-title">朗读声音</h2>
        <Button icon={<ReloadOutlined />} loading={status.loading} disabled={action.busy} onClick={() => status.reload()}>
          检查语音服务
        </Button>
      </div>
      <div className="stacked">
        <ResourceState loading={status.loading} error={status.error} retry={status.reload}>
          {status.data && (
            <div className="stacked">
              <div className="system-inline">
                <Tag color={status.data.available ? 'success' : 'default'}>{status.data.available ? '语音服务可用' : '语音服务不可用'}</Tag>
                <span className="muted">当前服务：{Object.hasOwn(PROVIDERS, status.data.provider) ? PROVIDERS[status.data.provider as TtsProvider] : status.data.provider}</span>
              </div>
              {!status.data.available && (
                <Alert type="info" showIcon title="暂时无法生成试听音频" description="已生成的课程音频仍可使用；播放端也可在浏览器支持时使用浏览器朗读。" />
              )}
            </div>
          )}
        </ResourceState>
        <Form
          form={form}
          layout="vertical"
          className="system-form"
          disabled={action.busy}
          onValuesChange={() => {
            setDirty(true);
            audioElement.current?.pause();
            setAudio(null);
            setPlaybackHint('');
          }}
          onFinish={(values) => void action.run('tts-save', () => save(values), '朗读设置已保存。')}
        >
          <Form.Item name="ttsProvider" label="语音服务 Provider" rules={[{ required: true, message: '请选择语音服务。' }]}>
            <Select options={Object.entries(PROVIDERS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <div className="two-column">
            <Form.Item name="zh" label="中文声音">
              <Select
                options={voiceOptions('zh')}
                disabled={action.busy || provider === 'none'}
                loading={status.loading}
                showSearch={{ optionFilterProp: 'label' }}
                notFoundContent="未找到可用的中文声音"
              />
            </Form.Item>
            <Form.Item name="en" label="英文声音">
              <Select
                options={voiceOptions('en')}
                disabled={action.busy || provider === 'none'}
                loading={status.loading}
                showSearch={{ optionFilterProp: 'label' }}
                notFoundContent="未找到可用的英文声音"
              />
            </Form.Item>
          </div>
          <div className="stacked">
            <ActionError error={action.lastKey?.startsWith('tts-') ? action.error : null} />
            <div className="system-actions">
              <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={action.pending === 'tts-save'}>保存朗读设置</Button>
              {(['zh', 'en'] as const).map((lang) => (
                <Button
                  key={lang}
                  icon={<SoundOutlined />}
                  disabled={action.busy || provider === 'none' || (!dirty && (!status.data?.available || status.loading))}
                  loading={action.pending === `tts-preview:${lang}`}
                  onClick={() => void preview(lang)}
                >
                  {dirty ? '保存并试听' : '试听'}{lang === 'zh' ? '中文' : '英文'}
                </Button>
              ))}
            </div>
            {audio && (
              <div className="stacked">
                <p className="muted">{SAMPLE_TEXT[audio.lang]}</p>
                <div className="system-inline">
                  <audio
                    className="system-audio"
                    ref={audioElement}
                    src={audio.url}
                    controls
                    aria-label={`${audio.lang === 'zh' ? '中文' : '英文'}试听音频`}
                    onError={() => setPlaybackHint('音频加载失败，请重新生成试听音频。')}
                  />
                  <Button icon={<StopOutlined />} onClick={() => { audioElement.current?.pause(); setAudio(null); setPlaybackHint(''); }}>停止试听</Button>
                </div>
                {playbackHint && <p role="status" className="muted">{playbackHint}</p>}
              </div>
            )}
          </div>
        </Form>
      </div>
    </section>
  );
}
