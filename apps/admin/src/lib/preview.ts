export function previewUrl(id: string, token: string | null, mode: string, age: number, origin: string, server?: string) {
  const query = new URLSearchParams({ token: token ?? '', mode, age: String(age) });
  if (server) query.set('server', server);
  return `${origin}/#/preview/${encodeURIComponent(id)}?${query.toString()}`;
}
