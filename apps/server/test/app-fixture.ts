import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Lesson, Route, PackManifest, Lexicon } from '@sprout/schema';

export const exampleLesson = Lesson.parse({
  schemaVersion: 1, id: 'core.sample', title: { zh: '看看圆圆', en: 'A Circle' },
  ageRange: [18, 36], domains: ['cognition'], themeId: 'core.theme',
  durationMin: 3, coView: 'required', objectives: [{ zh: '一起观察形状' }],
  cover: { concept: 'circle' },
  parentGuide: { intro: '请陪孩子一起观察。' },
  offline: [{ title: '找找圆圆', steps: ['和家长一起找身边的大圆形。'] }],
  steps: [{ type: 'word-cards', props: { items: ['circle'] } }],
});

export const parentLesson = Lesson.parse({
  ...exampleLesson, id: 'core.parent', audience: 'parent', ageRange: [6, 36],
  title: { zh: '家长陪玩指引' }, durationMin: 2,
  steps: [{ type: 'guide', props: { goal: '在实物中观察形状', steps: [{ text: '和孩子一起找圆形', concept: 'circle' }] } }],
  printables: [{ kind: 'cards', title: '圆形卡片', items: ['circle'] }],
  offline: [{ title: '一起找圆', steps: ['使用打印卡片陪玩'], question: '还能找到什么？', levels: { easier: '只找一个', harder: '找两个' } }],
});

export const exampleRoute = Route.parse({
  schemaVersion: 1, id: 'sprout.core.route', title: { zh: '成长路线' },
  stages: [{
    id: 'core.stage', title: { zh: '一起观察' }, ageRange: [6, 36], focus: [{ zh: '亲子共学' }],
    screen: { sessionMaxMin: 5, dailyMaxMin: 10, lessonsPerDay: 2, coView: 'required' },
    themes: [{ id: 'core.theme', title: { zh: '形状' }, weeks: 2, domains: ['cognition'], lessons: ['core.sample'] }],
  }],
});

export const exampleLexicon = Lexicon.parse({
  schemaVersion: 1,
  concepts: [{ id: 'circle', category: 'shapes', zh: '圆形', en: 'circle', image: 'assets/circle.svg' }],
});

export function fixture(): { directory: string; dataDir: string; packDir: string; contentDirs: string[]; milestonesPath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'sprout-server-test-'));
  const packDir = join(directory, 'source', 'mini');
  for (const path of ['lessons/nested', 'routes', 'assets', 'audio']) mkdirSync(join(packDir, path), { recursive: true });
  const manifest = PackManifest.parse({
    schemaVersion: 1, id: 'sprout.core', version: '1.0.0', name: { zh: '测试内容' },
    ageRange: [6, 36], routes: ['routes/core.json'],
  });
  for (const [path, value] of Object.entries({
    'pack.json': manifest, 'lexicon.json': exampleLexicon,
    'lessons/nested/sample.json': exampleLesson, 'routes/core.json': exampleRoute,
    'audio/manifest.json': { schemaVersion: 1, entries: {} },
    'bundle.json': { intentionally: 'ignored' },
  })) writeFileSync(join(packDir, path), JSON.stringify(value));
  writeFileSync(join(packDir, 'assets/circle.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18"/></svg>');
  const milestonesPath = join(directory, 'milestones.json');
  writeFileSync(milestonesPath, JSON.stringify({
    version: 'test', sources: [], disclaimer: { zh: '测试数据，不作诊断。', en: 'Not a diagnosis.' },
    items: [{ id: 'test-item', ageMonths: 12, domain: 'motor', zh: '亲子观察', en: 'Observe together', source: 'test' }],
  }));
  return { directory, packDir, dataDir: join(directory, 'data'), contentDirs: [join(directory, 'source')], milestonesPath };
}
