function httpOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('预览来源必须是不含账号密码的 HTTP(S) 地址');
  }
  return url.origin;
}

export function previewUrl(id: string, previewToken: string, mode: string, age: number, origin: string, server?: string) {
  if (!previewToken) throw new Error('预览凭据尚未就绪');
  const query = new URLSearchParams({ previewToken, mode, age: String(age) });
  if (server) query.set('server', httpOrigin(server));
  return `${httpOrigin(origin)}/#/preview/${encodeURIComponent(id)}?${query.toString()}`;
}
