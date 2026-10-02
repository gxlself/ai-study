import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
  ChildInput, ChildProfile, DeviceInfo, MilestoneObservation,
  SessionInput, SessionRecord,
} from '@sprout/schema';
import { ApiError } from './errors';

type Row = Record<string, unknown>;

export interface Settings {
  familyName: string;
  ttsProvider: 'auto' | 'macos-say' | 'none';
  ttsVoices: { zh: string; en: string };
  serverUrlHint: string;
}

export const defaultSettings: Settings = {
  familyName: '芽芽的家',
  ttsProvider: 'auto',
  ttsVoices: { zh: '', en: '' },
  serverUrlHint: '',
};

export class Store {
  readonly db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dataDir, 'sprout.db'));
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version as number;
    if (version > 1) {
      this.db.close();
      throw new Error('数据版本比当前服务端新，请升级服务端后重试');
    }
    if (version < 1) this.transaction(() => {
      this.db.exec(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE admin_tokens (hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
        CREATE TABLE login_attempts (ip TEXT PRIMARY KEY, failures INTEGER NOT NULL, locked_until INTEGER NOT NULL);
        CREATE TABLE children (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, nickname TEXT, birthday TEXT NOT NULL, avatar TEXT,
          language_mode TEXT NOT NULL, show_pinyin INTEGER NOT NULL, screen_json TEXT NOT NULL, plan_json TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE devices (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
          child_id TEXT REFERENCES children(id) ON DELETE SET NULL,
          token_hash TEXT UNIQUE, created_at TEXT NOT NULL, last_seen_at TEXT
        );
        CREATE TABLE pairings (
          id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, kind TEXT NOT NULL,
          expires_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          device_id TEXT REFERENCES devices(id) ON DELETE CASCADE, claimed INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY, child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
          lesson_id TEXT NOT NULL, started_at TEXT NOT NULL, client_id TEXT UNIQUE,
          device_id TEXT REFERENCES devices(id) ON DELETE SET NULL, data TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX sessions_child_time ON sessions(child_id, started_at);
        CREATE TABLE milestone_observations (
          child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE, item_id TEXT NOT NULL,
          data TEXT NOT NULL, PRIMARY KEY(child_id, item_id)
        );
        CREATE TABLE plugins (
          id TEXT PRIMARY KEY, manifest TEXT NOT NULL, source TEXT NOT NULL, enabled INTEGER NOT NULL,
          manifest_url TEXT, directory TEXT
        );
        PRAGMA user_version = 1;
      `);
    });
  }

  transaction<T>(callback: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = callback();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void { this.db.close(); }

  setting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value as string) as T : fallback;
  }

  setSetting(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  settings(): Settings {
    const saved = this.setting<Partial<Settings>>('public', {});
    return { ...defaultSettings, ...saved, ttsVoices: { ...defaultSettings.ttsVoices, ...saved.ttsVoices } };
  }

  children(): ChildProfile[] {
    return this.db.prepare('SELECT * FROM children ORDER BY created_at, id').all().map(childRow);
  }

  child(id: string): ChildProfile {
    const row = this.db.prepare('SELECT * FROM children WHERE id = ?').get(id);
    if (!row) throw new ApiError(404, 'CHILD_NOT_FOUND', '没有找到这个孩子');
    return childRow(row);
  }

  saveChild(input: ChildInput, existing?: ChildProfile): ChildProfile {
    const now = new Date().toISOString();
    const child: ChildProfile = {
      ...input, id: existing?.id ?? randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    this.putChild(child);
    return child;
  }

  putChild(child: ChildProfile): void {
    this.db.prepare(`INSERT INTO children VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, nickname=excluded.nickname, birthday=excluded.birthday,
      avatar=excluded.avatar, language_mode=excluded.language_mode, show_pinyin=excluded.show_pinyin,
      screen_json=excluded.screen_json, plan_json=excluded.plan_json, updated_at=excluded.updated_at`)
      .run(child.id, child.name, child.nickname ?? null, child.birthday, child.avatar ?? null,
        child.languageMode, child.showPinyin ? 1 : 0, JSON.stringify(child.screen), JSON.stringify(child.plan),
        child.createdAt, child.updatedAt);
  }

  deleteChild(id: string): void {
    this.child(id);
    this.db.prepare('DELETE FROM children WHERE id = ?').run(id);
  }

  device(id: string): DeviceInfo {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!row) throw new ApiError(404, 'DEVICE_NOT_FOUND', '没有找到此设备');
    return deviceRow(row);
  }

  devices(): DeviceInfo[] {
    return this.db.prepare('SELECT * FROM devices ORDER BY created_at, id').all().map(deviceRow);
  }

  putDevice(device: DeviceInfo): void {
    this.db.prepare('INSERT INTO devices(id, name, kind, child_id, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(device.id, device.name, device.kind, device.childId, device.createdAt, device.lastSeenAt);
  }

  sessions(filters: { childId?: string; from?: string; to?: string; limit?: number } = {}): SessionRecord[] {
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    for (const [column, op, value] of [
      ['child_id', '=', filters.childId], ['started_at', '>=', filters.from], ['started_at', '<', filters.to],
    ]) {
      if (value !== undefined) { clauses.push(`${column} ${op} ?`); values.push(value); }
    }
    let sql = `SELECT * FROM sessions${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY started_at DESC, id DESC`;
    if (filters.limit !== undefined) { sql += ' LIMIT ?'; values.push(filters.limit); }
    return this.db.prepare(sql).all(...values).map(sessionRow);
  }

  saveSession(input: SessionInput, deviceId?: string): SessionRecord {
    if (input.clientId) {
      const previous = this.db.prepare('SELECT * FROM sessions WHERE client_id = ?').get(input.clientId);
      if (previous) {
        if (previous.child_id !== input.childId) throw new ApiError(409, 'CLIENT_ID_CONFLICT', '此同步编号已用于其他孩子的记录');
        return sessionRow(previous);
      }
    }
    const session: SessionRecord = { ...input, id: randomUUID(), deviceId, createdAt: new Date().toISOString() };
    this.putSession(session);
    return session;
  }

  putSession(session: SessionRecord): void {
    this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      session.id, session.childId, session.lessonId, session.startedAt, session.clientId ?? null,
      session.deviceId ?? null, JSON.stringify(session), session.createdAt,
    );
  }

  observations(childId?: string): MilestoneObservation[] {
    const rows = childId === undefined
      ? this.db.prepare('SELECT data FROM milestone_observations ORDER BY child_id, item_id').all()
      : this.db.prepare('SELECT data FROM milestone_observations WHERE child_id = ? ORDER BY item_id').all(childId);
    return rows.map((row) => JSON.parse(row.data as string) as MilestoneObservation);
  }

  putObservation(observation: MilestoneObservation): void {
    this.db.prepare(`INSERT INTO milestone_observations VALUES (?, ?, ?)
      ON CONFLICT(child_id, item_id) DO UPDATE SET data = excluded.data`)
      .run(observation.childId, observation.itemId, JSON.stringify(observation));
  }
}

function childRow(row: Row): ChildProfile {
  return {
    id: row.id as string, name: row.name as string, birthday: row.birthday as string,
    ...(row.nickname === null ? {} : { nickname: row.nickname as string }),
    ...(row.avatar === null ? {} : { avatar: row.avatar as string }),
    languageMode: row.language_mode as ChildProfile['languageMode'], showPinyin: Boolean(row.show_pinyin),
    screen: JSON.parse(row.screen_json as string), plan: JSON.parse(row.plan_json as string),
    createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  };
}

export function deviceRow(row: Row): DeviceInfo {
  return {
    id: row.id as string, name: row.name as string, kind: row.kind as string,
    childId: row.child_id as string | null, createdAt: row.created_at as string,
    lastSeenAt: row.last_seen_at as string | null,
  };
}

function sessionRow(row: Row): SessionRecord {
  const { deviceId: _, ...data } = JSON.parse(row.data as string) as SessionRecord;
  return { ...data, ...(row.device_id ? { deviceId: row.device_id as string } : {}) };
}
