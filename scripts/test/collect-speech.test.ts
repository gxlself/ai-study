import { describe, expect, it } from 'vitest';
import {
  BUILTIN_ACTIVITY_TYPES,
  PHRASES,
  numberToEn,
  numberToZh,
  speechKey,
  validateLesson,
  type BuiltinActivityType,
  type Concept,
  type Lexicon,
} from '@sprout/schema';
import { collectSpeech, type SpeechEntry } from '../lib/collect-speech';

function concept(id: string, fields: Partial<Concept> = {}): Concept {
  return {
    id,
    category: 'toys',
    zh: '积木',
    en: 'block',
    image: `assets/${id}.svg`,
    ...fields,
  };
}

const block = concept('block', {
  measure: '块',
  sound: { zh: '咚咚', en: 'tap tap' },
  phrase: { zh: '积木叠高高', en: 'Stack the blocks.' },
});
const ball = concept('ball', { zh: '皮球', en: 'ball', measure: '个' });
const inline = {
  zh: '小手',
  en: 'hand',
  image: 'assets/hand.svg',
  sound: { zh: '拍拍', en: 'clap clap' },
  phrase: { zh: '小手拍一拍', en: 'Clap your hands.' },
};

function lesson(steps: readonly unknown[], fields: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'test.speech',
    title: { zh: '课程标题不朗读', en: 'Lesson metadata' },
    ageRange: [18, 30],
    domains: ['language'],
    durationMin: 3,
    coView: 'required',
    objectives: [{ zh: '目标不朗读', en: 'Objective metadata' }],
    parentGuide: { intro: '家长导语不朗读' },
    offline: [{ title: '线下活动不朗读', steps: ['和家长一起玩'] }],
    steps,
    ...fields,
  };
}

function collectActivity(type: string, props: unknown, fallbackConcepts: readonly Concept[] = [block, ball]) {
  return collectSpeech({
    lessons: [lesson([{ type, props }])],
    fallbackConcepts,
    includeCommon: false,
  });
}

function expectKeys(entries: SpeechEntry[], keys: readonly string[]) {
  expect(entries.map(({ key }) => key)).toEqual([...keys].sort());
}

const numberKeys = (count: number) =>
  Array.from({ length: count }, (_, index) => index + 1).flatMap((n) => [
    `zh:${numberToZh(n)}`,
    `en:${numberToEn(n)}`,
  ]);

const activityCases: {
  type: BuiltinActivityType;
  props: Record<string, unknown>;
  keys: string[];
}[] = [
  {
    type: 'contrast',
    props: { patterns: ['circle'], narration: { zh: '看圆圆', en: 'Look at the circle.' } },
    keys: ['zh:看圆圆', 'en:Look at the circle.'],
  },
  {
    type: 'word-cards',
    props: { items: ['block', inline], intro: { zh: '看看小手和积木' } },
    keys: ['zh:看看小手和积木', 'zh:积木', 'en:block', 'zh:小手', 'en:hand'],
  },
  {
    type: 'peekaboo',
    props: { items: [inline] },
    keys: ['zh:去哪儿啦？', 'en:Where did it go?', 'zh:在这儿！', 'en:Peekaboo!', 'zh:小手', 'en:hand'],
  },
  {
    type: 'bubbles',
    props: { items: ['block'] },
    keys: ['zh:积木', 'en:block'],
  },
  {
    type: 'count',
    props: { rounds: [{ item: 'block', count: 2 }] },
    keys: [...numberKeys(2), 'zh:一共两块积木', 'en:Two blocks!'],
  },
  {
    type: 'subitize',
    props: { rounds: [{ item: 'ball', count: 2 }] },
    keys: [...numberKeys(2), 'zh:一共两个皮球', 'en:Two balls!'],
  },
  {
    type: 'choose',
    props: {
      rounds: [{
        prompt: { zh: '找积木', en: 'Find the block.' },
        options: ['block', { id: 'hand', concept: inline }],
        answer: 'block',
        explain: { zh: '这是积木' },
      }],
    },
    keys: ['zh:找积木', 'en:Find the block.', 'zh:这是积木', 'zh:积木', 'en:block', 'zh:小手', 'en:hand'],
  },
  {
    type: 'sort',
    props: {
      prompt: { zh: '放进篮子', en: 'Put it in a basket.' },
      bins: [
        { id: 'a', label: { zh: '积木篮', en: 'Blocks' }, concept: 'ball' },
        { id: 'b', label: { zh: '小手篮', en: 'Hands' } },
      ],
      items: [{ item: 'block', bin: 'a' }, { item: inline, bin: 'b' }],
    },
    keys: [
      'zh:放进篮子', 'en:Put it in a basket.', 'zh:积木篮', 'en:Blocks', 'zh:小手篮', 'en:Hands',
      'zh:积木', 'en:block', 'zh:小手', 'en:hand',
    ],
  },
  {
    type: 'sequence',
    props: {
      intro: { zh: '一起洗手' },
      steps: [
        { concept: inline, caption: { zh: '只展示的字幕' }, say: { en: 'Wash your hands.' } },
        { concept: 'block', caption: { zh: '擦干', en: 'Dry your hands.' } },
      ],
    },
    keys: ['zh:一起洗手', 'en:Wash your hands.', 'zh:擦干', 'en:Dry your hands.'],
  },
  {
    type: 'pattern',
    props: {
      intro: { zh: '继续排一排' },
      rounds: [{ sequence: ['block', inline, 'block'], options: ['ball', 'unused'], answer: 'ball' }],
    },
    keys: ['zh:继续排一排', 'zh:积木', 'en:block', 'zh:小手', 'en:hand', 'zh:皮球', 'en:ball'],
  },
  {
    type: 'story',
    props: {
      title: { zh: '小手的故事', en: 'A story of hands' },
      cover: { sprites: [{ concept: 'ball', x: 50, y: 50 }] },
      pages: [{
        scene: { sprites: [{ concept: inline, x: 50, y: 50 }] },
        text: { zh: '我们一起玩', en: 'We play together.' },
        prompts: [{ kind: 'wh', zh: '家长提问不朗读', en: 'Parent prompt' }],
      }],
    },
    keys: ['zh:小手的故事', 'en:A story of hands', 'zh:我们一起玩', 'en:We play together.'],
  },
  {
    type: 'song',
    props: {
      title: { zh: '小手歌', en: 'A hand song' },
      credit: '署名不朗读',
      lines: [
        { lang: 'zh', text: '中文歌词不朗读', notes: 'C4/1 D4/1' },
        { lang: 'en', text: 'Lyrics are not speech', notes: 'C4/1 D4/1' },
      ],
      actions: [{ zh: '动作提示不朗读', en: 'Action cue' }],
      scene: { sprites: [{ concept: 'ball', x: 50, y: 50 }] },
    },
    keys: ['zh:小手歌', 'en:A hand song'],
  },
  {
    type: 'movement',
    props: {
      intro: { zh: '动一动', en: 'Move with me.' },
      moves: [{ concept: inline, name: { zh: '拍手', en: 'Clapping' }, say: { zh: '轻轻拍一拍' } }],
    },
    keys: ['zh:动一动', 'en:Move with me.', 'zh:拍手', 'en:Clapping', 'zh:轻轻拍一拍'],
  },
  {
    type: 'calm',
    props: { say: { zh: '慢慢来', en: 'Take it slowly.' } },
    keys: ['zh:慢慢来', 'en:Take it slowly.'],
  },
  {
    type: 'video',
    props: { src: 'assets/movie.mp4', title: { zh: '视频标题' }, captions: 'assets/captions.vtt' },
    keys: ['zh:视频标题'],
  },
  {
    type: 'web',
    props: { url: 'https://example.com/activity', title: { zh: '网页标题不朗读' } },
    keys: [],
  },
  {
    type: 'guide',
    props: {
      goal: '家长先看，放下屏幕陪玩',
      steps: [{ text: '拿起实体卡', concept: 'block', say: { zh: '家长自己说', en: 'A parent says this.' } }],
      observe: ['观察宝宝的回应'],
    },
    keys: [],
  },
];

describe('collectSpeech', () => {
  it('默认包含全部 PHRASES 与 1 到 10 唱数，不生成“零”或数量语境的“两”', () => {
    const expected = Object.values(PHRASES).flatMap((phrase) => [
      speechKey('zh', phrase.zh),
      speechKey('en', phrase.en),
    ]);
    expectKeys(collectSpeech({}), [...expected, ...numberKeys(10)]);
    expectKeys(collectSpeech({ lexicon: null }), [...expected, ...numberKeys(10)]);
    expect(collectSpeech({ includeCommon: false })).toEqual([]);
  });

  it('本包词库的名字、拟声和短句全部生成，未引用 fallback 不生成', () => {
    expectKeys(collectSpeech({
      lexicon: { schemaVersion: 1, concepts: [block] },
      fallbackConcepts: [ball],
      includeCommon: false,
    }), ['zh:积木', 'en:block', 'zh:咚咚', 'en:tap tap', 'zh:积木叠高高', 'en:Stack the blocks.']);
  });

  it('测试矩阵覆盖全部 17 个内置活动', () => {
    expect(activityCases.map(({ type }) => type)).toEqual(BUILTIN_ACTIVITY_TYPES);
  });

  it.each(activityCases)('$type 按契约提取字段并应用默认值', ({ type, props, keys }) => {
    const result = validateLesson(lesson([{ type, props }]));
    expect(result.issues.filter(({ level }) => level === 'error')).toEqual([]);
    expectKeys(collectActivity(type, props), keys);
  });

  it.each([
    { speak: 'name', extras: [] },
    { speak: 'name+sound', extras: ['zh:拍拍', 'en:clap clap'] },
    { speak: 'name+phrase', extras: ['zh:小手拍一拍', 'en:Clap your hands.'] },
    { speak: 'none', extras: [] },
  ])('word-cards speak=$speak 不多读其他字段', ({ speak, extras }) => {
    expectKeys(collectActivity('word-cards', {
      items: [inline],
      intro: { zh: '来看看' },
      speak,
      show: { text: false, english: false, pinyin: true },
    }), ['zh:来看看', ...(speak === 'none' ? [] : ['zh:小手', 'en:hand']), ...extras]);
  });

  it('fallback 的拟声和短句只在词卡对应 speak 模式引用时加入', () => {
    expectKeys(collectActivity('word-cards', { items: ['block'], speak: 'name+sound' }), [
      'zh:积木', 'en:block', 'zh:咚咚', 'en:tap tap',
    ]);
    expectKeys(collectActivity('word-cards', { items: ['block'], speak: 'name+phrase' }), [
      'zh:积木', 'en:block', 'zh:积木叠高高', 'en:Stack the blocks.',
    ]);
  });

  it('静音开关不影响词库全量采集，只影响课程引用', () => {
    const mutedLessons = [lesson([
      { type: 'word-cards', props: { items: ['block'], speak: 'none' } },
      { type: 'bubbles', props: { items: ['ball', inline], sayName: false } },
    ])];
    expect(collectSpeech({ lessons: mutedLessons, fallbackConcepts: [block, ball], includeCommon: false })).toEqual([]);
    expectKeys(collectSpeech({
      lexicon: { schemaVersion: 1, concepts: [ball] },
      lessons: mutedLessons,
      includeCommon: false,
    }), ['zh:皮球', 'en:ball']);
  });

  it('peekaboo 自定义单语 ask/reveal 替代默认文本，不补造另一语言', () => {
    expectKeys(collectActivity('peekaboo', {
      items: ['missing'],
      ask: { en: 'Where are you?' },
      reveal: { zh: '找到啦' },
    }), ['en:Where are you?', 'zh:找到啦']);
  });

  it('空 bubbles 与未指定 narration 的 contrast 不生成名称或旁白', () => {
    expect(collectActivity('bubbles', {})).toEqual([]);
    expect(collectActivity('contrast', { patterns: ['circle'] })).toEqual([]);
  });

  it('count cardinality=false 仍唱数，但不生成基数短句或词条名', () => {
    expectKeys(collectActivity('count', {
      rounds: [{ item: 'block', count: 2 }],
      cardinality: false,
    }), numberKeys(2));
  });

  it.each(['count', 'subitize'])('%s 正确区分唱数“二”和数量“两”，使用量词和不规则复数', (type) => {
    const books = concept('book', { zh: '书', en: 'book', measure: '本' });
    const mice = concept('mouse', { zh: '小老鼠', en: 'mouse', measure: '只', plural: 'mice' });
    expectKeys(collectActivity(type, {
      rounds: [{ item: 'book', count: 1 }, { item: 'mouse', count: 2 }],
    }, [books, mice]), [
      ...numberKeys(2), 'zh:一共一本书', 'en:One book!', 'zh:一共两只小老鼠', 'en:Two mice!',
    ]);
  });

  it.each([
    { en: 'bus', plural: undefined, expected: 'Two buses!' },
    { en: 'box', plural: undefined, expected: 'Two boxes!' },
    { en: 'baby', plural: undefined, expected: 'Two babies!' },
    { en: 'toy', plural: undefined, expected: 'Two toys!' },
    { en: 'sheep', plural: 'sheep', expected: 'Two sheep!' },
  ])('使用契约英文复数规则：$en', ({ en, plural, expected }) => {
    const item = concept('item', { zh: '物品', en, plural });
    expectKeys(collectActivity('count', { rounds: [{ item: 'item', count: 2 }] }, [item]), [
      ...numberKeys(2), 'zh:一共两个物品', `en:${expected}`,
    ]);
  });

  it.each(['count', 'subitize'])('%s 支持内联词条，缺英文时只生成中文基数', (type) => {
    expectKeys(collectActivity(type, {
      rounds: [
        { item: inline, count: 2 },
        { item: { zh: '小花', image: 'assets/flower.svg' }, count: 1 },
      ],
    }), [...numberKeys(2), 'zh:一共两个小手', 'en:Two hands!', 'zh:一共一个小花']);
  });

  it('subitize 无 item 只读数字，choices 不改变这一语义', () => {
    for (const choices of [true, false]) {
      expectKeys(collectActivity('subitize', { rounds: [{ count: 2 }], choices }), numberKeys(2));
    }
  });

  it('count 和 subitize 的缺失词条不生成伪造基数短句', () => {
    for (const type of ['count', 'subitize']) {
      expectKeys(collectActivity(type, { rounds: [{ item: 'missing', count: 2 }] }), numberKeys(2));
    }
  });

  it('choose 标签可作为缺失概念的可读名称，对象 id 不隐式引用词库', () => {
    expectKeys(collectActivity('choose', {
      rounds: [{
        prompt: { zh: '找一找' },
        options: [
          { id: 'block', image: 'assets/one.svg', label: { zh: '大的', en: 'Big' } },
          { id: 'other', concept: 'missing', label: { zh: '小的', en: 'Small' } },
        ],
        answer: 'block',
      }],
    }), ['zh:找一找', 'zh:大的', 'en:Big', 'zh:小的', 'en:Small']);
  });

  it('choose 有词条时读词条名，不额外读显示标签、拟声、短句', () => {
    expectKeys(collectActivity('choose', {
      rounds: [{
        prompt: { zh: '看一看' },
        options: [
          { id: 'one', concept: 'block', label: { zh: '展示标签' } },
          { id: 'two', image: 'assets/two.svg' },
        ],
        answer: 'one',
      }],
    }), ['zh:看一看', 'zh:积木', 'en:block']);
  });

  it('pattern 默认引导语、序列与补入的答案朗读，不读干扰选项', () => {
    expectKeys(collectActivity('pattern', {
      rounds: [{ sequence: ['block', 'block', 'block'], options: ['ball', 'unused'], answer: 'ball' }],
    }, [block, ball, concept('unused', { zh: '未使用', en: 'unused' })]), [
      'zh:接下来是什么？', 'en:What comes next?', 'zh:积木', 'en:block', 'zh:皮球', 'en:ball',
    ]);
  });

  it('story narrate=false 跳过该页文字，默认与显式 true 均朗读', () => {
    expectKeys(collectActivity('story', {
      title: { zh: '故事' },
      pages: [
        { scene: {}, text: { zh: '安静的一页', en: 'Silent page' }, narrate: false },
        { scene: {}, text: { zh: '默认朗读' } },
        { scene: {}, text: { en: 'Read aloud', zh: '明确朗读' }, narrate: true },
      ],
    }), ['zh:故事', 'zh:默认朗读', 'zh:明确朗读', 'en:Read aloud']);
  });

  it('calm 缺省 say 使用活动约定引导语，自定义 say 不叠加默认语', () => {
    expectKeys(collectActivity('calm', {}), ['zh:我们一起慢慢呼吸', 'en:Let’s breathe slowly']);
    expectKeys(collectActivity('calm', { say: { en: 'Rest now.' } }), ['en:Rest now.']);
  });

  it('课程/步骤元数据、家长内容和未约定字段全部排除', () => {
    expectKeys(collectSpeech({
      includeCommon: false,
      fallbackConcepts: [block],
      lessons: [lesson([{
        type: 'calm',
        title: { zh: '步骤标题', en: 'Step metadata' },
        parentTip: '步骤家长提示',
        props: { say: { zh: '给孩子听' }, narration: { zh: '未知字段' }, prompts: [{ zh: '未约定提示' }] },
      }], {
        summary: { zh: '课程简介', en: 'Summary' },
        cover: { concept: 'block' },
        parentGuide: {
          intro: '家长导语',
          tips: ['家长技巧'],
          phrases: [{ zh: '家长说的话', en: 'Parent phrase' }],
          why: '设计理念',
          refs: ['R1'],
        },
        offline: [{ title: '线下活动', steps: ['线下步骤'], safety: '家长安全提示' }],
      })],
    }), ['zh:给孩子听']);
  });

  it('fallback 只解析实际朗读引用，本包同 id 词条优先', () => {
    const fallbackBlock = concept('block', { zh: '核心积木', en: 'cube', measure: '个' });
    expectKeys(collectSpeech({
      includeCommon: false,
      lexicon: { schemaVersion: 1, concepts: [block] },
      fallbackConcepts: [fallbackBlock, ball, concept('unused', { zh: '未引用核心词', en: 'unused' })],
      lessons: [lesson([
        { type: 'word-cards', props: { items: ['block', 'ball'] } },
        { type: 'count', props: { rounds: [{ item: 'block', count: 2 }] } },
      ])],
    }), [
      'zh:积木', 'en:block', 'zh:咚咚', 'en:tap tap', 'zh:积木叠高高', 'en:Stack the blocks.',
      'zh:皮球', 'en:ball', ...numberKeys(2), 'zh:一共两块积木', 'en:Two blocks!',
    ]);
  });

  it('内联 id 与 fallback 相同时仍使用内联文本，缺英文不从同 id 词库补齐', () => {
    expectKeys(collectActivity('word-cards', {
      items: [{ id: 'block', zh: '我的积木', image: 'assets/my-block.svg' }],
    }), ['zh:我的积木']);
  });

  it('缺失引用不会导致同一步的显式朗读文本丢失', () => {
    expectKeys(collectActivity('choose', {
      rounds: [{
        prompt: { zh: '看看哪一个' },
        options: ['missing', 'block'],
        answer: 'missing',
        explain: { en: 'Here it is.' },
      }],
    }), ['zh:看看哪一个', 'en:Here it is.', 'zh:积木', 'en:block']);
  });

  it('空输入与结构错误课程安全跳过，不猜测不完整课程的字段', () => {
    expect(collectSpeech({
      includeCommon: false,
      lessons: [null, undefined, 42, '', [], {}, { steps: [] }, { steps: [{ type: 'calm', props: {} }] }],
    })).toEqual([]);
    expect(collectSpeech({
      includeCommon: false,
      lessons: [lesson([{ type: 'calm', props: {} }], { parentGuide: null })],
    })).toEqual([]);
  });

  it('结构损坏步骤、非法 props、未知类型和原型属性名不影响有效步骤', () => {
    expectKeys(collectSpeech({
      includeCommon: false,
      lessons: [lesson([
        null,
        { type: 'bubbles', props: [] },
        { type: 'count', props: { rounds: null } },
        { type: 'word-cards', props: { items: [null], intro: { zh: '坏步骤不读' } } },
        { type: 'constructor', props: { say: { zh: '原型名称不读' } } },
        { type: 'unknown', props: { say: { zh: '未知活动不读' } } },
        { type: 'example.custom', props: { say: { zh: '插件内容不猜测' } } },
        { type: 'contrast', props: { patterns: ['circle'], narration: { zh: '有效步骤' } } },
      ])],
    }), ['zh:有效步骤']);
  });

  it.each([
    {
      type: 'choose',
      props: { rounds: [{ prompt: { zh: '错误答案步骤' }, options: ['block', 'ball'], answer: 'absent' }] },
    },
    {
      type: 'pattern',
      props: {
        intro: { zh: '错误规律步骤' },
        rounds: [{ sequence: ['block', 'ball', 'block'], options: ['block', 'ball'], answer: 'absent' }],
      },
    },
    {
      type: 'sort',
      props: {
        prompt: { zh: '错误篮子步骤' },
        bins: [{ id: 'a', label: { zh: '甲' } }, { id: 'b', label: { zh: '乙' } }],
        items: [{ item: 'block', bin: 'absent' }, { item: 'ball', bin: 'a' }],
      },
    },
  ])('validateLesson 的 $type 语义错误使该步骤安全跳过', ({ type, props }) => {
    expectKeys(collectSpeech({
      includeCommon: false,
      fallbackConcepts: [block, ball],
      lessons: [lesson([
        { type, props },
        { type: 'calm', props: { say: { zh: '仍然保留' } } },
      ])],
    }), ['zh:仍然保留']);
  });

  it('只有 warning 的课程仍然采集', () => {
    expectKeys(collectSpeech({
      includeCommon: false,
      lessons: [lesson([{ type: 'calm', props: { say: { zh: '可以读' } } }], { ageRange: [18, 40] })],
    }), ['zh:可以读']);
  });

  it('家长指引课仅朗读 song 标题，不读 guide、歌词、打印卡和线下引导', () => {
    const parent = lesson([
      { type: 'guide', props: {
        goal: '家长准备好卡片', steps: [{ text: '指一指', concept: 'block', say: { zh: '这句只显示' } }],
      } },
      { type: 'song', props: { title: { zh: '一起轻轻唱', en: 'Sing together softly' }, lines: [
        { lang: 'zh', text: '这句歌词不读', notes: 'C4/1 D4/1' },
      ] } },
      { type: 'word-cards', props: { items: ['ball'], intro: { zh: '家长课非法活动不读' } } },
    ], {
      audience: 'parent', ageRange: [6, 12],
      printables: [{ kind: 'cards', title: '打印标题不读', items: [inline] }],
      offline: [{ title: '陪玩', steps: ['一起玩'], question: '开放问题不读', levels: { easier: '简化不读', harder: '进阶不读' } }],
    });
    expectKeys(collectSpeech({ lessons: [parent], fallbackConcepts: [block, ball], includeCommon: false }),
      ['zh:一起轻轻唱', 'en:Sing together softly']);
    expectKeys(collectSpeech({ lessons: [parent] }), [
      ...collectSpeech({}).map((entry) => entry.key), 'zh:一起轻轻唱', 'en:Sing together softly',
    ]);
  });

  it('parent 纯 guide 不增加朗读，但本包词库和 PHRASES 保持全量生成', () => {
    const parent = lesson([{ type: 'guide', props: {
      goal: '看看卡片', steps: [{ text: '指一指', concept: inline, say: { zh: '看看手' } }],
    } }], { audience: 'parent', ageRange: [6, 8] });
    expect(collectSpeech({ lessons: [parent], includeCommon: false })).toEqual([]);
    expect(collectSpeech({ lessons: [parent], lexicon: { schemaVersion: 1, concepts: [block] } }))
      .toEqual(collectSpeech({ lexicon: { schemaVersion: 1, concepts: [block] } }));
  });

  it('未声明 audience 视为 child，18月龄以下的非法 child 课程不产生朗读', () => {
    const child = lesson([{ type: 'calm', props: { say: { zh: '非法课程不读' } } }], { ageRange: [6, 12] });
    expect(collectSpeech({ lessons: [child], includeCommon: false })).toEqual([]);
  });

  it('损坏词库条目不会崩溃或覆盖有效 fallback', () => {
    expectKeys(collectSpeech({
      includeCommon: false,
      lexicon: {
        schemaVersion: 1,
        concepts: [null, 42, { ...block, en: 7 }, ball],
      } as unknown as Lexicon,
      fallbackConcepts: [null, { id: 'invalid' }, block] as unknown as readonly Concept[],
      lessons: [lesson([{ type: 'word-cards', props: { items: ['block'] } }])],
    }), ['zh:积木', 'en:block', 'zh:皮球', 'en:ball']);
    expect(collectSpeech({
      lexicon: { concepts: null } as unknown as Lexicon,
      lessons: null as unknown as readonly unknown[],
      fallbackConcepts: {} as readonly Concept[],
      includeCommon: false,
    })).toEqual([]);
  });

  it('speechKey 规范化 key 与 text，跨来源去重，保留语言和标点差异，跳过空白', () => {
    const spaced = concept('spaced', {
      zh: '  你好 \n 芽芽  ',
      en: '\tHello\n  Sprout ',
      sound: { zh: ' \t ', en: '' },
      phrase: { zh: '你好 芽芽', en: 'Hello Sprout' },
    });
    const entries = collectSpeech({
      lexicon: { schemaVersion: 1, concepts: [spaced] },
      includeCommon: false,
      lessons: [lesson([
        { type: 'calm', props: { say: { zh: 'Hello Sprout', en: ' Hello\tSprout ' } } },
        { type: 'contrast', props: { patterns: ['circle'], narration: { en: 'Hello Sprout!' } } },
      ])],
    });
    expect(entries).toEqual([
      { key: 'en:Hello Sprout', lang: 'en', text: 'Hello Sprout' },
      { key: 'en:Hello Sprout!', lang: 'en', text: 'Hello Sprout!' },
      { key: 'zh:Hello Sprout', lang: 'zh', text: 'Hello Sprout' },
      { key: 'zh:你好 芽芽', lang: 'zh', text: '你好 芽芽' },
    ]);
  });

  it('公共短句、数字、重复步骤和重复词条只保留一份音频', () => {
    const common = collectSpeech({});
    const repeatedLesson = lesson([
      { type: 'calm', props: { say: PHRASES.breatheIntro } },
      { type: 'calm', props: { say: PHRASES.breatheIntro } },
    ]);
    const numeral = concept('two', { zh: '二', en: 'two' });
    expect(collectSpeech({
      lexicon: { schemaVersion: 1, concepts: [numeral, numeral] },
      lessons: [repeatedLesson, repeatedLesson],
    })).toEqual(common);
  });

  it('结果按 key 稳定排序，与词库和课程输入顺序无关，且不修改输入', () => {
    const input = {
      lexicon: { schemaVersion: 1 as const, concepts: [block, ball] },
      fallbackConcepts: [concept('fallback')],
      lessons: activityCases.map(({ type, props }) => lesson([{ type, props }])),
    };
    const original = structuredClone(input);
    const entries = collectSpeech(input);
    expect(input).toEqual(original);
    expect(entries).toEqual(collectSpeech({
      ...input,
      lexicon: { ...input.lexicon, concepts: [...input.lexicon.concepts].reverse() },
      lessons: [...input.lessons].reverse(),
    }));
    expect(entries).toEqual(collectSpeech(input));
    expect(entries.map(({ key }) => key)).toEqual(entries.map(({ key }) => key).sort());
  });
});
