export function webFixtureUrl(parentOrigin: string): string {
  const parent = new URL(parentOrigin);
  if (!['localhost', '127.0.0.1'].includes(parent.hostname)) {
    throw new Error('playground 请通过 localhost 或 127.0.0.1 访问');
  }
  const fixture = new URL('/assets/web-fixture.html', parent.origin);
  fixture.hostname = parent.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  fixture.searchParams.set('parentOrigin', parent.origin);
  return fixture.href;
}
