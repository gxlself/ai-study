import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { assertPackFile, FIXTURE_ROOT, isMain, listFiles } from './files.mjs';

const PARENT_LESSON_ID = 'core.fixture.parent-guide';

let schemaPromise;
const loadSchema = () => schemaPromise ??= tsImport(
  new URL('../../../packages/schema/src/index.ts', import.meta.url).href,
  import.meta.url,
);

export async function validateFixtures(root = FIXTURE_ROOT) {
  const { AudioManifest, BUILTIN_ACTIVITY_META, Lexicon, PackManifest, Route, validateConcepts, validateLesson } = await loadSchema();
  const bundle = JSON.parse(await readFile(join(root, 'bundle.json'), 'utf8'));
  assert.equal(bundle.schemaVersion, 1);
  assert.match(bundle.builtAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(new Date(bundle.builtAt).toISOString(), bundle.builtAt);
  assert.deepEqual(PackManifest.parse(bundle.manifest), bundle.manifest, 'manifest 必须包含契约默认值');
  assert.deepEqual(Lexicon.parse(bundle.lexicon), bundle.lexicon);
  assert.equal(bundle.manifest.id, 'sprout.core');
  assert.match(bundle.manifest.name.zh, /非生产/);
  assert.deepEqual(bundle.manifest.ageRange, [6, 36]);
  assert.equal(bundle.lessons.length, 4);
  assert.equal(bundle.lexicon.concepts.length, 6);
  assert.deepEqual(validateConcepts(bundle.lexicon.concepts), []);
  const concepts = new Set(bundle.lexicon.concepts.map((concept) => concept.id));
  assert.deepEqual([...concepts].sort(), ['apple', 'ball', 'block', 'flower', 'moon', 'sun']);
  assert.deepEqual(bundle.lessons.map((lesson) => lesson.steps[0]?.type).sort(), ['choose', 'count', 'guide', 'word-cards']);
  const lessons = new Map();
  const warnings = [];
  const shortTitle = (title) => {
    assert.doesNotMatch(JSON.stringify(title), /开发|非生产|fixture|development|production/i);
    const text = typeof title === 'string' ? { zh: title } : title;
    assert.ok(text.zh.length <= 12 && (!text.en || text.en.length <= 28), '播放端可见标题需简短');
  };
  for (const lesson of bundle.lessons) {
    assert.equal(lessons.has(lesson.id), false, `课程 ID 重复：${lesson.id}`);
    const result = validateLesson(lesson, { knownConcepts: concepts });
    const isParent = lesson.id === PARENT_LESSON_ID;
    const expectedWarnings = isParent
      ? [{ path: 'ageRange', message: '月龄跨度过大（>18 个月），请拆分', level: 'warning' }] : [];
    assert.deepEqual(result.issues, expectedWarnings, `${lesson.id} 校验失败：${JSON.stringify(result.issues)}`);
    warnings.push(...result.issues.map((issue) => ({ lessonId: lesson.id, ...issue })));
    assert.deepEqual(result.lesson, lesson, `${lesson.id} 必须包含活动 props 默认值`);
    assert.equal(lesson.steps.length, 1);
    assert.equal(lesson.coView, 'required');
    assert.equal(lesson.durationMin, 1);
    assert.equal(lesson.audience, isParent ? 'parent' : 'child', `${lesson.id} 需显式标明受众`);
    assert.deepEqual(lesson.ageRange, [isParent ? 6 : 18, 36]);
    shortTitle(lesson.title);
    shortTitle(lesson.steps[0].title);
    const activityAge = BUILTIN_ACTIVITY_META[lesson.steps[0].type].ageRange;
    assert.ok(lesson.ageRange[0] >= activityAge[0] && lesson.ageRange[1] <= activityAge[1]);
    assert.match(lesson.parentGuide.intro, /^这是开发演示。/);
    assert.doesNotMatch(lesson.steps[0].parentTip, /开发|非生产/);
    assert.ok(lesson.parentGuide.tips?.length);
    assert.ok(lesson.parentGuide.why);
    assert.deepEqual(lesson.parentGuide.refs, []);
    assert.ok(lesson.parentGuide.phrases?.length);
    for (const phrase of lesson.parentGuide.phrases) assert.ok(phrase.zh && phrase.en);
    for (const activity of lesson.offline) {
      assert.ok(activity.materials?.length && activity.steps.length && activity.safety);
      assert.ok(activity.question?.trim(), `${lesson.id} 需要线下活动问题`);
      assert.ok(activity.levels?.easier?.trim() && activity.levels?.harder?.trim(), `${lesson.id} 需要三档线下玩法`);
      shortTitle(activity.title);
      assert.doesNotMatch(activity.safety, /开发|非生产/);
    }
    assert.ok(concepts.has(lesson.cover?.concept), `封面词条缺失：${lesson.id}`);
    await assertPackFile(root, lesson.cover.image);
    lessons.set(lesson.id, lesson);
  }
  assert.deepEqual([...lessons.keys()].sort(), [
    'core.fixture.choose', 'core.fixture.count', PARENT_LESSON_ID, 'core.fixture.word-cards',
  ]);
  const parent = lessons.get(PARENT_LESSON_ID);
  assert.equal(parent.steps[0].type, 'guide');
  const guide = parent.steps[0].props;
  assert.ok(guide.goal && guide.materials.length && guide.observe?.length && guide.safety, '家长指引内容需完整');
  assert.equal(guide.playMin, 5, '保留五分钟离屏陪玩，供宿主验证三分钟无输入暂停的陪玩阶段豁免');
  for (const step of guide.steps) {
    assert.ok(step.text && step.say?.zh && step.say?.en && concepts.has(step.concept), '指引步骤需有文字、双语用语与本地词条');
    if (step.image) await assertPackFile(root, step.image);
  }
  assert.equal(parent.printables?.length, 1);
  const printable = parent.printables[0];
  assert.equal(printable.kind, 'cards');
  assert.deepEqual(printable.items, ['apple', 'ball']);
  assert.equal(printable.size, 'large');
  assert.equal(printable.showText, true);
  assert.equal(printable.showEnglish, true);
  shortTitle(printable.title);

  assert.equal(bundle.routes.length, 1);
  const route = bundle.routes[0];
  assert.deepEqual(Route.parse(route), route);
  assert.equal(route.id, 'sprout.core.route');
  assert.deepEqual(route.stages.map((stage) => stage.ageRange),
    [[6, 8], [9, 11], [12, 17], [18, 23], [24, 29], [30, 36]], '阶段需按屏幕模式边界划分，不能跨越 23/24 月');
  shortTitle(route.title);
  const stageIds = new Set();
  const themeIds = new Set();
  for (const stage of route.stages) {
    assert.equal(stageIds.has(stage.id), false, `阶段 ID 重复：${stage.id}`);
    stageIds.add(stage.id);
    assert.equal(stage.screen.coView, 'required');
    shortTitle(stage.title);
    const minAge = stage.ageRange[0];
    assert.equal(stage.screen.childScreen, minAge < 18 ? 'none' : minAge < 24 ? 'optional' : 'default',
      `${stage.id} 的 childScreen 必须符合分龄模式`);
    assert.equal(stage.screen.lessonsPerDay, minAge < 18 ? 1 : minAge < 24 ? 2 : 3);
    assert.equal(stage.screen.dailyMaxMin, minAge < 24 ? 1 : 3);
    assert.equal(stage.screen.sessionMaxMin, minAge < 24 ? 1 : 2);
    for (const theme of stage.themes) {
      assert.equal(themeIds.has(theme.id), false, `主题 ID 重复：${theme.id}`);
      themeIds.add(theme.id);
      shortTitle(theme.title);
      assert.equal(new Set(theme.lessons).size, theme.lessons.length, '主题不重复引用课程卡');
      assert.equal(theme.lessons.length, stage.screen.lessonsPerDay, '开启共看时有足量且不重复的课程卡');
      for (const id of theme.lessons) {
        const lesson = lessons.get(id);
        assert.ok(lesson, `主题引用不存在的课程：${id}`);
        assert.ok(lesson.ageRange[0] <= stage.ageRange[0] && lesson.ageRange[1] >= stage.ageRange[1],
          `${id} 的月龄必须覆盖整个阶段 ${stage.id}`);
      }
      const themeLessons = theme.lessons.map((id) => lessons.get(id));
      assert.deepEqual(themeLessons.filter((lesson) => lesson.audience === 'parent').map((lesson) => lesson.id),
        minAge < 24 ? [PARENT_LESSON_ID] : [], '低龄主题含家长课；24 月以上由首页从课程库补充家长指引');
      const childLessons = themeLessons.filter((lesson) => lesson.audience === 'child');
      assert.equal(childLessons.length, minAge < 18 ? 0 : minAge < 24 ? 1 : 3);
      assert.ok(childLessons.reduce((minutes, lesson) => minutes + lesson.durationMin, 0) <= stage.screen.dailyMaxMin,
        '只累计共看课时长，家长阅读与离屏陪玩不占孩子屏幕预算');
    }
  }
  for (let age = 6; age <= 36; age += 1) {
    assert.equal(route.stages.filter((stage) => stage.ageRange[0] <= age && age <= stage.ageRange[1]).length, 1,
      `${age} 月必须且只能落在一个阶段`);
  }
  const wordCards = bundle.lessons.find((lesson) => lesson.steps[0].type === 'word-cards');
  const count = bundle.lessons.find((lesson) => lesson.steps[0].type === 'count');
  assert.equal(wordCards.steps[0].props.autoAdvanceSec, null);
  assert.equal(count.steps[0].props.mode, 'guided');
  const images = new Set();
  for (const concept of bundle.lexicon.concepts) {
    assert.ok(concept.tags.includes('非生产内容'));
    const path = await assertPackFile(root, concept.image);
    assert.equal(images.has(concept.image), false, `词条需要独立图形：${concept.id}`);
    images.add(concept.image);
    const svg = await readFile(path, 'utf8');
    assert.match(svg, /<svg\b/);
    assert.match(svg, /viewBox="0 0 256 256"/);
    assert.match(svg, /Not production content/);
    assert.doesNotMatch(svg, /<(?:script|foreignObject|image|animate|set)\b|\bon[a-z]+\s*=|(?:href|url)\s*[=(]/i);
  }
  assert.equal((await listFiles(join(root, 'assets'))).length, 6);
  await assertPackFile(root, bundle.manifest.cover);
  const audio = AudioManifest.parse(bundle.audio);
  assert.deepEqual(audio, bundle.audio);
  assert.deepEqual(audio, { schemaVersion: 1, voices: {}, entries: {} });
  assert.deepEqual(JSON.parse(await readFile(join(root, 'audio/manifest.json'), 'utf8')), audio);
  assert.equal(warnings.length, 1, '只有家长指引课的跨月龄演示警告');
  return { lessons: lessons.size, concepts: concepts.size, stages: stageIds.size, assets: images.size, warnings: warnings.length };
}

if (isMain(import.meta.url)) {
  validateFixtures().then((result) => {
    console.info(`[validate-fixtures] 通过：${result.lessons} 课 / ${result.concepts} 词条 / ${result.stages} 阶段 / ${result.assets} SVG；0 错误，${result.warnings} 条已知家长课跨月龄演示警告。`);
  }).catch((error) => {
    console.error(`[validate-fixtures] ${error.message}`);
    process.exitCode = 1;
  });
}
