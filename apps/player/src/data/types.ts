import type {
  AudioManifest,
  DeviceBootstrap,
  Lesson,
  LessonSummary,
  ResolvedConcept,
  Route,
  ScreenStatus,
  SessionInput,
  TodayPlan,
} from '@sprout/schema';

export interface Connection {
  kind: 'local' | 'remote';
  server?: string;
  token?: string;
}

export type DataStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface DataSourceOptions {
  storage?: DataStorage;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /** 包括读取响应体的超时，默认 10 秒。 */
  timeoutMs?: number;
}

export interface LocalSourceOptions extends DataSourceOptions {
  bundleUrl?: string;
}

export interface RemoteSourceOptions extends DataSourceOptions {
  /** 预览凭据与临时状态只在内存中，禁止设备和记录写接口。 */
  preview?: boolean;
}

export interface LessonData {
  lesson: Lesson;
  packId: string;
  baseUrl: string;
}

export interface PackAudioManifest {
  packId: string;
  baseUrl: string;
  manifest: AudioManifest;
}

export interface DataSource {
  readonly kind: 'local' | 'remote';
  bootstrap(): Promise<DeviceBootstrap>;
  today(childId: string): Promise<TodayPlan>;
  screen(childId: string): Promise<ScreenStatus>;
  lessons(): Promise<LessonSummary[]>;
  routes(): Promise<Route[]>;
  lesson(id: string): Promise<LessonData>;
  lexicon(): Promise<ResolvedConcept[]>;
  selectChild(id: string): Promise<void>;
  /** 先持久化；远程上传失败留在队列，不阻止课程结束。存储失败仍会 reject。 */
  saveSession(input: SessionInput): Promise<void>;
  recent(childId: string): Promise<SessionInput[]>;
  resolveAsset(packId: string, path: string): string;
  audioManifests(): Promise<PackAudioManifest[]>;
  /** 上传失败保留队列并 reject；本地数据源无需补传。 */
  flush(): Promise<void>;
}
