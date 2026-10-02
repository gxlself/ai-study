import {
  BUILTIN_ACTIVITY_PROPS,
  type BuiltinActivityType,
} from '@sprout/schema';
import type { ConceptView } from '@sprout/plugin-sdk';
import { webFixtureUrl } from './fixtures';

export const concepts: ConceptView[] = [
  {
    id: 'apple', category: 'fruits', zh: '苹果', en: 'apple', pinyin: 'píng guǒ',
    imageUrl: new URL('./assets/apple.svg', import.meta.url).href,
    measure: '个', plural: 'apples', color: '#e66d72',
    phrase: { zh: '苹果圆圆的', en: 'The apple is round.' },
  },
  {
    id: 'ball', category: 'toys', zh: '皮球', en: 'ball', pinyin: 'pí qiú',
    imageUrl: new URL('./assets/ball.svg', import.meta.url).href,
    measure: '个', plural: 'balls', color: '#5da9e9',
    sound: { zh: '咚咚咚', en: 'Bounce, bounce!' },
    phrase: { zh: '皮球滚过来', en: 'The ball rolls over.' },
  },
  {
    id: 'star', category: 'shapes', zh: '星星', en: 'star', pinyin: 'xīng xing',
    imageUrl: new URL('./assets/star.svg', import.meta.url).href,
    measure: '颗', plural: 'stars', color: '#f2b134',
    phrase: { zh: '星星在天上', en: 'The star is in the sky.' },
  },
  {
    id: 'flower', category: 'nature', zh: '小花', en: 'flower', pinyin: 'xiǎo huā',
    imageUrl: new URL('./assets/flower.svg', import.meta.url).href,
    measure: '朵', plural: 'flowers', color: '#e58cae',
    phrase: { zh: '小花轻轻摇', en: 'The flower sways gently.' },
  },
  {
    id: 'hands', category: 'actions', zh: '拍拍手', en: 'clap', pinyin: 'pāi pāi shǒu',
    imageUrl: new URL('./assets/hands.svg', import.meta.url).href,
  },
  {
    id: 'water', category: 'nature', zh: '清水', en: 'water', pinyin: 'qīng shuǐ',
    imageUrl: new URL('./assets/water.svg', import.meta.url).href,
    measure: '滴', plural: 'drops of water',
  },
  {
    id: 'towel', category: 'home', zh: '毛巾', en: 'towel', pinyin: 'máo jīn',
    imageUrl: new URL('./assets/towel.svg', import.meta.url).href,
    measure: '条', plural: 'towels',
  },
];

export type SampleProps = {
  [T in BuiltinActivityType]: ReturnType<(typeof BUILTIN_ACTIVITY_PROPS)[T]['parse']>;
};

const fixtureOrigin = typeof window === 'undefined' ? 'http://localhost:5312' : window.location.origin;

// 每种活动都从对应契约解析，嵌套默认值也由 schema 补齐。
export const samples: SampleProps = {
  contrast: BUILTIN_ACTIVITY_PROPS.contrast.parse({
    patterns: ['circle', 'stripes', 'face'],
    narration: { zh: '一起慢慢看', en: 'Let us look together.' },
  }),
  'word-cards': BUILTIN_ACTIVITY_PROPS['word-cards'].parse({
    items: ['apple', 'ball', 'flower'], speak: 'name+phrase',
    intro: { zh: '看看我们身边的东西', en: 'Look at the things around us.' },
  }),
  peekaboo: BUILTIN_ACTIVITY_PROPS.peekaboo.parse({
    items: ['ball', 'apple'], cover: 'leaf',
  }),
  bubbles: BUILTIN_ACTIVITY_PROPS.bubbles.parse({
    items: ['apple', 'star', 'flower'], pops: 4,
  }),
  count: BUILTIN_ACTIVITY_PROPS.count.parse({
    rounds: [
      { item: 'apple', count: 3 },
      { item: 'flower', count: 2, layout: 'dice' },
    ],
  }),
  subitize: BUILTIN_ACTIVITY_PROPS.subitize.parse({
    rounds: [{ item: 'ball', count: 2 }, { item: 'star', count: 3 }],
  }),
  choose: BUILTIN_ACTIVITY_PROPS.choose.parse({
    rounds: [
      {
        prompt: { zh: '苹果在哪里？', en: 'Where is the apple?' },
        options: ['apple', 'ball'], answer: 'apple',
        explain: { zh: '这是圆圆的苹果', en: 'Here is the round apple.' },
      },
      {
        prompt: { zh: '哪一边有两朵花？', en: 'Which side has two flowers?' },
        options: [
          { id: 'one', concept: 'flower', count: 1 },
          { id: 'two', concept: 'flower', count: 2 },
        ],
        answer: 'two',
      },
    ],
  }),
  sort: BUILTIN_ACTIVITY_PROPS.sort.parse({
    prompt: { zh: '放到一样的篮子里', en: 'Put it in the matching basket.' },
    bins: [
      { id: 'fruit', label: { zh: '苹果', en: 'Apples' }, concept: 'apple', color: '#f8d6d8' },
      { id: 'toy', label: { zh: '皮球', en: 'Balls' }, concept: 'ball', color: '#dff1fb' },
    ],
    items: [{ item: 'apple', bin: 'fruit' }, { item: 'ball', bin: 'toy' }],
  }),
  sequence: BUILTIN_ACTIVITY_PROPS.sequence.parse({
    intro: { zh: '洗完手再擦干', en: 'Wash, then dry our hands.' },
    steps: [
      { concept: 'water', caption: { zh: '清水洗一洗', en: 'Rinse with water.' } },
      { concept: 'towel', caption: { zh: '毛巾擦一擦', en: 'Dry with a towel.' } },
    ],
  }),
  pattern: BUILTIN_ACTIVITY_PROPS.pattern.parse({
    rounds: [{ sequence: ['apple', 'ball', 'apple'], options: ['apple', 'ball'], answer: 'ball' }],
  }),
  story: BUILTIN_ACTIVITY_PROPS.story.parse({
    title: { zh: '小花和皮球', en: 'The Flower and the Ball' },
    pages: [
      {
        scene: {
          bg: 'grass', ground: 'grass',
          sprites: [
            { concept: 'flower', x: 30, y: 58, size: 42, anim: 'sway' },
            { concept: 'ball', x: 70, y: 68, size: 28 },
          ],
        },
        text: { zh: '小花旁边有一个皮球。', en: 'A ball is beside the flower.' },
        prompts: [{ kind: 'point', zh: '皮球在哪里？', en: 'Where is the ball?' }],
      },
      {
        scene: {
          bg: 'sky', ground: 'grass',
          sprites: [{ concept: 'flower', x: 50, y: 55, size: 48, anim: 'sway' }],
        },
        text: { zh: '我们也向小花挥挥手。', en: 'Let us wave to the flower.' },
        prompts: [{ kind: 'distancing', zh: '窗外有什么花？', en: 'What flowers are outside?' }],
      },
    ],
  }),
  song: BUILTIN_ACTIVITY_PROPS.song.parse({
    title: { zh: '小星星', en: 'Twinkle, Twinkle' }, bpm: 80,
    credit: '传统旋律（公有领域）；本样例中文歌词为原创',
    lines: [
      { lang: 'zh', text: '小小星星亮晶晶', notes: 'C4/1 C4/1 G4/1 G4/1 A4/1 A4/1 G4/2' },
      { lang: 'en', text: 'Twinkle, twinkle, little star', notes: 'F4/1 F4/1 E4/1 E4/1 D4/1 D4/1 C4/2' },
    ],
    scene: { bg: 'sky', sprites: [{ concept: 'star', x: 50, y: 42, size: 35, anim: 'pulse' }] },
    actions: [{ zh: '轻轻拍拍手', en: 'Clap gently.' }],
  }),
  movement: BUILTIN_ACTIVITY_PROPS.movement.parse({
    moves: [
      {
        concept: 'hands', name: { zh: '拍拍手', en: 'Clap' },
        say: { zh: '和家长一起轻轻拍拍手', en: 'Clap gently with your grown-up.' },
        seconds: 6,
      },
      {
        concept: 'flower', name: { zh: '轻轻摇', en: 'Sway' },
        say: { zh: '坐稳，像小花一样轻轻摇', en: 'Sit safely and sway like a flower.' },
        seconds: 6,
      },
    ],
  }),
  calm: BUILTIN_ACTIVITY_PROPS.calm.parse({ visual: 'flower', cycles: 2 }),
  video: BUILTIN_ACTIVITY_PROPS.video.parse({
    src: new URL('./assets/quiet-shape.mp4', import.meta.url).href,
    poster: new URL('./assets/video-poster.svg', import.meta.url).href,
    captions: new URL('./assets/quiet-shape.vtt', import.meta.url).href,
    title: { zh: '草地上的方块', en: 'A Square on the Grass' }, maxSec: 10,
  }),
  web: BUILTIN_ACTIVITY_PROPS.web.parse({
    url: webFixtureUrl(fixtureOrigin),
    title: { zh: '和太阳打招呼', en: 'Hello, Sun' }, maxSec: 60,
  }),
  guide: BUILTIN_ACTIVITY_PROPS.guide.parse({
    goal: '轮流拍手，等待宝宝回应。',
    materials: ['柔软地垫'],
    steps: [{
      text: '和宝宝面对面，轻轻拍拍手，再停下来等回应。',
      say: { zh: '我拍拍，轮到你啦。', en: 'My turn. Your turn.' },
      image: new URL('./assets/hands.svg', import.meta.url).href,
    }],
    observe: ['留意宝宝的目光、笑容或动作。'],
    safety: '不拉拽宝宝的手臂，不想玩时就停下。',
    playMin: 1,
  }),
} satisfies Record<BuiltinActivityType, unknown>;
