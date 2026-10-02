import type { ValidationIssue } from '@sprout/schema';

export class DataSourceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DataSourceError';
  }
}

export class StorageError extends DataSourceError {
  constructor(message: string, cause?: unknown) {
    super('storage', message, { cause });
    this.name = 'StorageError';
  }
}

export class RequestError extends DataSourceError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, { cause });
    this.name = 'RequestError';
  }
}

export class HttpError extends RequestError {
  constructor(
    public readonly status: number,
    code: string,
    message: string,
  ) {
    super(code, message);
    this.name = 'HttpError';
  }
}

export class RequestTimeoutError extends RequestError {
  constructor(public readonly timeoutMs: number) {
    super('timeout', '连接超时，请检查家庭服务器或网络。');
    this.name = 'RequestTimeoutError';
  }
}

export class BundleValidationError extends DataSourceError {
  constructor(public readonly issues: ValidationIssue[]) {
    super('invalid-bundle', `内置内容包校验失败：${issues.map((i) => `${i.path}: ${i.message}`).join('；')}`);
    this.name = 'BundleValidationError';
  }
}
