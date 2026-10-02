import { useEffect, useRef, useState } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Upload } from 'antd';
import { api } from '../../lib/api';
import { assetUrl, messageOf } from './model';

export default function MediaField({ id, value, onChange, disabled, media = false, packId, label, onUploading }: {
  id?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  media?: boolean;
  packId?: string;
  label: string;
  onUploading?: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState<{ path: string; url: string }>();
  const live = useRef(true);
  const uploadCallback = useRef(onUploading);
  uploadCallback.current = onUploading;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      uploadCallback.current?.(false);
    };
  }, []);

  const upload = async (file: File) => {
    const allowed = media ? /\.(png|jpe?g|webp|svg|gif|mp3|m4a|mp4)$/i : /\.(png|jpe?g|webp|svg|gif)$/i;
    if (!allowed.test(file.name)) {
      setError(media ? '请选择支持的图片、MP3、M4A 或 MP4 文件' : '请选择 PNG、JPG、WebP、SVG 或 GIF 图片');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('文件不能超过 10 MB');
      return;
    }
    setError('');
    setUploading(true);
    uploadCallback.current?.(true);
    try {
      const result = await api.upload<{ path: string; url: string }>('/api/media', file);
      if (live.current) {
        setUploaded(result);
        onChange(result.path);
      }
    } catch (cause) {
      if (live.current) setError(messageOf(cause));
    } finally {
      if (live.current) setUploading(false);
      uploadCallback.current?.(false);
    }
  };
  const url = uploaded && value === uploaded.path
    ? uploaded.url
    : assetUrl(value, packId);
  return (
    <div className="content-media-field">
      <div className="content-inline">
        <Input id={id} aria-label={label} value={value ?? ''} disabled={disabled || uploading}
          onChange={(event) => onChange(event.target.value || undefined)} />
        <Upload accept={media ? '.png,.jpg,.jpeg,.webp,.svg,.gif,.mp3,.m4a,.mp4' : '.png,.jpg,.jpeg,.webp,.svg,.gif'}
          showUploadList={false} disabled={disabled || uploading}
          beforeUpload={(file) => { void upload(file); return false; }}>
          <Button icon={<UploadOutlined />} loading={uploading} disabled={disabled}>{media ? '上传文件' : '上传图片'}</Button>
        </Upload>
      </div>
      {!media && url && <img className="content-media-thumbnail" src={url} alt={`${label}预览`} />}
      {error && <Alert type="error" title={error} showIcon />}
    </div>
  );
}
