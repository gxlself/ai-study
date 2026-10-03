import {
  findStage,
  localDateString,
  planToday,
  resolveChildMode,
  resolveScreenPolicy,
  screenStatus,
  summarizeLesson,
} from '@sprout/core';
import {
  ageOf,
  BUILTIN_ACTIVITY_META,
  BUILTIN_ACTIVITY_TYPES,
  ChildInput,
  type ChildProfile,
  type DeviceBootstrap,
  type LessonSummary,
  type PackBundle,
  type PackInfo,
  type ResolvedConcept,
  type Route,
  type ScreenStatus,
  type SessionInput,
  type TodayPlan,
} from '@sprout/schema';
import { directoryUrl, joinAsset, packSegment } from './assets';
import { parseBundle } from './bundle';
import { DataSourceError, StorageError } from './errors';
import { JsonClient } from './http';
import {
  browserStorage,
  isRecord,
  newId,
  parseStoredChild,
  parseStoredSessions,
  readJson,
  recentSessions,
  SessionIds,
  validTimestamp,
  writeJson,
} from './storage';
import type { DataSource, DataStorage, LessonData, LocalSourceOptions, PackAudioManifest } from './types';

const STATE_KEY = 'sprout.local.state';
const DEFAULT_BUNDLE = './bundled/packs/sprout.core/bundle.json';

interface LocalState {
  version: 1;
  deviceId: string;
  createdAt: string;
  children: ChildProfile[];
  selectedChildId: string | null;
  sessions: SessionInput[];
}

export class LocalSource implements DataSource {
  readonly kind = 'local' as const;
  private readonly storage: DataStorage;
  private readonly client: JsonClient;
  private readonly now: () => Date;
  private readonly bundleUrl: string;
  private readonly baseUrl: string;
  private readonly sessionIds = new SessionIds();
  private bundlePromise?: Promise<PackBundle>;
  private bundleData?: PackBundle;

  constructor(options: LocalSourceOptions = {}) {
    this.storage = options.storage ?? browserStorage();
    this.client = new JsonClient(options);
    this.now = options.now ?? (() => new Date());
    this.bundleUrl = options.bundleUrl ?? DEFAULT_BUNDLE;
    this.baseUrl = directoryUrl(this.bundleUrl);
  }

  private state(): LocalState {
    const value = readJson(this.storage, STATE_KEY);
    if (value === null) {
      const now = this.now();
      const state: LocalState = {
        version: 1,
        deviceId: newId('local-device', now),
        createdAt: now.toISOString(),
        children: [],
        selectedChildId: null,
        sessions: [],
      };
      this.persist(state);
      return state;
    }
    if (
      !isRecord(value) || value.version !== 1 ||
      typeof value.deviceId !== 'string' || !validTimestamp(value.createdAt) ||
      !Array.isArray(value.children) ||
      (value.selectedChildId !== null && typeof value.selectedChildId !== 'string')
    ) {
      throw new StorageError('本机档案格式无效，原有档案未被覆盖。');
    }
    return {
      version: 1,
      deviceId: value.deviceId,
      createdAt: value.createdAt,
      children: value.children.map(parseStoredChild),
      selectedChildId: value.selectedChildId,
      sessions: recentSessions(parseStoredSessions(value.sessions)),
    };
  }

  private persist(state: LocalState): void {
    writeJson(this.storage, STATE_KEY, state);
  }

  private bundle(): Promise<PackBundle> {
    if (!this.bundlePromise) {
      this.bundlePromise = this.client.request<unknown>(this.bundleUrl).then(parseBundle).then((bundle) => {
        this.bundleData = bundle;
        return bundle;
      }).catch((error: unknown) => {
        this.bundlePromise = undefined;
        throw error;
      });
    }
    return this.bundlePromise;
  }

  private child(state: LocalState, id: string): ChildProfile {
    const child = state.children.find((entry) => entry.id === id);
    if (!child) throw new DataSourceError('child-not-found', '未找到孩子档案，请先添加或重新选择孩子。');
    return child;
  }

  private usedToday(sessions: SessionInput[], childId: string, now: Date): number {
    const today = localDateString(now);
    const parentIds = new Set(this.bundleData?.lessons.filter((lesson) => lesson.audience === 'parent').map((lesson) => lesson.id));
    return sessions.reduce((total, session) => (
      session.audience !== 'parent' && (session.audience === 'child' || !parentIds.has(session.lessonId)) &&
      session.childId === childId && Date.parse(session.startedAt) <= now.getTime() &&
      localDateString(new Date(session.startedAt)) === today
        ? total + session.durationSec
        : total
    ), 0);
  }

  private summarize(bundle: PackBundle): LessonSummary[] {
    const packId = bundle.manifest.id;
    return bundle.lessons.map((lesson) => {
      const summary = summarizeLesson(lesson, packId, (path) => this.resolveAsset(packId, path));
      if (summary.cover?.concept && !summary.cover.imageUrl) {
        const imageUrl = this.resolveAsset(packId, `concept:${summary.cover.concept}`);
        if (imageUrl) summary.cover = { ...summary.cover, imageUrl };
      }
      return summary;
    });
  }

  async bootstrap(): Promise<DeviceBootstrap> {
    const bundle = await this.bundle();
    const state = this.state();
    const child = state.children.find((entry) => entry.id === state.selectedChildId) ?? null;
    const { manifest } = bundle;
    const pack: PackInfo = {
      id: manifest.id,
      version: manifest.version,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      ageRange: manifest.ageRange,
      enabled: true,
      source: 'builtin',
      baseUrl: this.baseUrl,
      lessonCount: bundle.lessons.length,
      conceptCount: bundle.lexicon?.concepts.length ?? 0,
      routeIds: bundle.routes.map((route) => route.id),
      credits: manifest.credits,
    };
    const now = this.now().toISOString();
    return structuredClone({
      serverTime: now,
      device: {
        id: state.deviceId,
        name: '本机离线播放端',
        kind: 'browser',
        childId: child?.id ?? null,
        createdAt: state.createdAt,
        lastSeenAt: now,
      },
      child,
      children: state.children.map(({ id, name, nickname, avatar, birthday }) => ({ id, name, nickname, avatar, birthday })),
      packs: [pack],
      plugins: [{
        id: 'sprout.builtin',
        version: '1.0.0',
        name: { zh: '内置亲子活动', en: 'Built-in activities' },
        source: 'builtin' as const,
        enabled: true,
        activities: BUILTIN_ACTIVITY_TYPES.map((type) => {
          const { zh, en, ageRange } = BUILTIN_ACTIVITY_META[type];
          return { type, name: { zh, en }, ageRange };
        }),
        permissions: [],
      }],
      settings: { familyName: '我的家', ttsVoices: bundle.audio?.voices ?? {} },
    });
  }

  async saveChild(input: ChildInput, id?: string): Promise<ChildProfile> {
    const parsed = ChildInput.parse(input);
    const now = this.now();
    const [year, month, day] = parsed.birthday.split('-').map(Number);
    const birthday = new Date(year, month - 1, day);
    if (
      localDateString(birthday) !== parsed.birthday ||
      parsed.birthday > localDateString(now)
    ) {
      throw new DataSourceError('invalid-birthday', '请填写有效且不晚于今天的生日。');
    }
    const state = this.state();
    const previous = id === undefined ? undefined : this.child(state, id);
    const child: ChildProfile = {
      ...parsed,
      id: previous?.id ?? newId('local-child', now),
      createdAt: previous?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
    state.children = previous
      ? state.children.map((entry) => entry.id === child.id ? child : entry)
      : [...state.children, child];
    state.selectedChildId ??= child.id;
    this.persist(state);
    return structuredClone(child);
  }

  async selectChild(id: string): Promise<void> {
    const state = this.state();
    this.child(state, id);
    state.selectedChildId = id;
    this.persist(state);
  }

  async today(childId: string): Promise<TodayPlan> {
    const bundle = await this.bundle();
    const state = this.state();
    const child = this.child(state, childId);
    const route = bundle.routes.find((entry) => entry.id === child.plan.routeId);
    if (!route) throw new DataSourceError('route-not-found', '内置内容包中没有孩子选择的成长路线。');
    const date = this.now();
    const since = new Date(date);
    since.setDate(since.getDate() - 60);
    since.setHours(0, 0, 0, 0);
    const history = state.sessions.filter((session) => {
      const started = Date.parse(session.startedAt);
      return session.childId === childId && started >= since.getTime() && started <= date.getTime();
    });
    return planToday({
      route,
      lessons: Object.fromEntries(this.summarize(bundle).map((lesson) => [lesson.id, lesson])),
      child,
      history,
      date,
      usedSec: this.usedToday(state.sessions, childId, date),
    });
  }

  async screen(childId: string): Promise<ScreenStatus> {
    const bundle = await this.bundle();
    const state = this.state();
    const child = this.child(state, childId);
    const now = this.now();
    const route = bundle.routes.find((entry) => entry.id === child.plan.routeId);
    const stage = route ? findStage(route, ageOf(child.birthday, now).months) : null;
    const status = screenStatus({
      policy: resolveScreenPolicy(stage, child.screen, ageOf(child.birthday, now).months),
      windows: child.screen.windows,
      usedSec: this.usedToday(state.sessions, childId, now),
      now,
    });
    return { ...status, mode: resolveChildMode(stage, child, ageOf(child.birthday, now).months) };
  }

  async lessons(): Promise<LessonSummary[]> {
    return structuredClone(this.summarize(await this.bundle()));
  }

  async routes(): Promise<Route[]> {
    return structuredClone((await this.bundle()).routes);
  }

  async lesson(id: string): Promise<LessonData> {
    const bundle = await this.bundle();
    const lesson = bundle.lessons.find((entry) => entry.id === id);
    if (!lesson) throw new DataSourceError('lesson-not-found', '未找到这节课程。');
    return structuredClone({ lesson, packId: bundle.manifest.id, baseUrl: this.baseUrl });
  }

  async lexicon(): Promise<ResolvedConcept[]> {
    const bundle = await this.bundle();
    return structuredClone((bundle.lexicon?.concepts ?? []).map((concept) => ({
      ...concept,
      packId: bundle.manifest.id,
      imageUrl: this.resolveAsset(bundle.manifest.id, concept.image),
    })));
  }

  async saveSession(input: SessionInput): Promise<void> {
    const session = this.sessionIds.prepare(input, this.now());
    const state = this.state();
    this.child(state, session.childId);
    if (state.sessions.some((entry) => entry.clientId === session.clientId)) return;
    state.sessions = recentSessions([session, ...state.sessions]);
    this.persist(state);
  }

  async recent(childId: string): Promise<SessionInput[]> {
    return this.state().sessions.filter((entry) => entry.childId === childId);
  }

  resolveAsset(packId: string, path: string): string {
    if (!path) return '';
    if (path.startsWith('concept:')) {
      const concept = this.bundleData?.lexicon?.concepts.find((entry) => entry.id === path.slice(8));
      return concept ? this.resolveAsset(this.bundleData!.manifest.id, concept.image) : '';
    }
    const baseUrl = packId === (this.bundleData?.manifest.id ?? 'sprout.core')
      ? this.baseUrl
      : `./bundled/packs/${packSegment(packId)}/`;
    // Host 也会传回 lexicon.imageUrl，已解析路径必须保持幂等。
    if (path.startsWith(baseUrl)) return joinAsset(baseUrl, path.slice(baseUrl.length));
    return joinAsset(baseUrl, path);
  }

  async audioManifests(): Promise<PackAudioManifest[]> {
    const bundle = await this.bundle();
    return bundle.audio
      ? structuredClone([{ packId: bundle.manifest.id, baseUrl: this.baseUrl, manifest: bundle.audio }])
      : [];
  }

  async flush(): Promise<void> {}
}
