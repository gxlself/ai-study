/**
 * @sprout/plugin-sdk — 活动插件运行时契约（v1）
 *
 * 播放端（host）负责：加载课程、按步骤挂载活动插件、提供 ActivityContext、处理遥控器/触屏输入、
 * 计时与屏幕时间、记录。活动插件只负责"在给定容器里渲染一个互动"。
 *
 * 契约框架无关：插件导出 mount(el, ctx)；内置活动用 React 实现（defineReactActivity 帮助函数），
 * 第三方插件可用任意技术栈（原生 DOM / Preact / Vue / Web Components），也可用宿主暴露的 React。
 *
 * ⚠️ 本文件是契约。修改需同步 docs/dev/plugin-guide.md，并提升 SDK_VERSION。
 */
import type {
  LanguageMode,
  Lang,
  LText,
  ResolvedConcept,
  ConceptRef,
  Speech,
} from '@sprout/schema';

export const SDK_VERSION = '1.0.0';

/** 统一的导航按键（遥控器方向键/OK/返回，键盘方向键/Enter/Escape，均映射到这里） */
export type NavKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

/** 主要输入方式（host 根据最近一次输入自动判定，插件据此调整提示文案，如"按 OK" vs "点一点"） */
export type InputMode = 'dpad' | 'touch' | 'pointer';

/** 柔和的合成音效（WebAudio 生成，音量低、无刺耳音） */
export type SfxName = 'pop' | 'chime' | 'tap' | 'whoosh' | 'success' | 'soft-no' | 'page';

export interface SpeakOptions {
  /** 覆盖语言模式（默认用孩子设置） */
  mode?: LanguageMode;
  /** 两种语言之间的停顿毫秒，默认 400 */
  gapMs?: number;
  /** 打断当前正在朗读的内容，默认 true */
  interrupt?: boolean;
}

export interface ActivityResult {
  /** 0-1，可选。仅用于家长报告，绝不展示为分数/排名给孩子 */
  accuracy?: number;
  /** 交互次数等任意数据 */
  data?: Record<string, unknown>;
}

/** host 解析后的概念（词库 id 或内联概念都统一成这个形状） */
export type ConceptView = Pick<
  ResolvedConcept,
  'zh' | 'en' | 'pinyin' | 'imageUrl' | 'sound' | 'phrase' | 'color' | 'value' | 'measure' | 'plural'
> & { id: string; category?: string };

export interface ActivityContext<P = Record<string, unknown>> {
  /** 已按 schema 补全默认值的 props */
  readonly props: P;
  readonly sdkVersion: string;
  readonly lesson: { id: string; title: LText; stepIndex: number; stepCount: number };
  readonly child: { name: string; ageMonths: number };
  readonly locale: {
    mode: LanguageMode;
    /** 显示用：按模式取主/副文本 */
    pick(t: LText | { zh?: string; en?: string }): { primary: string; secondary?: string };
    showPinyin: boolean;
  };
  /** 当前主要输入方式（会变化，可订阅） */
  readonly input: { readonly mode: InputMode; onChange(cb: (m: InputMode) => void): () => void };
  /** 是否减少动画（系统设置或家长设置） */
  readonly reducedMotion: boolean;

  // ---- 资源 ----
  /** 内容包相对路径 / http(s) URL → 可直接用于 <img src> 的 URL */
  resolveAsset(path: string): string;
  /** 词库 id 或内联概念 → ConceptView；未找到返回 undefined（插件应优雅降级） */
  concept(ref: ConceptRef): ConceptView | undefined;

  // ---- 声音 ----
  /** 朗读（按语言模式依次读 zh/en；有预生成音频用音频，否则 Web Speech，否则静默），读完 resolve */
  speak(s: Speech | string, opts?: SpeakOptions): Promise<void>;
  /** 朗读单一语言文本 */
  say(lang: Lang, text: string): Promise<void>;
  stopSpeaking(): void;
  sfx(name: SfxName): void;
  /** 播放任意音频 URL（如内容包内录音），结束 resolve */
  playAudio(url: string): Promise<void>;
  /** 共享 AudioContext（song 等需要合成音乐的活动使用；首次用户交互后才可发声） */
  audioContext(): AudioContext;

  // ---- 流程 ----
  /** 本步结束，host 进入下一步（多次调用只生效一次） */
  complete(result?: ActivityResult): void;
  /** 记录事件（写入 session.events，用于家长报告） */
  log(type: string, data?: Record<string, unknown>): void;
  /** 在家长提示条显示一句话（不朗读），传 null 清除 */
  setParentHint(text: string | null): void;

  // ---- 焦点（D-pad 空间导航）----
  /**
   * host 在活动容器内对带 `data-focusable` 属性的元素做空间导航；
   * 插件 DOM 变化后调用 refresh()；可主动 focus(el)。
   * 插件 onKey 返回 true 表示已处理，host 不再做默认导航。
   */
  readonly focus: {
    refresh(): void;
    focus(el: HTMLElement | null): void;
    current(): HTMLElement | null;
  };

  /** 本步被 host 中止（时间到/家长退出）时触发：插件应停止声音与计时 */
  readonly signal: AbortSignal;
}

export interface ActivityInstance {
  /** 卸载：清理 DOM、定时器、声音 */
  unmount(): void;
  /** 返回 true = 已处理；'back' 键一般不处理（交给 host 弹出家长门） */
  onKey?(key: NavKey): boolean;
  /** 屏幕时间到 / 切后台时 host 调用 */
  pause?(): void;
  resume?(): void;
}

export interface ActivityPlugin<P = any> {
  /** 内置无点号；第三方必须 vendor.name */
  type: string;
  version: string;
  name: LText;
  description?: LText;
  ageRange?: [number, number];
  /**
   * 可选：返回需要预加载的资源 URL（图片/音频），host 在进入课程前预取，
   * 避免在电视上出现"白屏等待"。
   */
  preload?(props: P, helpers: { resolveAsset(p: string): string; concept(ref: ConceptRef): ConceptView | undefined }): string[];
  /** 可选：返回会朗读的文本，供内容脚本 / 服务端 TTS 预生成音频 */
  speeches?(props: P): Speech[];
  /** 渲染到容器（容器为全屏舞台，16:9 自适应；插件不得操作容器外 DOM） */
  mount(el: HTMLElement, ctx: ActivityContext<P>): ActivityInstance | Promise<ActivityInstance>;
}

/** 远程插件模块的默认导出 */
export type PluginModuleExport = ActivityPlugin | ActivityPlugin[];

/** host 暴露在 globalThis.SproutHost 上的对象（第三方插件可复用宿主的 React，避免重复打包） */
export interface SproutHostGlobal {
  sdkVersion: string;
  React: unknown;
  ReactDOMClient: unknown;
  registerActivity(plugin: ActivityPlugin): void;
}

declare global {
  // eslint-disable-next-line no-var
  var SproutHost: SproutHostGlobal | undefined;
}
