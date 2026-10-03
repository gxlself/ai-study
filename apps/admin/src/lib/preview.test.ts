import { describe, expect, it } from 'vitest';
import { previewUrl } from './preview';

describe('播放端预览协议', () => {
  it('在服务器根使用 Hash 路由而非 /admin 路由', () => {
    expect(previewUrl('custom.test', 'readonly-preview', 'zh-en', 15, 'http://localhost:5310'))
      .toBe('http://localhost:5310/#/preview/custom.test?previewToken=readonly-preview&mode=zh-en&age=15');
  });
  it('token 不放入 HTTP 查询串，字符正确编码', () => {
    const url = new URL(previewUrl('custom.photo/1', 'a&b #', 'en', 24, 'https://family.example'));
    expect(url.search).toBe('');
    expect(url.pathname).toBe('/');
    expect(url.hash).toContain('custom.photo%2F1');
    expect(url.hash).toContain('previewToken=a%26b+%23');
    expect(new URLSearchParams(url.hash.split('?')[1]).has('token')).toBe(false);
  });
  it('开发模式使用后台代理作为数据源与受信任消息来源', () => {
    const url = previewUrl('custom.test', 'readonly-preview', 'zh', 18, 'http://localhost:5310', 'http://localhost:5311');
    const query = new URLSearchParams(url.split('?')[1]);
    expect(query.get('server')).toBe('http://localhost:5311');
  });
  it('没有短期凭据时不生成预览地址', () => {
    expect(() => previewUrl('custom.test', '', 'zh', 18, 'http://localhost:5310')).toThrow('凭据');
  });
  it.each(['javascript:alert(1)', 'file:///preview', 'https://name:password@example.com'])(
    '拒绝不安全的来源 %s', (origin) => {
      expect(() => previewUrl('custom.test', 'readonly', 'zh', 18, origin)).toThrow();
      expect(() => previewUrl('custom.test', 'readonly', 'zh', 18, 'http://localhost:5310', origin)).toThrow();
    },
  );
  it('来源规范为精确 origin，不把路径、查询或 hash 带入消息信任范围', () => {
    const url = previewUrl('custom.test', 'readonly', 'zh', 18,
      'https://family.example/admin/?x=1#tab', 'https://server.example/admin/');
    expect(url.startsWith('https://family.example/#/preview/')).toBe(true);
    expect(new URLSearchParams(url.split('?')[1]).get('server')).toBe('https://server.example');
  });
});
