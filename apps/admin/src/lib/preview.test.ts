import { describe, expect, it } from 'vitest';
import { previewUrl } from './preview';

describe('播放端预览协议', () => {
  it('在服务器根使用 Hash 路由而非 /admin 路由', () => {
    expect(previewUrl('custom.test', 'admin-token', 'zh-en', 15, 'http://localhost:5310'))
      .toBe('http://localhost:5310/#/preview/custom.test?token=admin-token&mode=zh-en&age=15');
  });
  it('token 不放入 HTTP 查询串，字符正确编码', () => {
    const url = new URL(previewUrl('custom.photo/1', 'a&b #', 'en', 24, 'https://family.example'));
    expect(url.search).toBe('');
    expect(url.pathname).toBe('/');
    expect(url.hash).toContain('custom.photo%2F1');
    expect(url.hash).toContain('token=a%26b+%23');
  });
  it('开发模式使用后台代理作为数据源与受信任消息来源', () => {
    const url = previewUrl('custom.test', 'token', 'zh', 18, 'http://localhost:5310', 'http://localhost:5311');
    const query = new URLSearchParams(url.split('?')[1]);
    expect(query.get('server')).toBe('http://localhost:5311');
  });
});
