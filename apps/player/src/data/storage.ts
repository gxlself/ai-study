import { ChildInput, SessionInput, type ChildProfile } from '@sprout/schema';
import { StorageError } from './errors';
import type { DataStorage } from './types';

export const HISTORY_LIMIT = 2000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function browserStorage(): DataStorage {
  try {
    if (!globalThis.localStorage) throw new Error('localStorage unavailable');
    return globalThis.localStorage;
  } catch (cause) {
    throw new StorageError('无法使用本机存储，请允许此应用保存数据。', cause);
  }
}

export function readJson(storage: DataStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (cause) {
    throw new StorageError('无法读取本机记录，原有记录未被覆盖。', cause);
  }
}

export function writeJson(storage: DataStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (cause) {
    throw new StorageError('本机记录保存失败，请检查可用存储空间。', cause);
  }
}

export function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function parseSession(value: unknown): SessionInput {
  const session = SessionInput.parse(value);
  if (!validTimestamp(session.startedAt) || !validTimestamp(session.endedAt)) {
    throw new Error('学习记录时间无效。');
  }
  if (Date.parse(session.endedAt) < Date.parse(session.startedAt)) {
    throw new Error('学习记录结束时间不能早于开始时间。');
  }
  return session;
}

export function parseStoredSessions(value: unknown): SessionInput[] {
  try {
    if (!Array.isArray(value)) throw new Error('sessions must be an array');
    return value.map(parseSession);
  } catch (cause) {
    throw new StorageError('本机学习记录格式无效，原有记录未被覆盖。', cause);
  }
}

export function parseStoredChild(value: unknown): ChildProfile {
  try {
    if (
      !isRecord(value) || typeof value.id !== 'string' || !value.id ||
      !validTimestamp(value.createdAt) || !validTimestamp(value.updatedAt)
    ) {
      throw new Error('invalid child profile');
    }
    return {
      ...ChildInput.parse(value),
      id: value.id,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  } catch (cause) {
    throw new StorageError('本机孩子档案格式无效，原有档案未被覆盖。', cause);
  }
}

export function newId(prefix: string, now: Date): string {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function recentSessions(sessions: SessionInput[]): SessionInput[] {
  const seen = new Set<string>();
  return sessions
    .filter((session) => {
      if (!session.clientId) return true;
      if (seen.has(session.clientId)) return false;
      seen.add(session.clientId);
      return true;
    })
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, HISTORY_LIMIT);
}

export class SessionIds {
  private readonly ids = new WeakMap<SessionInput, string>();

  prepare(input: SessionInput, now: Date): SessionInput {
    const session = parseSession(input);
    let clientId = session.clientId?.trim() || this.ids.get(input);
    if (!clientId) {
      clientId = newId('session', now);
      this.ids.set(input, clientId);
    }
    return { ...session, clientId };
  }
}
