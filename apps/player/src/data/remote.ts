import { localDateString, screenStatus } from '@sprout/core';
import {
  AudioManifest,
  Route,
  validateLesson,
  type ChildScreenSettings,
  type DeviceBootstrap,
  type LessonSummary,
  type PackInfo,
  type ResolvedConcept,
  type ScreenStatus,
  type SessionInput,
  type TodayPlan,
} from '@sprout/schema';
import { joinAsset, packSegment, remoteUrl, serverAsset } from './assets';
import { normalizeServer } from './connection';
import { DataSourceError, HttpError, RequestError, StorageError } from './errors';
import { JsonClient } from './http';
import {
  browserStorage,
  isRecord,
  parseStoredSessions,
  readJson,
  recentSessions,
  SessionIds,
  writeJson,
} from './storage';
import type { DataSource, DataStorage, LessonData, PackAudioManifest, RemoteSourceOptions } from './types';
import { legacyRemoteStateKey, remoteStateKey } from './identity';

interface RemoteState {
  version: 1;
  sessions: SessionInput[];
  pending: SessionInput[];
}

interface UsageSnapshot {
  date: string;
  screen: ScreenStatus;
  seenClientIds: Set<string>;
}

// 同一身份的实例共用上传锁；不同服务器、配对身份互不阻塞。
const uploads = new WeakMap<DataStorage, Map<string, Promise<void>>>();

export class RemoteSource implements DataSource {
  readonly kind = 'remote' as const;
  readonly server: string;
  readonly warnings: string[] = [];
  private readonly token: string;
  private readonly storage: DataStorage;
  private readonly client: JsonClient;
  private readonly now: () => Date;
  private readonly stateKey: string;
  private readonly legacyKey: string;
  private readonly preview: boolean;
  private readonly sessionIds = new SessionIds();
  private readonly bases = new Map<string, string>();
  private packs?: PackInfo[];
  private concepts: ResolvedConcept[] = [];
  private boundChildId: string | null | undefined;
  private readonly usage = new Map<string, UsageSnapshot>();
  private readonly plans = new Map<string, TodayPlan>();
  private readonly screenSettings = new Map<string, ChildScreenSettings>();

  constructor(server: string, token: string, options: RemoteSourceOptions = {}) {
    this.server = normalizeServer(server);
    this.token = token.trim();
    if (!this.token) throw new DataSourceError('invalid-token', '请先完成设备配对。');
    this.preview = options.preview === true;
    const memory = new Map<string, string>();
    this.storage = this.preview ? {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value); },
      removeItem: (key) => { memory.delete(key); },
    } : options.storage ?? browserStorage();
    this.client = new JsonClient(options);
    this.now = options.now ?? (() => new Date());
    this.stateKey = remoteStateKey(this.server, this.token);
    this.legacyKey = legacyRemoteStateKey(this.server, this.token);
  }

  private state(): RemoteState {
    let value = readJson(this.storage, this.stateKey);
    const legacy = readJson(this.storage, this.legacyKey);
    if (legacy !== null) {
      if (!isRecord(legacy) || legacy.version !== 1) throw new StorageError('旧待上传记录格式无效，未覆盖原记录。');
      const oldSessions = parseStoredSessions(legacy.sessions);
      const oldPending = parseStoredSessions(legacy.pending);
      if (oldPending.some((session) => !session.clientId)) throw new StorageError('旧待上传记录缺少去重标识。');
      if (value !== null && (!isRecord(value) || value.version !== 1)) throw new StorageError('本机待上传记录格式无效。');
      const current = value as RemoteState | null;
      value = {
        version: 1,
        sessions: recentSessions([...parseStoredSessions(current?.sessions ?? []), ...oldSessions]),
        pending: [...parseStoredSessions(current?.pending ?? []), ...oldPending],
      };
      // 先写新身份，成功后再删旧键；失败时不得丢失未补传记录。
      writeJson(this.storage, this.stateKey, value);
      this.storage.removeItem(this.legacyKey);
    }
    if (value === null) return { version: 1, sessions: [], pending: [] };
    if (!isRecord(value) || value.version !== 1) {
      throw new StorageError('本机待上传记录格式无效，原有记录未被覆盖。');
    }
    const pending = parseStoredSessions(value.pending);
    if (pending.some((session) => !session.clientId)) {
      throw new StorageError('待上传记录缺少去重标识，原有记录未被覆盖。');
    }
    const seen = new Set<string>();
    return {
      version: 1,
      sessions: recentSessions(parseStoredSessions(value.sessions)),
      pending: pending.filter((session) => {
        if (seen.has(session.clientId!)) return false;
        seen.add(session.clientId!);
        return true;
      }),
    };
  }

  private persist(state: RemoteState): void {
    writeJson(this.storage, this.stateKey, state);
  }

  private request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    if (this.preview && (method !== 'GET' || !/^\/api\/(?:lessons(?:\/[^/]+)?|lexicon|packs|plugins|routes(?:\/[^/]+)?|schemas)(?:\?|$)/.test(path))) {
      return Promise.reject(new DataSourceError('preview-read-only', '预览只能读取课程内容。'));
    }
    return this.client.request<T>(`${this.server}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private rememberPack(pack: PackInfo): PackInfo {
    const baseUrl = `${serverAsset(this.server, pack.baseUrl).replace(/\/+$/, '')}/`;
    this.bases.set(pack.id, baseUrl);
    return { ...pack, baseUrl };
  }

  private base(packId: string): string {
    return this.bases.get(packId) ?? `${this.server}/packs/${packSegment(packId)}/`;
  }

  private summary(lesson: LessonSummary): LessonSummary {
    if (!lesson.cover) return lesson;
    const image = lesson.cover.imageUrl ?? lesson.cover.image;
    const imageUrl = image
      ? this.resolveAsset(lesson.packId, image)
      : lesson.cover.concept ? this.resolveAsset(lesson.packId, `concept:${lesson.cover.concept}`) : '';
    return { ...lesson, cover: { ...lesson.cover, ...(imageUrl ? { imageUrl } : {}) } };
  }

  private async retryPending(): Promise<void> {
    try {
      await this.flush();
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
    }
  }

  private todaySessions(childId: string): SessionInput[] {
    const state = this.state();
    const now = this.now();
    const date = localDateString(now);
    const sessions = new Map<string, SessionInput>();
    for (const session of [...state.sessions, ...state.pending]) {
      if (
        session.audience !== 'parent' && session.childId === childId && Date.parse(session.startedAt) <= now.getTime() &&
        localDateString(new Date(session.startedAt)) === date
      ) sessions.set(session.clientId ?? JSON.stringify(session), session);
    }
    return [...sessions.values()];
  }

  private confirmedIds(): Set<string> {
    const state = this.state();
    const pending = new Set(state.pending.map((session) => session.clientId));
    return new Set(state.sessions
      .filter((session) => session.clientId && !pending.has(session.clientId))
      .map((session) => session.clientId!));
  }

  private mergeScreen(childId: string, screen: ScreenStatus, confirmed: Set<string>): ScreenStatus {
    if (
      !screen || !Number.isFinite(screen.usedSec) || screen.usedSec < 0 ||
      !Number.isFinite(screen.dailyMaxSec) || screen.dailyMaxSec < 0 ||
      !Number.isFinite(screen.sessionMaxSec) || screen.sessionMaxSec < 0 ||
      (screen.mode !== 'parent-only' && (screen.dailyMaxSec === 0 || screen.sessionMaxSec === 0)) ||
      typeof screen.allowedNow !== 'boolean' ||
      !['required', 'recommended', 'optional'].includes(screen.coView)
    ) {
      throw new RequestError('invalid-response', '服务器返回的屏幕时间状态无效。');
    }
    const sessions = this.todaySessions(childId);
    const total = sessions.reduce((sum, session) => sum + session.durationSec, 0);
    const extra = sessions.reduce((sum, session) => sum + (
      !session.clientId || !confirmed.has(session.clientId) ? session.durationSec : 0
    ), 0);
    const date = localDateString(this.now());
    const previous = this.usage.get(childId);
    const previousUsed = previous?.date === date
      ? previous.screen.usedSec + sessions.reduce((sum, session) => sum + (
        !session.clientId || !previous.seenClientIds.has(session.clientId) ? session.durationSec : 0
      ), 0)
      : 0;
    const usedSec = Math.max(screen.usedSec + extra, total, previousUsed);
    const result: ScreenStatus = screen.mode !== 'parent-only' && usedSec >= screen.dailyMaxSec
      ? { ...screen, usedSec, allowedNow: false, reason: 'daily-limit' }
      : { ...screen, usedSec };
    this.usage.set(childId, {
      date,
      screen: structuredClone(result),
      seenClientIds: new Set(sessions.flatMap((session) => session.clientId ? [session.clientId] : [])),
    });
    return result;
  }

  private offlineScreen(childId: string, error: unknown): ScreenStatus {
    const cached = this.usage.get(childId);
    const settings = this.screenSettings.get(childId);
    if (
      !(error instanceof RequestError) ||
      (error instanceof HttpError && error.status < 500) ||
      !cached || !settings || cached.date !== localDateString(this.now())
    ) throw error;
    const status = screenStatus({
      policy: {
        dailyMaxMin: cached.screen.dailyMaxSec / 60,
        sessionMaxMin: cached.screen.sessionMaxSec / 60,
        coView: cached.screen.coView,
        lessonsPerDay: 1,
      },
      windows: settings.windows,
      usedSec: cached.screen.usedSec,
      now: this.now(),
    });
    return this.mergeScreen(childId, { ...status, mode: cached.screen.mode }, cached.seenClientIds);
  }

  async bootstrap(): Promise<DeviceBootstrap> {
    const bootstrap = await this.request<DeviceBootstrap>('/api/device/bootstrap');
    this.boundChildId = bootstrap.device.childId;
    this.packs = bootstrap.packs.map((pack) => this.rememberPack(pack));
    if (bootstrap.child) this.screenSettings.set(bootstrap.child.id, structuredClone(bootstrap.child.screen));
    return {
      ...bootstrap,
      packs: this.packs,
      plugins: bootstrap.plugins.map((plugin) => ({
        ...plugin,
        ...(plugin.entryUrl ? { entryUrl: remoteUrl(this.server, plugin.entryUrl) } : {}),
      })),
    };
  }

  async today(childId: string): Promise<TodayPlan> {
    const confirmed = this.confirmedIds();
    try {
      const today = await this.request<TodayPlan>(`/api/children/${encodeURIComponent(childId)}/today`);
      const plan = {
        ...today,
        screen: this.mergeScreen(childId, today.screen, confirmed),
        items: today.items.map((item) => ({ ...item, lesson: this.summary(item.lesson) })),
      };
      this.plans.set(childId, structuredClone(plan));
      return plan;
    } catch (error) {
      const cached = this.plans.get(childId);
      if (!cached) throw error;
      return { ...structuredClone(cached), screen: this.offlineScreen(childId, error) };
    }
  }

  async screen(childId: string): Promise<ScreenStatus> {
    const confirmed = this.confirmedIds();
    try {
      const screen = await this.request<ScreenStatus>(`/api/children/${encodeURIComponent(childId)}/screen`);
      return this.mergeScreen(childId, screen, confirmed);
    } catch (error) {
      return this.offlineScreen(childId, error);
    }
  }

  async lessons(): Promise<LessonSummary[]> {
    const lessons = await this.request<LessonSummary[]>('/api/lessons');
    return lessons.map((lesson) => this.summary(lesson));
  }

  async routes(): Promise<Route[]> {
    const routes = await this.request<{ id: string }[]>('/api/routes');
    const ids = [...new Set(routes.map((route) => route.id))];
    return Promise.all(ids.map(async (id) => (
      Route.parse(await this.request<unknown>(`/api/routes/${encodeURIComponent(id)}`))
    )));
  }

  async lesson(id: string): Promise<LessonData> {
    const result = await this.request<LessonData>(`/api/lessons/${encodeURIComponent(id)}`);
    const validated = validateLesson(result.lesson);
    if (!validated.lesson || validated.issues.some((issue) => issue.level === 'error')) {
      throw new DataSourceError('invalid-lesson', '服务器返回的课程未通过校验。');
    }
    const baseUrl = `${serverAsset(this.server, result.baseUrl).replace(/\/+$/, '')}/`;
    this.bases.set(result.packId, baseUrl);
    return { lesson: validated.lesson, packId: result.packId, baseUrl };
  }

  async lexicon(): Promise<ResolvedConcept[]> {
    const concepts = await this.request<ResolvedConcept[]>('/api/lexicon');
    this.concepts = concepts.map((concept) => ({
      ...concept,
      imageUrl: this.resolveAsset(concept.packId, concept.imageUrl || concept.image),
    }));
    return structuredClone(this.concepts);
  }

  async selectChild(id: string): Promise<void> {
    await this.retryPending();
    await this.request<unknown>('/api/device/child', { childId: id }, 'PUT');
    this.boundChildId = id;
    await this.retryPending();
  }

  async saveSession(input: SessionInput): Promise<void> {
    if (this.preview) throw new DataSourceError('preview-read-only', '预览不保存学习记录。');
    const session = this.sessionIds.prepare(input, this.now());
    const state = this.state();
    if (
      !state.sessions.some((entry) => entry.clientId === session.clientId) &&
      !state.pending.some((entry) => entry.clientId === session.clientId)
    ) {
      state.sessions = recentSessions([session, ...state.sessions]);
      state.pending.push(session);
      this.persist(state);
    }
    await this.retryPending();
  }

  async recent(childId: string): Promise<SessionInput[]> {
    return this.state().sessions.filter((session) => session.childId === childId);
  }

  resolveAsset(packId: string, path: string): string {
    if (!path) return '';
    if (path.startsWith('concept:')) {
      const id = path.slice(8);
      const candidates = this.concepts.filter((concept) => concept.id === id);
      return (
        candidates.find((concept) => concept.packId === packId) ??
        candidates.find((concept) => concept.packId === 'sprout.core') ??
        candidates[0]
      )?.imageUrl ?? '';
    }
    if (path.startsWith('/') || /^https?:\/\//i.test(path)) return serverAsset(this.server, path);
    return joinAsset(this.base(packId), path);
  }

  async audioManifests(): Promise<PackAudioManifest[]> {
    if (!this.packs) {
      try {
        const packs = await this.request<PackInfo[]>('/api/packs');
        this.packs = packs.map((pack) => this.rememberPack(pack));
      } catch {
        this.warn('暂时无法读取音频包列表，将尝试系统朗读。');
        return [];
      }
    }
    const manifests = await Promise.all(this.packs.filter((pack) => pack.enabled).map(async (pack) => {
      try {
        const input = await this.client.request<unknown>(joinAsset(pack.baseUrl, 'audio/manifest.json'));
        return { packId: pack.id, baseUrl: pack.baseUrl, manifest: AudioManifest.parse(input) };
      } catch {
        this.warn(`内容包 ${pack.id} 的音频清单不可用，将尝试系统朗读。`);
        return null;
      }
    }));
    return manifests.filter((manifest): manifest is PackAudioManifest => manifest !== null);
  }

  private warn(message: string): void {
    if (this.warnings.includes(message)) return;
    this.warnings.push(message);
    console.warn(`[Sprout] ${message}`);
  }

  flush(): Promise<void> {
    if (this.preview) return Promise.resolve();
    let active = uploads.get(this.storage);
    if (!active) {
      active = new Map();
      uploads.set(this.storage, active);
    }
    const current = active.get(this.stateKey);
    if (current) return current;
    const operation = Promise.resolve().then(() => this.uploadPending()).finally(() => {
      if (active.get(this.stateKey) === operation) active.delete(this.stateKey);
    });
    active.set(this.stateKey, operation);
    return operation;
  }

  private async uploadPending(): Promise<void> {
    const attempted = new Set<string>();
    let failure: RequestError | undefined;
    while (true) {
      const session = this.state().pending.find((entry) => (
        !attempted.has(entry.clientId!) &&
        (this.boundChildId === undefined || entry.childId === this.boundChildId)
      ));
      if (!session) break;
      attempted.add(session.clientId!);
      try {
        await this.request<unknown>('/api/sessions', session);
        // 请求期间可能有新记录写入，确认成功后重新读取，只移除这一条。
        const state = this.state();
        state.pending = state.pending.filter((entry) => entry.clientId !== session.clientId);
        this.persist(state);
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
        failure ??= error;
        if (
          !(error instanceof HttpError) ||
          error.status >= 500 ||
          [401, 403, 408, 429].includes(error.status)
        ) break;
      }
    }
    if (failure) throw failure;
  }
}
