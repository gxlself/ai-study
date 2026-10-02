import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('统一 API 封装', () => {
  it('发送 Bearer token，并解析 JSON', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ok: true }));
    const client = createApi({ fetch: fetcher, token: () => 'secret' });
    await expect(client.post('/api/settings', { familyName: '我的家' })).resolves.toEqual({ ok: true });
    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe('/api/settings');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe('{"familyName":"我的家"}');
  });

  it('401 通知登录过期，但登录密码错误不会形成跳转循环', async () => {
    const unauthorized = vi.fn();
    const client = createApi({
      fetch: vi.fn<typeof fetch>().mockImplementation(async () => response({ error: { code: 'AUTH', message: '密码不正确' } }, 401)),
      token: () => null, unauthorized,
    });
    await expect(client.post('/api/auth/login', { password: 'wrong' })).rejects.toMatchObject({ status: 401, message: '密码不正确' });
    expect(unauthorized).not.toHaveBeenCalled();
    await expect(client.get('/api/children')).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('保留可定位的课程校验问题', async () => {
    const issues = [{ path: 'steps.0.props.items', message: '至少选择一个词条', level: 'error' }];
    const client = createApi({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ error: { code: 'VALIDATION', message: '校验未通过' }, issues }, 400)),
    });
    await expect(client.post('/api/lessons', {})).rejects.toMatchObject({ code: 'VALIDATION', issues });
  });

  it('兼容错误详情中的 issues，并忽略无效 issue', async () => {
    const issue = { path: 'title.zh', message: '标题不能为空', level: 'error' };
    const client = createApi({ fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ error: { details: { issues: [issue, null, {}] } } }, 400)) });
    await expect(client.put('/api/lessons/custom.test', {})).rejects.toMatchObject({ issues: [issue] });
  });

  it('网络异常显示中文提示', async () => {
    const client = createApi({ fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')) });
    await expect(client.get('/api/health')).rejects.toMatchObject({ message: '无法连接芽芽服务器，请检查网络或稍后重试', code: 'NETWORK' });
  });

  it('请求取消不包装成网络错误', async () => {
    const client = createApi({ fetch: vi.fn<typeof fetch>().mockRejectedValue(new DOMException('aborted', 'AbortError')) });
    await expect(client.get('/api/health')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('处理非 JSON 错误和无效成功响应', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }))
      .mockResolvedValueOnce(new Response('<html>SPA fallback</html>'));
    const client = createApi({ fetch: fetcher });
    await expect(client.get('/api/health')).rejects.toMatchObject({ status: 502, message: '请求未成功，请稍后重试' });
    await expect(client.get('/api/health')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('无响应体的 DELETE 可正常结束', async () => {
    const client = createApi({ fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 })) });
    await expect(client.delete('/api/children/1')).resolves.toBeUndefined();
  });

  it('上传使用 multipart，不手动指定 boundary', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ path: 'assets/photo.png' }));
    const client = createApi({ fetch: fetcher });
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    await client.upload('/api/media', file);
    const init = fetcher.mock.calls[0][1]!;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('不向任意外部 URL 泄漏管理员 token', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createApi({ fetch: fetcher, token: () => 'secret' });
    await expect(client.get('https://example.com/api/steal')).rejects.toMatchObject({ code: 'INVALID_PATH' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
