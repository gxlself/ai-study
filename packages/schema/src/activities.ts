import { z } from 'zod';
import { LText, Lang, Speech } from './common';
import { ConceptRef } from './lexicon';

/**
 * 内置互动活动（Activity）的 props 契约。
 * 一节课 = 若干步骤（ActivityStep），每步由一个"活动插件"渲染，type 对应插件。
 * - 内置活动 type 不含点号（如 "word-cards"）
 * - 第三方插件 type 必须带命名空间点号（如 "acme.puzzle"），props 由其 plugin.json 中的 JSON Schema 校验
 *
 * 设计原则（来自循证研究，见 docs/research/evidence-review.md）：
 * 慢节奏、无自动连播、可由家长/孩子按键推进（互动响应）、错误反馈温和、不设积分排名。
 */

/** 场景精灵：用词库图片或资源图片在舞台上摆位，构成绘本/儿歌画面 */
export const Sprite = z
  .object({
    concept: ConceptRef.optional(),
    image: z.string().optional(),
    /** 中心点横坐标，舞台宽度百分比 0-100 */
    x: z.number().min(0).max(100),
    /** 中心点纵坐标，舞台高度百分比 0-100 */
    y: z.number().min(0).max(100),
    /** 尺寸：舞台高度百分比 */
    size: z.number().min(2).max(100).default(30),
    flip: z.boolean().optional(),
    /** 缓慢的循环动画（不用快速闪烁） */
    anim: z.enum(['none', 'bob', 'sway', 'hop', 'pulse', 'float', 'spin-slow']).default('none'),
    /** 入场延迟（秒） */
    delay: z.number().min(0).max(10).optional(),
    z: z.number().int().optional(),
  })
  .refine((s) => !!(s.concept || s.image), { message: 'sprite 需要 concept 或 image' });
export type Sprite = z.infer<typeof Sprite>;

export const SCENE_BACKGROUNDS = ['sky', 'grass', 'night', 'sea', 'room', 'sunset', 'snow', 'paper', 'forest'] as const;
export const Scene = z.object({
  /** 预设背景名或 CSS 颜色 */
  bg: z.string().default('sky'),
  ground: z.enum(['none', 'grass', 'sand', 'water', 'floor', 'snow']).default('none'),
  sprites: z.array(Sprite).default([]),
});
export type Scene = z.infer<typeof Scene>;

// ---------------------------------------------------------------------------
// 1. contrast 高对比视觉卡（6-9 月）：黑白 / 黑白红几何图形，缓慢移动
export const ContrastProps = z.object({
  patterns: z
    .array(
      z.enum([
        'bullseye', 'stripes', 'checker', 'dots', 'face', 'spiral', 'zigzag',
        'circle', 'square', 'triangle', 'star', 'heart',
      ]),
    )
    .min(1)
    .max(12),
  palette: z.enum(['bw', 'bwr']).default('bw'),
  motion: z.enum(['none', 'drift', 'pulse', 'rotate']).default('drift'),
  secondsPerPattern: z.number().min(3).max(20).default(8),
  narration: Speech.optional(),
});

// 2. word-cards 图像词卡：一张一张看，按 OK/点按 朗读（中英按语言模式）
export const WordCardsProps = z.object({
  items: z.array(ConceptRef).min(1).max(12),
  show: z
    .object({
      text: z.boolean().default(true),
      english: z.boolean().default(true),
      pinyin: z.boolean().default(false),
    })
    .default({ text: true, english: true, pinyin: false }),
  speak: z.enum(['name', 'name+sound', 'name+phrase', 'none']).default('name'),
  /** null = 手动翻页（默认）；数字 = 每张停留秒数（>=4，避免快速闪卡） */
  autoAdvanceSec: z.number().min(4).max(30).nullable().default(null),
  intro: Speech.optional(),
});

// 3. peekaboo 躲猫猫（物体恒存，8-15 月）
export const PeekabooProps = z.object({
  items: z.array(ConceptRef).min(1).max(6),
  cover: z.enum(['hands', 'curtain', 'box', 'leaf', 'cloud']).default('curtain'),
  hideSec: z.number().min(1).max(6).default(2),
  ask: Speech.default({ zh: '去哪儿啦？', en: 'Where did it go?' }),
  reveal: Speech.default({ zh: '在这儿！', en: 'Peekaboo!' }),
});

// 4. bubbles 泡泡因果（9-18 月）：按一下戳破一个泡泡，里面出现一个事物；数量有限，结束即停
export const BubblesProps = z.object({
  items: z.array(ConceptRef).max(12).default([]),
  pops: z.number().int().min(3).max(20).default(8),
  sayName: z.boolean().default(true),
  speed: z.enum(['slow', 'normal']).default('slow'),
});

// 5. count 数一数：一一对应 + 基数原则（"一共三只"）
export const CountProps = z.object({
  rounds: z
    .array(
      z.object({
        item: ConceptRef,
        count: z.number().int().min(1).max(10),
        layout: z.enum(['row', 'scatter', 'dice', 'ten-frame']).default('row'),
      }),
    )
    .min(1)
    .max(5),
  showNumeral: z.boolean().default(true),
  cardinality: z.boolean().default(true),
  /** guided：按 OK 数下一个（推荐，孩子/家长参与）；auto：每 1.5 秒自动数一个 */
  mode: z.enum(['guided', 'auto']).default('guided'),
});

// 6. subitize 一眼看出几个（24 月+，1-4 为主）
export const SubitizeProps = z.object({
  rounds: z
    .array(
      z.object({
        count: z.number().int().min(1).max(6),
        item: ConceptRef.optional(),
        arrangement: z.enum(['dice', 'line', 'random']).default('dice'),
      }),
    )
    .min(1)
    .max(6),
  showSec: z.number().min(2).max(10).default(3),
  choices: z.boolean().default(true),
});

// 7. choose 找一找（指认 / 颜色 / 形状 / 大小 / 多少）：无错误学习，温和提示
export const ChooseOption = z.object({
  id: z.string().min(1),
  concept: ConceptRef.optional(),
  image: z.string().optional(),
  label: LText.optional(),
  count: z.number().int().min(1).max(10).optional(),
  scale: z.number().min(0.3).max(1.5).optional(),
  tint: z.string().optional(),
});
export const ChooseProps = z.object({
  rounds: z
    .array(
      z.object({
        prompt: Speech,
        /** 字符串 = 词库 id（option.id 即该 id） */
        options: z.array(z.union([z.string(), ChooseOption])).min(2).max(4),
        answer: z.string().min(1),
        explain: Speech.optional(),
      }),
    )
    .min(1)
    .max(8),
  showLabels: z.boolean().default(false),
  hintAfter: z.number().int().min(1).max(3).default(2),
});

// 8. sort 分一分（24 月+）：2-3 个篮子
export const SortProps = z.object({
  prompt: Speech,
  bins: z
    .array(
      z.object({
        id: z.string().min(1),
        label: LText,
        concept: ConceptRef.optional(),
        image: z.string().optional(),
        color: z.string().optional(),
      }),
    )
    .min(2)
    .max(3),
  items: z.array(z.object({ item: ConceptRef, bin: z.string().min(1) })).min(2).max(10),
});

// 9. sequence 顺序 / 生活常规（洗手、刷牙、穿衣）
export const SequenceProps = z.object({
  mode: z.enum(['show', 'order']).default('show'),
  intro: Speech.optional(),
  steps: z
    .array(
      z
        .object({
          concept: ConceptRef.optional(),
          image: z.string().optional(),
          caption: LText,
          say: Speech.optional(),
        })
        .refine((s) => !!(s.concept || s.image), { message: 'step 需要 concept 或 image' }),
    )
    .min(2)
    .max(6),
});

// 10. pattern 找规律 ABAB（30 月+）
export const PatternProps = z.object({
  intro: Speech.optional(),
  rounds: z
    .array(
      z.object({
        sequence: z.array(ConceptRef).min(3).max(8),
        options: z.array(z.string()).min(2).max(3),
        answer: z.string().min(1),
      }),
    )
    .min(1)
    .max(5),
});

// 11. story 绘本：场景 + 双语文字 + 对话式阅读提问（给家长）
export const DialogicPrompt = z.object({
  /** CROWD：completion 填空 / recall 回忆 / open 开放 / wh 什么谁哪里 / distancing 联系生活；point 指一指 */
  kind: z.enum(['completion', 'recall', 'open', 'wh', 'distancing', 'point']),
  zh: z.string().min(1),
  en: z.string().optional(),
});
export const StoryProps = z.object({
  title: LText,
  cover: Scene.optional(),
  pages: z
    .array(
      z.object({
        scene: Scene,
        text: LText,
        narrate: z.boolean().default(true),
        prompts: z.array(DialogicPrompt).max(3).optional(),
      }),
    )
    .min(1)
    .max(16),
});

// 12. song 儿歌（公有领域旋律，WebAudio 合成；家长跟唱）
/** 音符记法：空格分隔的 "音高/拍数"，音高如 C4、F#4、Bb3，R 为休止；如 "C4/1 C4/1 G4/1 G4/1 A4/1 A4/1 G4/2" */
export const NoteString = z
  .string()
  .regex(/^((?:[A-G](?:#|b)?[2-6]|R)\/(?:\d+(?:\.\d+)?)\s*)+$/, '音符格式："C4/1 D4/0.5 R/1"');
export const SongProps = z.object({
  title: LText,
  credit: z.string().default('传统儿歌（公有领域）/ Traditional, public domain'),
  bpm: z.number().min(50).max(140).default(90),
  instrument: z.enum(['musicbox', 'marimba', 'flute', 'piano']).default('musicbox'),
  lines: z
    .array(z.object({ lang: Lang, text: z.string().min(1), notes: NoteString }))
    .min(1)
    .max(24),
  scene: Scene.optional(),
  repeat: z.number().int().min(1).max(3).default(1),
  actions: z.array(LText).max(6).optional(),
});

// 13. movement 动一动（离开沙发跟着做）
export const MovementProps = z.object({
  intro: Speech.optional(),
  moves: z
    .array(
      z
        .object({
          concept: ConceptRef.optional(),
          image: z.string().optional(),
          name: LText,
          say: Speech,
          seconds: z.number().min(3).max(30).default(8),
        })
        .refine((s) => !!(s.concept || s.image), { message: 'move 需要 concept 或 image' }),
    )
    .min(1)
    .max(8),
  bpm: z.number().min(50).max(140).optional(),
});

// 14. calm 安静时刻（呼吸 / 收尾），用于结束一次屏幕时间
export const CalmProps = z.object({
  visual: z.enum(['balloon', 'star', 'flower', 'moon']).default('balloon'),
  cycles: z.number().int().min(2).max(8).default(4),
  inhaleSec: z.number().min(2).max(6).default(3),
  exhaleSec: z.number().min(2).max(8).default(4),
  say: Speech.optional(),
});

// 15. video 视频（预留：后续接入的视频内容；不自动连播）
export const VideoProps = z.object({
  src: z.string().min(1),
  poster: z.string().optional(),
  title: LText.optional(),
  captions: z.string().optional(),
  maxSec: z.number().int().min(10).max(1200).optional(),
});

// 16. web 网页 H5（预留：iframe 沙箱，postMessage {type:"sprout:complete"} 结束）
export const WebProps = z.object({
  url: z.string().url(),
  title: LText.optional(),
  maxSec: z.number().int().min(10).max(1800).optional(),
  allowFullscreen: z.boolean().default(false),
});

/** 内置活动 type → props schema */
export const BUILTIN_ACTIVITY_PROPS = {
  contrast: ContrastProps,
  'word-cards': WordCardsProps,
  peekaboo: PeekabooProps,
  bubbles: BubblesProps,
  count: CountProps,
  subitize: SubitizeProps,
  choose: ChooseProps,
  sort: SortProps,
  sequence: SequenceProps,
  pattern: PatternProps,
  story: StoryProps,
  song: SongProps,
  movement: MovementProps,
  calm: CalmProps,
  video: VideoProps,
  web: WebProps,
} as const;
export type BuiltinActivityType = keyof typeof BUILTIN_ACTIVITY_PROPS;
export const BUILTIN_ACTIVITY_TYPES = Object.keys(BUILTIN_ACTIVITY_PROPS) as BuiltinActivityType[];

export const BUILTIN_ACTIVITY_META: Record<BuiltinActivityType, { zh: string; en: string; ageRange: [number, number] }> = {
  contrast: { zh: '高对比视觉', en: 'High Contrast', ageRange: [6, 12] },
  'word-cards': { zh: '图像词卡', en: 'Word Cards', ageRange: [6, 36] },
  peekaboo: { zh: '躲猫猫', en: 'Peekaboo', ageRange: [7, 18] },
  bubbles: { zh: '戳泡泡', en: 'Bubbles', ageRange: [9, 24] },
  count: { zh: '数一数', en: 'Counting', ageRange: [15, 36] },
  subitize: { zh: '一眼看出几个', en: 'Quick Look', ageRange: [24, 36] },
  choose: { zh: '找一找', en: 'Find It', ageRange: [12, 36] },
  sort: { zh: '分一分', en: 'Sorting', ageRange: [24, 36] },
  sequence: { zh: '排顺序', en: 'Sequence', ageRange: [18, 36] },
  pattern: { zh: '找规律', en: 'Patterns', ageRange: [30, 36] },
  story: { zh: '绘本故事', en: 'Story', ageRange: [9, 36] },
  song: { zh: '儿歌', en: 'Song', ageRange: [6, 36] },
  movement: { zh: '动一动', en: 'Move', ageRange: [9, 36] },
  calm: { zh: '安静时刻', en: 'Calm', ageRange: [12, 36] },
  video: { zh: '视频', en: 'Video', ageRange: [18, 36] },
  web: { zh: '网页互动', en: 'Web', ageRange: [24, 36] },
};

export type ContrastProps = z.infer<typeof ContrastProps>;
export type WordCardsProps = z.infer<typeof WordCardsProps>;
export type PeekabooProps = z.infer<typeof PeekabooProps>;
export type BubblesProps = z.infer<typeof BubblesProps>;
export type CountProps = z.infer<typeof CountProps>;
export type SubitizeProps = z.infer<typeof SubitizeProps>;
export type ChooseOption = z.infer<typeof ChooseOption>;
export type ChooseProps = z.infer<typeof ChooseProps>;
export type SortProps = z.infer<typeof SortProps>;
export type SequenceProps = z.infer<typeof SequenceProps>;
export type PatternProps = z.infer<typeof PatternProps>;
export type DialogicPrompt = z.infer<typeof DialogicPrompt>;
export type StoryProps = z.infer<typeof StoryProps>;
export type SongProps = z.infer<typeof SongProps>;
export type MovementProps = z.infer<typeof MovementProps>;
export type CalmProps = z.infer<typeof CalmProps>;
export type VideoProps = z.infer<typeof VideoProps>;
export type WebProps = z.infer<typeof WebProps>;
