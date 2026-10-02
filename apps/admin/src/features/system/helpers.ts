import type { PluginInfo, ValidationIssue } from '@sprout/schema';

export const PERMISSIONS: Record<string, { label: string; risk: string }> = {
  network: { label: '网络访问', risk: '可能连接外部服务并传输数据。' },
  microphone: { label: '麦克风', risk: '可能采集声音，请留意孩子和家庭的隐私。' },
  camera: { label: '摄像头', risk: '可能采集画面，请留意孩子和家庭的隐私。' },
  storage: { label: '本地存储', risk: '可能读取或写入浏览器中的本地数据。' },
};

export function permissionInfo(permission: string) {
  return Object.hasOwn(PERMISSIONS, permission) ? PERMISSIONS[permission] : {
    label: `未知权限：${permission}`,
    risk: '暂时无法识别此能力，请向插件作者确认用途。',
  };
}

export function normalizeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function playerAddress(hint: string | undefined, origin: string): string {
  const fallback = normalizeHttpUrl(origin);
  const input = hint?.trim();
  const hinted = input && (
    normalizeHttpUrl(input) ||
    (!input.includes('://') ? normalizeHttpUrl(`http://${input}`) : undefined)
  );
  const url = new URL(hinted || fallback || 'http://localhost:4310');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.href;
}

export function isLoopbackAddress(value: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function fileSelectionError(file: Pick<File, 'name' | 'size'>, extension: 'zip' | 'json'): string | null {
  if (!file.name.toLowerCase().endsWith(`.${extension}`)) {
    return extension === 'zip' ? '请选择 ZIP 压缩包。' : '请选择 JSON 备份文件。';
  }
  if (file.size === 0) return '文件为空，请重新选择。';
  if (extension === 'json' && file.size > 25 * 1024 * 1024) return '备份文件不能超过 25 MB。';
  return null;
}

export function parseBackup(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON，请使用从芽芽成长导出的备份。');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('备份内容必须是 JSON 对象，请核对所选文件。');
  }
  if (Object.keys(value).length === 0) throw new Error('备份内容为空，请核对所选文件。');
  return value as Record<string, unknown>;
}

export function validationIssues(error: unknown): ValidationIssue[] {
  if (!error || typeof error !== 'object' || !('issues' in error) || !Array.isArray(error.issues)) return [];
  return error.issues.filter((item): item is ValidationIssue =>
    !!item && typeof item === 'object' &&
    typeof item.path === 'string' && typeof item.message === 'string' &&
    (item.level === 'error' || item.level === 'warning'),
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作未完成，请稍后重试。';
}

export function downloadName(id: string, version: string): string {
  return `${id}-${version}`.replace(/[^a-zA-Z0-9._-]/g, '_') + '.zip';
}

export function groupPlugins(plugins: PluginInfo[]) {
  return {
    builtin: plugins.filter((plugin) => plugin.source === 'builtin'),
    external: plugins.filter((plugin) => plugin.source !== 'builtin'),
  };
}

export function formatLastSeen(value: string | null): string {
  if (!value) return '尚未上线';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间暂不可用';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}
