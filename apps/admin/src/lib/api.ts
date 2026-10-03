import type { ValidationIssue } from '@sprout/schema';

const TOKEN_KEY = 'sprout.adminToken';
const REMEMBER_KEY = `${TOKEN_KEY}.remember`;
export const UNAUTHORIZED_EVENT = 'sprout:unauthorized';
export const isMockMode = () =>
  import.meta.env.DEV && typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('mock') === '1' || window.__sproutMock === true);

declare global {
  interface Window { __sproutMock?: boolean }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (isMockMode()) return window.sessionStorage.getItem(`${TOKEN_KEY}.mock`);
  const session = window.sessionStorage.getItem(TOKEN_KEY);
  if (session) return session;
  const stored = window.localStorage.getItem(TOKEN_KEY);
  if (!stored || window.localStorage.getItem(REMEMBER_KEY) === '1') return stored;
  // 旧版持久凭据迁入本次会话，不视为用户同意保持登录。
  window.sessionStorage.setItem(TOKEN_KEY, stored);
  window.localStorage.removeItem(TOKEN_KEY);
  return stored;
}

export function setToken(token: string | null, remember = false): void {
  if (typeof window === 'undefined') return;
  if (isMockMode()) {
    const key = `${TOKEN_KEY}.mock`;
    if (token) window.sessionStorage.setItem(key, token);
    else window.sessionStorage.removeItem(key);
    return;
  }
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REMEMBER_KEY);
  if (!token) return;
  if (remember) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(REMEMBER_KEY, '1');
  } else window.sessionStorage.setItem(TOKEN_KEY, token);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = 'UNKNOWN',
    public issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  fetch?: typeof fetch;
  token?: () => string | null;
  unauthorized?: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issuesOf(value: unknown): ValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ValidationIssue =>
    isRecord(item) && typeof item.path === 'string' && typeof item.message === 'string' &&
    (item.level === 'error' || item.level === 'warning'),
  );
}

export function createApi(options: ApiOptions = {}) {
  async function response(path: string, init: RequestInit = {}) {
    if (!path.startsWith('/api/')) throw new ApiError('请求地址无效', 0, 'INVALID_PATH');
    const headers = new Headers(init.headers);
    const token = (options.token ?? getToken)();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    let result: Response;
    try {
      result = await (options.fetch ?? globalThis.fetch)(path, { ...init, headers, cache: 'no-store' });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ApiError('无法连接芽芽服务器，请检查网络或稍后重试', 0, 'NETWORK');
    }
    if (!result.ok) {
      let body: unknown;
      try { body = await result.json(); } catch { body = null; }
      const root = isRecord(body) ? body : {};
      const detail = isRecord(root.error) ? root.error : {};
      const fallback = result.status === 401 ? '登录已过期，请重新登录'
        : result.status === 413 ? '文件过大，请选择较小的文件'
          : result.status === 429 ? '操作过于频繁，请稍后再试' : '请求未成功，请稍后重试';
      if (result.status === 401 && !/^\/api\/(?:auth\/login|setup)(?:$|[/?])/.test(path)) {
        (options.unauthorized ?? (() => {
          setToken(null);
          window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }))();
      }
      throw new ApiError(
        typeof detail.message === 'string' ? detail.message : fallback,
        result.status,
        typeof detail.code === 'string' ? detail.code : `HTTP_${result.status}`,
        issuesOf(root.issues ?? detail.issues ?? (isRecord(detail.details) ? detail.details.issues : undefined)),
      );
    }
    return result;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const result = await response(path, init);
    if (result.status === 204) return undefined as T;
    const text = await result.text();
    if (!text.trim()) return undefined as T;
    try { return JSON.parse(text) as T; }
    catch { throw new ApiError('服务器返回格式异常，请稍后重试', result.status, 'INVALID_RESPONSE'); }
  }

  return {
    get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
    post: <T>(path: string, body?: unknown, init?: RequestInit) =>
      request<T>(path, { ...init, method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
    upload: <T>(path: string, file: File) => {
      const data = new FormData();
      data.append('file', file);
      return request<T>(path, { method: 'POST', body: data });
    },
    async download(path: string, filename: string) {
      const result = await response(path);
      const url = URL.createObjectURL(await result.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}

export const api = createApi();
