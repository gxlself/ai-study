import dayjs from 'dayjs';
import {
  BUILTIN_ACTIVITY_META, BUILTIN_ACTIVITY_TYPES, ChildInput,
  type ChildProfile, type Lesson, type PackInfo, type PluginInfo, type ResolvedConcept, type Route,
  type MilestoneItem, type SessionRecord, type DeviceInfo,
} from '@sprout/schema';

// 仅用于 ?mock=1 的开发验收，不作为正式内容或家庭记录。
function illustration(color: string, shape: 'circle' | 'square' | 'animal') {
  const graphic = shape === 'circle' ? `<circle cx="64" cy="64" r="38" fill="${color}"/>`
    : shape === 'square' ? `<rect x="26" y="26" width="76" height="76" rx="8" fill="${color}"/>`
      : `<circle cx="36" cy="36" r="18" fill="${color}"/><circle cx="92" cy="36" r="18" fill="${color}"/><ellipse cx="64" cy="72" rx="43" ry="42" fill="${color}"/><circle cx="48" cy="67" r="4" fill="#283a38"/><circle cx="80" cy="67" r="4" fill="#283a38"/><ellipse cx="64" cy="86" rx="13" ry="10" fill="#fff"/><circle cx="64" cy="83" r="4" fill="#283a38"/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${graphic}</svg>`)}`;
}

export function initialData() {
  const now = new Date().toISOString();
  const concepts: ResolvedConcept[] = [
    { id: 'bear', zh: '小熊', en: 'bear', pinyin: 'xiǎo xióng', category: 'animals', image: 'assets/bear.svg', imageUrl: illustration('#d4a273', 'animal'), packId: 'sprout.core' },
    { id: 'cat', zh: '小猫', en: 'cat', pinyin: 'xiǎo māo', category: 'animals', image: 'assets/cat.svg', imageUrl: illustration('#edb5ac', 'animal'), packId: 'sprout.core' },
    { id: 'circle', zh: '圆形', en: 'circle', pinyin: 'yuán xíng', category: 'shapes', image: 'assets/circle.svg', imageUrl: illustration('#5da9e9', 'circle'), packId: 'sprout.core' },
    { id: 'square', zh: '正方形', en: 'square', pinyin: 'zhèng fāng xíng', category: 'shapes', image: 'assets/square.svg', imageUrl: illustration('#6c9a3b', 'square'), packId: 'sprout.core' },
  ];
  const lessons: Lesson[] = [
    {
      schemaVersion: 1, id: 'core.s3.animal-friends', title: { zh: '你好，小动物', en: 'Hello, animals' },
      summary: { zh: '先读给家长听，再拿真实玩偶和宝宝互动。' }, ageRange: [12, 23], domains: ['language', 'english', 'science'],
      themeId: 's3.animals', durationMin: 3, coView: 'required', audience: 'parent', cover: { concept: 'bear', bg: '#edf5ee' },
      printables: [{ kind: 'cards', title: '动物朋友', items: ['bear', 'cat'], size: 'large', showText: true, showEnglish: true }],
      objectives: [{ zh: '指认熟悉的动物', en: 'Point to a familiar animal' }],
      parentGuide: {
        intro: '坐在宝宝身边，等宝宝先指一指，再说出动物的名字。',
        tips: ['留几秒时间，让宝宝回应。'], phrases: [{ zh: '小熊在哪里？', en: 'Where is the bear?' }],
        why: '从熟悉的事物开始，在回应式互动中积累词汇。', refs: [],
      },
      offline: [{ title: '给玩偶找朋友', minutes: 5, materials: ['两个大玩偶'], steps: ['把两个玩偶放在身边。', '请宝宝指一个，你来模仿它的动作。'], safety: '玩偶需完整，不含可脱落的小零件。', domains: ['language', 'social'] }],
      steps: [{ type: 'guide', props: { goal: '和宝宝一起指认动物并等待回应。', materials: ['两个大玩偶或实体卡片'], steps: [{ text: '把小熊和小猫放在宝宝面前，慢慢说出名字。', concept: 'bear' }, { text: '等宝宝看、指或发声，再回应宝宝。', concept: 'cat' }], playMin: 5, observe: ['宝宝是否看向或伸手指向卡片。'] } }],
    },
    {
      schemaVersion: 1, id: 'core.s3.shape-walk', title: { zh: '圆圆方方找一找', en: 'A shape walk' },
      ageRange: [15, 23], domains: ['math', 'cognition'], themeId: 's3.shapes', durationMin: 3, coView: 'required', audience: 'parent',
      printables: [{ kind: 'cards', title: '形状卡', items: ['circle', 'square'], size: 'medium', showText: true, showEnglish: false }],
      cover: { concept: 'circle', bg: '#eaf4fb' },
      objectives: [{ zh: '发现身边的圆形和方形' }],
      parentGuide: { intro: '边看边比划形状，结束后到房间里找一找。' },
      offline: [{ title: '房间里的形状', minutes: 5, steps: ['找一个圆圆的碗。', '再找一本方方的书。'], safety: '选择不易破碎、没有尖角的物品。' }],
      steps: [{ type: 'guide', props: { goal: '在房间里寻找圆形和方形。', materials: ['形状卡'], steps: [{ text: '先给宝宝看圆形卡，再一起找圆圆的安全物品。', concept: 'circle' }, { text: '再拿方形卡，找一本方方的书。', concept: 'square' }], playMin: 5 } }],
    },
    {
      schemaVersion: 1, id: 'custom.quiet-time', title: { zh: '和宝宝慢慢呼吸', en: 'Breathe together' },
      ageRange: [18, 30], domains: ['social'], durationMin: 2, coView: 'required', audience: 'child',
      objectives: [{ zh: '一起体验安静的时刻' }],
      parentGuide: { intro: '靠在一起，跟着画面自然呼吸，不需要刻意屏息。' },
      offline: [{ title: '一起抱一抱', steps: ['关掉屏幕，轻轻抱一抱。'] }],
      steps: [{ type: 'calm', props: { visual: 'flower', cycles: 3, inhaleSec: 3, exhaleSec: 4 } }],
    },
    {
      schemaVersion: 1, id: 'custom.contrast-print', title: { zh: '黑白卡陪玩指引' },
      ageRange: [6, 17], domains: ['cognition'], durationMin: 2, coView: 'required', audience: 'parent',
      objectives: [{ zh: '与宝宝面对面互动' }], parentGuide: { intro: '先准备实体卡，再关屏幕陪宝宝玩。' },
      offline: [{ title: '看一看卡片', steps: ['缓慢移动卡片，观察宝宝的目光。'], question: '你在看哪一张？', levels: { easier: '一次只放一张', harder: '左右放两张等待回应' } }],
      printables: [
        { kind: 'contrast', title: '黑白卡', patterns: ['circle', 'face'], palette: 'bw' },
        { kind: 'cards', title: '小词卡', items: ['bear', 'cat', 'circle', 'square', 'bear', 'cat', 'circle', 'square', 'bear'], size: 'small', showText: true, showEnglish: true },
      ],
      steps: [{ type: 'guide', props: { goal: '在屏幕外观察卡片', steps: [{ text: '用打印卡和宝宝面对面互动。' }], playMin: 3 } }],
    },
  ];
  const route: Route = {
    schemaVersion: 1, id: 'sprout.core.route', title: { zh: '芽芽成长路线', en: 'Growing together' },
    stages: [
      {
        id: 's2', title: { zh: '发现与回应' }, ageRange: [6, 11], focus: [{ zh: '共同注意与亲子回应' }],
        screen: { sessionMaxMin: 3, dailyMaxMin: 10, lessonsPerDay: 2, coView: 'required', childScreen: 'none' },
        themes: [{ id: 's2.hello', title: { zh: '你好，世界' }, weeks: 2, domains: ['language'], lessons: ['core.s3.animal-friends'] }],
        dailyRhythm: ['晨起说说话', '白天趴一趴、动一动', '睡前抱抱与共读'], milestonesAt: [6, 9],
      },
      {
        id: 's3', title: { zh: '探索与表达' }, ageRange: [12, 17], focus: [{ zh: '用动作和简单词语表达' }, { zh: '观察相同与不同' }],
        screen: { sessionMaxMin: 3, dailyMaxMin: 10, lessonsPerDay: 2, coView: 'required', childScreen: 'none' },
        themes: [
          { id: 's3.animals', title: { zh: '我的动物朋友', en: 'Animal friends' }, weeks: 3, domains: ['language', 'science'], lessons: ['core.s3.animal-friends'], offlineFocus: ['观察玩偶，模仿动物的动作'] },
          { id: 's3.shapes', title: { zh: '圆圆方方的世界' }, weeks: 2, domains: ['math', 'cognition'], lessons: ['core.s3.shape-walk'] },
        ],
        dailyRhythm: ['上午户外活动', '午睡后亲子共读', '晚饭后一起收拾玩具'], milestonesAt: [12, 15, 18],
      },
      {
        id: 's4', title: { zh: '语言爆发' }, ageRange: [18, 23], focus: [{ zh: '在生活中说一说、找一找' }],
        screen: { sessionMaxMin: 8, dailyMaxMin: 10, lessonsPerDay: 2, coView: 'required', childScreen: 'optional' },
        themes: [{ id: 's4.discover', title: { zh: '一起发现' }, weeks: 3, domains: ['language', 'social'], lessons: ['core.s3.animal-friends', 'core.s3.shape-walk', 'custom.quiet-time'] }],
        dailyRhythm: ['户外探索', '玩真实的玩具', '面对面互动'], milestonesAt: [18],
      },
      {
        id: 's5', title: { zh: '想象与合作' }, ageRange: [24, 36], focus: [{ zh: '语言表达与合作游戏' }],
        screen: { sessionMaxMin: 10, dailyMaxMin: 20, lessonsPerDay: 2, coView: 'required', childScreen: 'default' },
        themes: [{ id: 's4.play', title: { zh: '一起做游戏' }, weeks: 3, domains: ['social'], lessons: ['custom.quiet-time'] }],
        dailyRhythm: ['自由玩耍', '户外探索', '睡前共读'], milestonesAt: [24, 30, 36],
      },
    ],
  };
  const children: ChildProfile[] = [
    { ...ChildInput.parse({ name: '小芽', nickname: '芽芽', birthday: dayjs().subtract(18, 'month').format('YYYY-MM-DD'), avatar: 'bear' }), id: 'child-demo', createdAt: now, updatedAt: now },
    { ...ChildInput.parse({ name: '小满', birthday: dayjs().subtract(28, 'month').format('YYYY-MM-DD'), avatar: 'cat', languageMode: 'zh' }), id: 'child-second', createdAt: now, updatedAt: now },
  ];
  const packs: PackInfo[] = [
    { id: 'sprout.core', version: '1.0.0', name: { zh: '芽芽基础内容包' }, source: 'builtin', enabled: true, ageRange: [6, 36], baseUrl: '/packs/sprout.core/', lessonCount: 2, conceptCount: 4, routeIds: [route.id], credits: [{ name: '开发验收示意图', license: '项目原创' }] },
    { id: 'sprout.custom', version: '1.0.0', name: { zh: '我的课程' }, source: 'custom', enabled: true, ageRange: [6, 36], baseUrl: '/packs/sprout.custom/', lessonCount: 2, conceptCount: 0, routeIds: [], credits: [] },
  ];
  const plugins: PluginInfo[] = BUILTIN_ACTIVITY_TYPES.map((type) => ({
    id: `builtin.${type}`, name: { zh: BUILTIN_ACTIVITY_META[type].zh }, version: '1.0.0',
    source: 'builtin', enabled: true, permissions: [],
    activities: [{ type, name: { zh: BUILTIN_ACTIVITY_META[type].zh }, ageRange: BUILTIN_ACTIVITY_META[type].ageRange }],
  }));
  const devices: DeviceInfo[] = [{ id: 'device-tv', name: '客厅电视', kind: 'tv', childId: children[0].id, createdAt: now, lastSeenAt: now }];
  const sessions: SessionRecord[] = Array.from({ length: 7 }, (_, index) => ({
    id: `session-${index}`, childId: children[0].id, lessonId: lessons[index % 2].id,
    startedAt: dayjs().subtract(index, 'day').hour(10).minute(0).toISOString(),
    endedAt: dayjs().subtract(index, 'day').hour(10).minute(3).toISOString(),
    durationSec: 180, completed: true, stepsCompleted: 1, stepsTotal: 1,
    audience: lessons[index % 2].audience,
    deviceId: 'device-tv', createdAt: now,
  }));
  const milestones: MilestoneItem[] = [6, 9, 12, 15, 18, 24, 30, 36].map((age) => ({
    id: `demo-${age}`, ageMonths: age, domain: 'social-emotional',
    zh: '和家人一起参与熟悉的互动游戏（开发示例）',
    en: 'Joins a familiar game with family (development example)', source: 'development-fixture',
  }));
  return { children, concepts, lessons, route, packs, plugins, devices, sessions, milestones };
}
