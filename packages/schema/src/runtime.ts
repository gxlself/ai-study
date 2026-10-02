import { z } from 'zod';
import { Domain, LanguageMode, LText } from './common';
import type { LessonSummary } from './lesson';
import type { PackInfo } from './pack';
import type { PluginInfo } from './plugin';

/**
 * 运行时数据（服务端 DB ↔ 后台 ↔ 播放端）的契约。
 */

/** 允许使用屏幕的时间窗口（本地时间 HH:mm） */
export const TimeWindow = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});
export type TimeWindow = z.infer<typeof TimeWindow>;

export const ChildScreenSettings = z.object({
  /** null = 跟随阶段默认值 */
  sessionMaxMin: z.number().min(1).max(30).nullable().default(null),
  dailyMaxMin: z.number().min(1).max(60).nullable().default(null),
  /** 默认 08:00–18:30：睡前 1 小时与晚间不使用屏幕 */
  windows: z.array(TimeWindow).default([{ start: '08:00', end: '18:30' }]),
  /**
   * 孩子侧屏幕模式：auto（缺省）= 按阶段 childScreen；parent-only = 只出家长指引课；
   * co-view = 开启亲子共看课（18 月龄以下无效，强制 parent-only）
   */
  mode: z.enum(['auto', 'parent-only', 'co-view']).optional(),
  /** 开始前提醒"离屏幕远一点" */
  distanceReminder: z.boolean().default(true),
});
export type ChildScreenSettings = z.infer<typeof ChildScreenSettings>;

export const PlanOverrides = z.object({
  routeId: z.string().default('sprout.core.route'),
  /** 手动指定当前主题（null = 按月龄自动） */
  themeId: z.string().nullable().default(null),
  /** 置顶：每天都会出现在今日计划 */
  pinned: z.array(z.string()).default([]),
  /** 跳过：不再自动排入 */
  skipped: z.array(z.string()).default([]),
  /** 想多加强的领域 */
  focusDomains: z.array(Domain).default([]),
});
export type PlanOverrides = z.infer<typeof PlanOverrides>;

export const ChildInput = z.object({
  name: z.string().min(1).max(20),
  nickname: z.string().max(20).optional(),
  /** YYYY-MM-DD */
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 头像：词库 concept id（如 "bear"）或上传图片路径 */
  avatar: z.string().optional(),
  languageMode: LanguageMode.default('zh-en'),
  showPinyin: z.boolean().default(false),
  screen: ChildScreenSettings.default({
    sessionMaxMin: null,
    dailyMaxMin: null,
    windows: [{ start: '08:00', end: '18:30' }],
    distanceReminder: true,
  }),
  plan: PlanOverrides.default({
    routeId: 'sprout.core.route',
    themeId: null,
    pinned: [],
    skipped: [],
    focusDomains: [],
  }),
});
export type ChildInput = z.infer<typeof ChildInput>;

export interface ChildProfile extends ChildInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** 播放端上报的一次学习记录 */
export const SessionInput = z.object({
  childId: z.string(),
  lessonId: z.string(),
  /** ISO 时间 */
  startedAt: z.string(),
  endedAt: z.string(),
  /** 实际屏幕时长（秒，暂停不计） */
  durationSec: z.number().int().min(0).max(7200),
  completed: z.boolean(),
  /** 家长指引课不计入孩子屏幕时间；缺省 child */
  audience: z.enum(['parent', 'child']).optional(),
  stepsCompleted: z.number().int().min(0),
  stepsTotal: z.number().int().min(0),
  /** 客户端生成的去重 id（离线补传时防重复） */
  clientId: z.string().optional(),
  events: z
    .array(z.object({ t: z.number(), type: z.string(), data: z.unknown().optional() }))
    .max(500)
    .optional(),
});
export type SessionInput = z.infer<typeof SessionInput>;

export interface SessionRecord extends SessionInput {
  id: string;
  deviceId?: string;
  createdAt: string;
}

/** 屏幕时间状态 */
export interface ScreenStatus {
  usedSec: number;
  dailyMaxSec: number;
  sessionMaxSec: number;
  allowedNow: boolean;
  reason?: 'daily-limit' | 'outside-window';
  /** 下一个允许时间（本地 HH:mm），用于"休息啦"页面 */
  nextWindow?: string;
  coView: 'required' | 'recommended' | 'optional';
  /** 当前生效的孩子侧屏幕模式（播放端据此显示"家长指引首页"或"亲子共看首页"） */
  mode?: 'parent-only' | 'co-view';
}

export interface TodayPlanItem {
  lessonId: string;
  reason: 'theme' | 'review' | 'pinned' | 'balance';
  lesson: LessonSummary;
}

/** GET /api/children/:id/today 与 scheduler 输出 */
export interface TodayPlan {
  date: string;
  child: { id: string; name: string; ageMonths: number; ageDays: number };
  route: { id: string; title: LText };
  stage: { id: string; title: LText; ageRange: [number, number] } | null;
  theme: { id: string; title: LText; weekIndex: number; weeks: number } | null;
  items: TodayPlanItem[];
  screen: ScreenStatus;
}

// ---------------------------------------------------------------------------
// 里程碑

export const MilestoneDomain = z.enum(['social-emotional', 'language', 'cognitive', 'motor']);
export const MilestoneItem = z.object({
  id: z.string(),
  ageMonths: z.number().int(),
  domain: MilestoneDomain,
  zh: z.string(),
  en: z.string(),
  source: z.string(),
});
export type MilestoneItem = z.infer<typeof MilestoneItem>;

export const MilestonesFile = z.object({
  version: z.string(),
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
  disclaimer: z.object({ zh: z.string(), en: z.string() }),
  items: z.array(MilestoneItem),
});
export type MilestonesFile = z.infer<typeof MilestonesFile>;

export const MilestoneObservationInput = z.object({
  status: z.enum(['yes', 'emerging', 'not-yet']),
  note: z.string().max(500).optional(),
  /** YYYY-MM-DD */
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type MilestoneObservationInput = z.infer<typeof MilestoneObservationInput>;
export interface MilestoneObservation extends MilestoneObservationInput {
  childId: string;
  itemId: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 设备与播放端引导

export interface DeviceInfo {
  id: string;
  name: string;
  /** tv / tablet / browser */
  kind: string;
  childId: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

/** GET /api/device/bootstrap：播放端启动所需的一切 */
export interface DeviceBootstrap {
  serverTime: string;
  device: DeviceInfo;
  child: ChildProfile | null;
  children: Pick<ChildProfile, 'id' | 'name' | 'nickname' | 'avatar' | 'birthday'>[];
  packs: PackInfo[];
  plugins: PluginInfo[];
  /** 全局设置中播放端需要的部分 */
  settings: { familyName: string; ttsVoices: Record<string, string> };
}
