export interface PreviewCredential {
  token: string;
  error: string;
}

export function consumePreviewCredential(params: URLSearchParams, location: Location = window.location): PreviewCredential {
  const legacy = params.has('token') || new URL(location.href).searchParams.has('token');
  const token = params.get('previewToken')?.trim() ?? '';
  const cleaned = new URL(location.href);
  cleaned.searchParams.delete('token');
  cleaned.searchParams.delete('previewToken');
  const [route, query = ''] = cleaned.hash.slice(1).split('?');
  const hashParams = new URLSearchParams(query);
  hashParams.delete('token');
  hashParams.delete('previewToken');
  const rest = hashParams.toString();
  cleaned.hash = `${route}${rest ? `?${rest}` : ''}`;
  window.history.replaceState(window.history.state, '', cleaned.href);
  return { token: legacy ? '' : token, error: legacy ? '不再接受管理员预览凭据，请从后台重新打开预览。' : '' };
}

export function adminOrigin(server: string, playerOrigin: string, configured?: string, dev = false): string {
  const url = new URL(configured || server || playerOrigin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin === 'null') {
    throw new Error('后台来源配置无效');
  }
  if (!configured && dev && url.origin === playerOrigin && ['5310', '5410'].includes(url.port)) {
    url.port = String(Number(url.port) + 1);
  }
  return url.origin;
}

export function trustedPreviewMessage(event: MessageEvent, expected: string, parent: Window = window.parent): boolean {
  return parent !== window && event.source === parent && event.origin === expected;
}
