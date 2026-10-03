// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi, getToken, setToken } from './api';

const key = 'sprout.adminToken';
const rememberKey = `${key}.remember`;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.__sproutMock = false;
  history.replaceState(null, '', '/admin/');
});
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.__sproutMock = false;
});

describe('管理员凭据存储', () => {
  it('默认只存 sessionStorage，刷新本标签页仍可读取', () => {
    setToken('session-token');
    expect(sessionStorage.getItem(key)).toBe('session-token');
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(rememberKey)).toBeNull();
    expect(getToken()).toBe('session-token');
    sessionStorage.clear();
    expect(getToken()).toBeNull();
  });
  it('只有明确选择保持登录才持久化', () => {
    setToken('remembered-token', true);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(key)).toBe('remembered-token');
    expect(localStorage.getItem(rememberKey)).toBe('1');
    sessionStorage.clear();
    expect(getToken()).toBe('remembered-token');
  });
  it('改用会话登录时清除旧持久凭据与同意标记', () => {
    setToken('old-token', true);
    setToken('new-session-token');
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(rememberKey)).toBeNull();
    expect(getToken()).toBe('new-session-token');
  });
  it('旧版 localStorage token 迁入会话，不默认为保持登录', () => {
    localStorage.setItem(key, 'legacy-token');
    expect(getToken()).toBe('legacy-token');
    expect(sessionStorage.getItem(key)).toBe('legacy-token');
    expect(localStorage.getItem(key)).toBeNull();
    sessionStorage.clear();
    expect(getToken()).toBeNull();
  });
  it('退出登录同时清除两种存储和同意标记', () => {
    setToken('persistent', true);
    sessionStorage.setItem(key, 'session');
    setToken(null);
    expect(getToken()).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(rememberKey)).toBeNull();
  });
  it('401 也清除持久登录并发出过期事件', async () => {
    setToken('persistent', true);
    const expired = vi.fn();
    window.addEventListener('sprout:unauthorized', expired);
    try {
      const client = createApi({ fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 })) });
      await expect(client.get('/api/children')).rejects.toMatchObject({ status: 401 });
      expect(getToken()).toBeNull();
      expect(localStorage.getItem(rememberKey)).toBeNull();
      expect(expired).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('sprout:unauthorized', expired); }
  });
  it('开发演示即使选择保持登录也只使用独立会话键', () => {
    setToken('real-family-token', true);
    window.__sproutMock = true;
    setToken('mock-token', true);
    expect(getToken()).toBe('mock-token');
    expect(sessionStorage.getItem(`${key}.mock`)).toBe('mock-token');
    expect(localStorage.getItem(key)).toBe('real-family-token');
    setToken(null);
    window.__sproutMock = false;
    expect(getToken()).toBe('real-family-token');
  });
});
