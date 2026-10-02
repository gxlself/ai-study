import {
  AudioManifest,
  ChildInput,
  Lesson,
  Lexicon,
  PackManifest,
  Route,
  type ChildProfile,
  type DeviceBootstrap,
  type PackBundle,
  type PackInfo,
  type ScreenStatus,
  type SessionInput,
  type TodayPlan,
} from '@sprout/schema';
import type { DataStorage } from '../types';

export const NOW = new Date(2026, 9, 2, 10);

export class MemoryStorage implements DataStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null { return this.items.get(key) ?? null; }
  setItem(key: string, value: string): void { this.items.set(key, value); }
  removeItem(key: string): void { this.items.delete(key); }
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

export function childInput(patch: Partial<ChildInput> = {}): ChildInput {
  return ChildInput.parse({ name: '芽芽', birthday: '2024-10-01', screen: { windows: [] }, ...patch });
}

export function childProfile(): ChildProfile {
  return { ...childInput(), id: 'child-1', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
}

export function session(patch: Partial<SessionInput> = {}): SessionInput {
  const started = new Date(NOW);
  started.setHours(9);
  return {
    childId: 'child-1',
    lessonId: 'core.test.words',
    clientId: 'session-1',
    startedAt: started.toISOString(),
    endedAt: new Date(started.getTime() + 60_000).toISOString(),
    durationSec: 60,
    completed: true,
    stepsCompleted: 1,
    stepsTotal: 1,
    ...patch,
  };
}

export function screen(patch: Partial<ScreenStatus> = {}): ScreenStatus {
  return {
    usedSec: 0,
    dailyMaxSec: 600,
    sessionMaxSec: 180,
    allowedNow: true,
    coView: 'required',
    ...patch,
  };
}

export function bundleFixture(): PackBundle {
  const concepts = ['apple', 'ball', 'block', 'sun', 'moon', 'flower'].map((id) => ({
    id, category: 'other', zh: id, en: id, image: `assets/${id}.svg`,
  }));
  const steps = [
    { type: 'word-cards', props: { items: ['apple', 'ball'] } },
    { type: 'count', props: { rounds: [{ item: 'block', count: 2 }] } },
    { type: 'choose', props: { rounds: [{ prompt: { zh: '找找太阳' }, options: ['sun', 'moon'], answer: 'sun' }] } },
  ];
  const lessons = ['words', 'count', 'choose'].map((slug, index) => Lesson.parse({
    schemaVersion: 1,
    id: `core.test.${slug}`,
    title: { zh: `开发测试 ${slug}`, en: slug },
    ageRange: [18, 36],
    domains: [index === 1 ? 'math' : 'language'],
    durationMin: 1,
    coView: 'required',
    objectives: [{ zh: '验证亲子流程' }],
    cover: index === 0 ? { concept: 'apple' } : { image: 'assets/block.svg' },
    parentGuide: { intro: '这是测试夹具，请家长陪同。' },
    offline: [{ title: '一起玩大积木', steps: ['关屏后，由家长陪同玩适龄大积木。'] }],
    steps: [steps[index]],
  }));
  return {
    schemaVersion: 1,
    builtAt: NOW.toISOString(),
    manifest: PackManifest.parse({
      schemaVersion: 1,
      id: 'sprout.core',
      version: '1.0.0',
      name: { zh: '单元测试夹具' },
      ageRange: [6, 36],
      routes: ['routes/main.json'],
    }),
    lexicon: Lexicon.parse({ schemaVersion: 1, concepts }),
    lessons,
    routes: [Route.parse({
      schemaVersion: 1,
      id: 'sprout.core.route',
      title: { zh: '测试路线' },
      stages: [{
        id: 'test-stage',
        title: { zh: '测试阶段' },
        ageRange: [18, 36],
        focus: [{ zh: '共同参与' }],
        screen: { sessionMaxMin: 3, dailyMaxMin: 10, lessonsPerDay: 2, coView: 'required' },
        themes: [{
          id: 'test-theme',
          title: { zh: '测试主题' },
          weeks: 2,
          domains: ['language', 'math'],
          lessons: lessons.map((lesson) => lesson.id),
        }],
      }],
    })],
    audio: AudioManifest.parse({
      schemaVersion: 1,
      voices: { zh: 'test-voice' },
      entries: { 'zh:苹果': 'audio/apple.m4a' },
    }),
  };
}

export function pack(patch: Partial<PackInfo> = {}): PackInfo {
  return {
    id: 'sprout.core', version: '1.0.0', name: { zh: '测试包' },
    ageRange: [6, 36], enabled: true, source: 'builtin',
    baseUrl: '/packs/sprout.core/', lessonCount: 3, conceptCount: 6,
    routeIds: ['sprout.core.route'], credits: [],
    ...patch,
  };
}

export function bootstrap(): DeviceBootstrap {
  const child = childProfile();
  return {
    serverTime: NOW.toISOString(),
    device: {
      id: 'device-1', name: '电视', kind: 'tv', childId: child.id,
      createdAt: NOW.toISOString(), lastSeenAt: NOW.toISOString(),
    },
    child,
    children: [child],
    packs: [pack()],
    plugins: [],
    settings: { familyName: '测试家庭', ttsVoices: {} },
  };
}

export function plan(status = screen()): TodayPlan {
  return {
    date: '2026-10-02',
    child: { id: 'child-1', name: '芽芽', ageMonths: 24, ageDays: 731 },
    route: { id: 'sprout.core.route', title: { zh: '测试路线' } },
    stage: null, theme: null, items: [], screen: status,
  };
}

export function remoteState(storage: MemoryStorage): {
  version: 1; sessions: SessionInput[]; pending: SessionInput[];
} {
  const entry = [...storage.items].find(([key]) => key.startsWith('sprout.remote:'));
  if (!entry) throw new Error('remote state missing');
  return JSON.parse(entry[1]);
}
