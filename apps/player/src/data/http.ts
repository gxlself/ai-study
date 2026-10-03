import { DataSourceError, HttpError, RequestError, RequestTimeoutError } from './errors';
import { isRecord } from './storage';
import type { DataSourceOptions } from './types';

export class JsonClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: Pick<DataSourceOptions, 'fetch' | 'timeoutMs'>) {
    this.fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!this.fetcher) throw new DataSourceError('fetch-unavailable', '当前环境不支持网络请求。');
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new DataSourceError('invalid-timeout', '请求超时必须是正数。');
    }
  }

  async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new RequestTimeoutError(this.timeoutMs));
        controller.abort();
      }, this.timeoutMs);
    });
    const operation = async (): Promise<T> => {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          ...init, signal: controller.signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        });
      } catch (cause) {
        throw new RequestError('network', '无法连接家庭服务器，请检查网络。', cause);
      }
      if (!response.ok) {
        let body: unknown;
        try { body = await response.json(); } catch { body = null; }
        const error = isRecord(body) && isRecord(body.error) ? body.error : null;
        throw new HttpError(
          response.status,
          typeof error?.code === 'string' ? error.code : 'http-error',
          typeof error?.message === 'string' ? error.message : `请求失败（HTTP ${response.status}）。`,
        );
      }
      if (response.status === 204 || response.status === 205) return undefined as T;
      try {
        return await response.json() as T;
      } catch (cause) {
        throw new RequestError('invalid-response', '服务器返回的数据格式无效。', cause);
      }
    };
    try {
      return await Promise.race([operation(), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}
