import { DataSourceError, StorageError } from './errors';
import { browserStorage } from './storage';
import type { Connection } from './types';
import { legacyRemoteStateKey, remoteStateKey } from './identity';

const KEYS = { kind: 'sprout.source', server: 'sprout.server', token: 'sprout.deviceToken' } as const;

function clearRemoteIdentity(storage: Storage): void {
  const token = storage.getItem(KEYS.token)?.trim();
  if (token) {
    let server: string | undefined;
    try { server = normalizeServer(storage.getItem(KEYS.server) ?? ''); } catch { /* 损坏地址不能阻止退出配对。 */ }
    if (server) {
      storage.removeItem(remoteStateKey(server, token));
      storage.removeItem(legacyRemoteStateKey(server, token));
    }
  }
  // 旧身份键可反解凭据；清除所有遗留键，不删除其它 v2 身份或离线档案。
  const legacy: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith('sprout.remote:') && !key.startsWith('sprout.remote:v2:')) legacy.push(key);
  }
  legacy.forEach((key) => storage.removeItem(key));
}

export function normalizeServer(input: string): string {
  let value = input.trim();
  if (!value) {
    const location = globalThis.location;
    if (!location || !/^https?:$/.test(location.protocol)) {
      throw new DataSourceError('invalid-server', '请输入家庭服务器的 HTTP 或 HTTPS 地址。');
    }
    value = location.origin;
  }
  if (!/^https?:\/\//i.test(value)) {
    if (value.startsWith('//')) value = `http:${value}`;
    else if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      throw new DataSourceError('invalid-server', '服务器地址仅支持 HTTP 或 HTTPS。');
    } else value = `http://${value}`;
  }
  try {
    const url = new URL(value);
    if (
      !/^https?:$/.test(url.protocol) || !url.hostname ||
      url.username || url.password || url.search || url.hash
    ) {
      throw new Error('invalid server URL');
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch (cause) {
    throw new DataSourceError('invalid-server', '服务器地址无效，请检查地址和端口。', { cause });
  }
}

export function readConnection(): Connection | null {
  try {
    const storage = browserStorage();
    const kind = storage.getItem(KEYS.kind);
    if (kind === 'local') return { kind: 'local' };
    if (kind !== null && kind !== 'remote') return null;
    const token = storage.getItem(KEYS.token)?.trim();
    if (!token) return null;
    return { kind: 'remote', server: normalizeServer(storage.getItem(KEYS.server) ?? ''), token };
  } catch {
    return null;
  }
}

export function saveConnection(connection: Connection): void {
  const storage = browserStorage();
  if (connection.kind !== 'local' && connection.kind !== 'remote') {
    throw new DataSourceError('invalid-connection', '数据源类型无效。');
  }
  const server = connection.kind === 'remote' ? normalizeServer(connection.server ?? '') : null;
  const token = connection.token?.trim();
  if (connection.kind === 'remote' && !token) {
    throw new DataSourceError('invalid-token', '请先完成设备配对。');
  }
  try {
    if (storage.getItem(KEYS.token)?.trim() !== token || storage.getItem(KEYS.server) !== server) {
      clearRemoteIdentity(storage as Storage);
    }
    if (server !== null && token) {
      storage.setItem(KEYS.server, server);
      storage.setItem(KEYS.token, token);
    } else {
      storage.removeItem(KEYS.server);
      storage.removeItem(KEYS.token);
    }
    storage.setItem(KEYS.kind, connection.kind);
  } catch (cause) {
    throw new StorageError('连接设置保存失败。', cause);
  }
}

export function clearConnection(): void {
  const storage = browserStorage();
  try {
    clearRemoteIdentity(storage as Storage);
    for (const key of Object.values(KEYS)) storage.removeItem(key);
  } catch (cause) {
    throw new StorageError('无法清除连接设置。', cause);
  }
}
