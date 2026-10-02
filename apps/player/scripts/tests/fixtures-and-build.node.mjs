import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { tsImport } from 'tsx/esm/api';
import { copyBundled } from '../copy-bundled.mjs';
import { FIXTURE_ROOT, PLAYER_ROOT, statIfExists } from '../files.mjs';
import { validateFixtures } from '../validate-fixtures.mjs';
import { writeSwManifest } from '../write-sw-manifest.mjs';

const TEST_ROOT = fileURLToPath(new URL('./', import.meta.url));
const PARENT_LESSON_ID = 'core.fixture.parent-guide';
const FIXTURE_STATS = { lessons: 4, concepts: 6, stages: 6, assets: 6, warnings: 1 };
const quiet = { info() {}, warn() {} };

async function sandbox(t) {
  const root = await mkdtemp(join(TEST_ROOT, '.offline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function put(root, path, text) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function cloneFixture(root, name = 'fixture') {
  const path = join(root, name);
  await cp(FIXTURE_ROOT, path, { recursive: true });
  return path;
}

async function mutateBundle(root, mutate) {
  const path = join(root, 'bundle.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  mutate(data);
  await writeFile(path, JSON.stringify(data));
}

async function createDist(root) {
  const dist = join(root, 'dist');
  await put(dist, 'index.html', '<!doctype html><script type="module" src="./assets/index-a1.js"></script>');
  await put(dist, 'assets/index-a1.js', 'import("./lesson-b2.js");');
  await put(dist, 'assets/lesson-b2.js', 'export const lesson = "fixture";');
  await put(dist, 'assets/index-c3.css', 'body { color: #333; }');
  await put(dist, 'assets/font-d4.woff2', 'fixture-font');
  await put(dist, 'assets/index-a1.js.map', '{"developmentOnly":true}');
  await put(dist, 'assets/.private.json', '{}');
  await put(dist, 'admin/index.html', '<!doctype html><title>Not player</title>');
  await put(dist, 'api/children.json', '{"mustNotCache":true}');
  await put(dist, 'bundled/packs/sprout.custom/assets/private.svg', '<svg/>');
  await put(dist, 'manifest.webmanifest', '{"name":"Fixture"}');
  await cp(FIXTURE_ROOT, join(dist, 'bundled/packs/sprout.core'), { recursive: true });
  await put(dist, 'bundled/packs/sprout.core/audio/test.m4a', 'fixture-audio');
  return dist;
}

test('四课六阶段夹具按真实 schema 校验，仅家长课有一条已知跨月龄警告', async () => {
  assert.deepEqual(await validateFixtures(), FIXTURE_STATS);
});

test('真实排课器逐月验证默认与显式模式：低龄家长课、18-23 月选择共看、24 月以上三张共看卡', async () => {
  const { ChildInput } = await tsImport('@sprout/schema', import.meta.url);
  const { localDateString, planToday, summarizeLesson } = await tsImport('@sprout/core', import.meta.url);
  const bundle = JSON.parse(await readFile(join(FIXTURE_ROOT, 'bundle.json'), 'utf8'));
  const lessons = Object.fromEntries(bundle.lessons.map((lesson) => [
    lesson.id, summarizeLesson(lesson, bundle.manifest.id),
  ]));
  const date = new Date(2026, 9, 2, 10);
  assert.equal(lessons[PARENT_LESSON_ID].audience, 'parent');
  assert.equal(lessons[PARENT_LESSON_ID].hasPrintables, true);
  for (let age = 6; age <= 36; age += 1) {
    for (const mode of [undefined, 'auto', 'parent-only', 'co-view']) {
      const label = `${age} 月 / ${mode ?? '缺省'}`;
      const child = {
        id: `fixture-age-${age}`,
        ...ChildInput.parse({
          name: '布局演示', birthday: localDateString(new Date(2026, 9 - age, 2)),
          ...(mode === undefined ? {} : { screen: { mode } }),
        }),
      };
      const plan = planToday({ route: bundle.routes[0], lessons, child, history: [], date, usedSec: 0 });
      const parentOnly = age < 18 || mode === 'parent-only' || (age < 24 && mode !== 'co-view');
      const childCount = parentOnly ? 0 : age < 24 ? 1 : 3;
      const parents = plan.items.filter((item) => item.lesson.audience === 'parent');
      const children = plan.items.filter((item) => item.lesson.audience === 'child');
      assert.equal(plan.screen.mode, parentOnly ? 'parent-only' : 'co-view', label);
      if (age < 24) {
        assert.deepEqual(parents.map((item) => item.lessonId), [PARENT_LESSON_ID], `${label} 低龄计划保留家长指引`);
        assert.equal(plan.items.length, childCount + 1, `${label} 总卡片数量`);
      } else if (!parentOnly) {
        assert.equal(parents.length, 0, `${label} 家长指引由首页补充`);
        assert.equal(plan.items.length, 3, `${label} 三张主题共看卡`);
      } else {
        assert.ok(parents.length <= 1, `${label} 家长计划卡不重复；首页可从全部课程补充`);
      }
      const availableParents = Object.values(lessons).filter((lesson) =>
        lesson.audience === 'parent' && lesson.ageRange[0] <= age && age <= lesson.ageRange[1]);
      assert.deepEqual(availableParents.map((lesson) => lesson.id), [PARENT_LESSON_ID], `${label} 首页和休息页始终可补充家长课`);
      assert.equal(children.length, childCount, `${label} 共看卡片数量`);
      assert.equal(new Set(plan.items.map((item) => item.lessonId)).size, plan.items.length, label);
      assert.deepEqual(children.map((item) => item.lesson.stepTypes[0]).sort(),
        parentOnly ? [] : age < 24 ? ['word-cards'] : ['choose', 'count', 'word-cards'], label);
      assert.ok(children.every((item) => item.lesson.ageRange[0] <= age && item.lesson.ageRange[1] >= age), label);
      assert.equal(children.reduce((sum, item) => sum + item.lesson.durationMin, 0), childCount, label);
      assert.equal(plan.screen.dailyMaxSec, (age < 24 ? 1 : 3) * 60, label);
      assert.equal(plan.screen.sessionMaxSec, (age < 24 ? 1 : 2) * 60, label);
      assert.equal(plan.screen.allowedNow, true, label);
      assert.equal(plan.screen.coView, 'required', label);
      assert.deepEqual(child.screen.windows, [{ start: '08:00', end: '18:30' }]);
    }
  }
});

test('置顶家长指引在孩子日上限与晚间时段外仍保留在计划中', async () => {
  const { ChildInput } = await tsImport('@sprout/schema', import.meta.url);
  const { localDateString, planToday, summarizeLesson } = await tsImport('@sprout/core', import.meta.url);
  const bundle = JSON.parse(await readFile(join(FIXTURE_ROOT, 'bundle.json'), 'utf8'));
  const lessons = Object.fromEntries(bundle.lessons.map((lesson) => [
    lesson.id, summarizeLesson(lesson, bundle.manifest.id),
  ]));
  for (const age of [6, 17, 18, 23, 24, 36]) {
    const child = {
      id: `fixture-age-${age}`,
      ...ChildInput.parse({
        name: '布局演示', birthday: localDateString(new Date(2026, 9 - age, 2)),
        plan: { pinned: [PARENT_LESSON_ID] },
      }),
    };
    for (const [hour, usedSec, reason] of [
      [10, (age < 24 ? 1 : 3) * 60, 'daily-limit'],
      [19, 0, 'outside-window'],
    ]) {
      const plan = planToday({
        route: bundle.routes[0], lessons, child, history: [], date: new Date(2026, 9, 2, hour), usedSec,
      });
      assert.equal(plan.screen.allowedNow, false, `${age} 月 / ${reason}`);
      assert.equal(plan.screen.reason, reason);
      assert.ok(plan.items.some((item) => item.lessonId === PARENT_LESSON_ID), `${age} 月家长指引仍在计划中`);
    }
  }
});

test('夹具校验命令不依赖工作目录', async (t) => {
  const root = await sandbox(t);
  const result = spawnSync(process.execPath, [join(PLAYER_ROOT, 'scripts/validate-fixtures.mjs')], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /4 课 \/ 6 词条 \/ 6 阶段 \/ 6 SVG/);
});

test('夹具校验拒绝缺失素材、错误选项及阶段月龄不匹配', async (t) => {
  const root = await sandbox(t);
  const missingAsset = await cloneFixture(root, 'missing');
  await rm(join(missingAsset, 'assets/apple.svg'));
  await assert.rejects(validateFixtures(missingAsset), /ENOENT/);
  const invalidAnswer = await cloneFixture(root, 'answer');
  await mutateBundle(invalidAnswer, (bundle) => {
    bundle.lessons.find((lesson) => lesson.id === 'core.fixture.choose').steps[0].props.rounds[0].answer = 'apple';
  });
  await assert.rejects(validateFixtures(invalidAnswer), /answer.*不在 options/);
  const badAge = await cloneFixture(root, 'age');
  await mutateBundle(badAge, (bundle) => {
    bundle.routes[0].stages[0].themes[0].lessons = ['core.fixture.count'];
  });
  await assert.rejects(validateFixtures(badAge), /月龄必须覆盖/);
});

test('夹具校验拒绝旧月龄口径、错误受众、缺失打印引用与指引信息', async (t) => {
  const root = await sandbox(t);
  const cases = [
    ['early-child', (bundle) => { bundle.lessons[0].ageRange[0] = 17; }, /起始月龄不得小于 18/],
    ['parent-word-cards', (bundle) => { bundle.lessons[0].audience = 'parent'; }, /家长指引课只能使用 guide\/song/],
    ['missing-printable', (bundle) => {
      bundle.lessons.find((lesson) => lesson.id === PARENT_LESSON_ID).printables[0].items.push('missing');
    }, /printables.*词库中不存在/],
    ['missing-guide-concept', (bundle) => {
      bundle.lessons.find((lesson) => lesson.id === PARENT_LESSON_ID).steps[0].props.steps[0].concept = 'missing';
    }, /steps.*词库中不存在/],
    ['missing-level', (bundle) => {
      delete bundle.lessons.find((lesson) => lesson.id === PARENT_LESSON_ID).offline[0].levels.easier;
    }, /三档线下玩法/],
    ['no-play-timer', (bundle) => {
      bundle.lessons.find((lesson) => lesson.id === PARENT_LESSON_ID).steps[0].props.playMin = 0;
    }, /五分钟离屏陪玩/],
    ['default-before-24', (bundle) => {
      bundle.routes[0].stages[3].screen.childScreen = 'default';
    }, /childScreen.*分龄模式/],
    ['cross-24', (bundle) => {
      bundle.routes[0].stages[3].ageRange[1] = 24;
    }, /阶段需按屏幕模式边界/],
  ];
  for (const [name, mutate, expected] of cases) {
    const fixture = await cloneFixture(root, name);
    await mutateBundle(fixture, mutate);
    await assert.rejects(validateFixtures(fixture), expected, name);
  }
});

test('缺少正式 bundle 时回退夹具并警告，复制完整资产和音频清单', async (t) => {
  const root = await sandbox(t);
  const warnings = [];
  const result = await copyBundled({
    contentDir: join(root, 'no-content'), fixtureDir: FIXTURE_ROOT, packsDir: join(root, 'packs'),
    logger: { info() {}, warn(message) { warnings.push(message); } },
  });
  assert.equal(result.useFixture, true);
  assert.match(warnings[0], /开发夹具（非生产内容）/);
  assert.deepEqual(await validateFixtures(result.destination), FIXTURE_STATS);
});

test('正式 bundle 优先，替换当前包旧文件但保留相邻目录', async (t) => {
  const root = await sandbox(t);
  const content = await cloneFixture(root, 'content');
  await mutateBundle(content, (bundle) => { bundle.manifest.version = '1.2.3'; });
  const packs = join(root, 'packs');
  await put(packs, 'sprout.core/assets/stale.svg', 'old-generated-content');
  await put(packs, 'another.pack/keep.txt', 'another-owner');
  await put(root, 'outside.txt', 'keep');
  const result = await copyBundled({
    contentDir: content, fixtureDir: join(root, 'missing-fixture'), packsDir: packs,
    logger: { info() {}, warn() { assert.fail('不应回退'); } },
  });
  assert.equal(result.useFixture, false);
  assert.equal(JSON.parse(await readFile(join(result.destination, 'bundle.json'), 'utf8')).manifest.version, '1.2.3');
  assert.equal(await statIfExists(join(result.destination, 'assets/stale.svg')), null);
  assert.equal(await readFile(join(packs, 'another.pack/keep.txt'), 'utf8'), 'another-owner');
  assert.equal(await readFile(join(root, 'outside.txt'), 'utf8'), 'keep');
});

test('正式 JSON 损坏或素材缺失时失败，不回退也不破坏旧输出', async (t) => {
  const root = await sandbox(t);
  const content = await cloneFixture(root, 'content');
  const packs = join(root, 'packs');
  await put(packs, 'sprout.core/keep.txt', 'previous');
  await put(content, 'bundle.json', '{ invalid JSON');
  const options = { contentDir: content, fixtureDir: FIXTURE_ROOT, packsDir: packs, logger: quiet };
  await assert.rejects(copyBundled(options), SyntaxError);
  await cp(join(FIXTURE_ROOT, 'bundle.json'), join(content, 'bundle.json'));
  await rm(join(content, 'assets/apple.svg'));
  await assert.rejects(copyBundled(options), /ENOENT/);
  assert.equal(await readFile(join(packs, 'sprout.core/keep.txt'), 'utf8'), 'previous');
});

test('无可选 assets/audio 且无引用的正式包可以复制', async (t) => {
  const root = await sandbox(t);
  await put(root, 'content/bundle.json', JSON.stringify({
    schemaVersion: 1, manifest: { id: 'sprout.core' }, lexicon: null, routes: [], lessons: [], audio: null,
  }));
  const result = await copyBundled({ contentDir: join(root, 'content'), packsDir: join(root, 'packs'), logger: quiet });
  assert.equal(result.useFixture, false);
  assert.ok(await statIfExists(join(result.destination, 'bundle.json')));
});

test('源、目标和素材的符号链接全部拒绝，不触及链接目标', async (t) => {
  const root = await sandbox(t);
  const content = await cloneFixture(root, 'content');
  const protectedDir = join(root, 'protected');
  await put(protectedDir, 'keep.txt', 'untouched');
  await symlink(protectedDir, join(root, 'linked-packs'));
  await assert.rejects(copyBundled({
    contentDir: content, packsDir: join(root, 'linked-packs'), logger: quiet,
  }), /符号链接/);
  await symlink(protectedDir, join(content, 'assets/external'));
  await assert.rejects(copyBundled({
    contentDir: content, packsDir: join(root, 'packs'), logger: quiet,
  }), /符号链接/);
  await symlink(content, join(root, 'linked-content'));
  await assert.rejects(copyBundled({
    contentDir: join(root, 'linked-content'), packsDir: join(root, 'packs'), logger: quiet,
  }), /符号链接/);
  assert.equal(await readFile(join(protectedDir, 'keep.txt'), 'utf8'), 'untouched');
});

test('生产清单包含哈希资源、懒加载、音频、SVG，排除 map/隐藏文件/其它应用', async (t) => {
  const root = await sandbox(t);
  const dist = await createDist(root);
  const template = await readFile(join(PLAYER_ROOT, 'public/sw.js'), 'utf8');
  const build = await writeSwManifest({ distDir: dist, logger: quiet });
  for (const path of [
    'index.html', 'assets/index-a1.js', 'assets/lesson-b2.js', 'assets/index-c3.css', 'assets/font-d4.woff2',
    'bundled/packs/sprout.core/bundle.json', 'bundled/packs/sprout.core/assets/apple.svg',
    'bundled/packs/sprout.core/audio/test.m4a', 'manifest.webmanifest',
  ]) assert.ok(build.files.includes(path), path);
  assert.equal(build.files.some((path) => /\.map$|^admin\/|^api\/|\.private|sprout\.custom/.test(path)), false);
  const generated = await readFile(join(dist, 'sw.js'), 'utf8');
  assert.match(generated, new RegExp(build.version));
  assert.doesNotThrow(() => new vm.Script(generated));
  assert.equal(await readFile(join(PLAYER_ROOT, 'public/sw.js'), 'utf8'), template);
});

test('版本确定，重复生成不变，改正文、图片或 SW 都使版本改变', async (t) => {
  const root = await sandbox(t);
  const dist = await createDist(root);
  const first = await writeSwManifest({ distDir: dist, logger: quiet });
  const firstBytes = await readFile(join(dist, 'sw.js'), 'utf8');
  assert.deepEqual(await writeSwManifest({ distDir: dist, logger: quiet }), first);
  assert.equal(await readFile(join(dist, 'sw.js'), 'utf8'), firstBytes);
  await put(dist, 'index.html', '<!doctype html><title>Changed</title>');
  const second = await writeSwManifest({ distDir: dist, logger: quiet });
  assert.notEqual(second.version, first.version);
  await put(dist, 'bundled/packs/sprout.core/assets/apple.svg', '<svg>changed</svg>');
  const third = await writeSwManifest({ distDir: dist, logger: quiet });
  assert.notEqual(third.version, second.version);
  const template = await readFile(join(PLAYER_ROOT, 'public/sw.js'), 'utf8');
  await put(root, 'sw.js', `${template}\n// 测试模板变更\n`);
  const fourth = await writeSwManifest({ distDir: dist, templatePath: join(root, 'sw.js'), logger: quiet });
  assert.notEqual(fourth.version, third.version);
});

test('预缓存文件名按 URL 分段编码，不把 #、? 或空格变成地址片段', async (t) => {
  const root = await sandbox(t);
  const dist = await createDist(root);
  await put(dist, 'assets/a #?图.svg', '<svg/>');
  const build = await writeSwManifest({ distDir: dist, logger: quiet });
  assert.ok(build.files.includes('assets/a%20%23%3F%E5%9B%BE.svg'));
});

test('未构建或没有 bundle/JS 时明确失败，不改已存在 SW', async (t) => {
  const root = await sandbox(t);
  const dist = join(root, 'dist');
  await put(dist, 'sw.js', 'previous');
  await assert.rejects(writeSwManifest({ distDir: dist, logger: quiet }), /index.html/);
  await put(dist, 'index.html', '<!doctype html>');
  await assert.rejects(writeSwManifest({ distDir: dist, logger: quiet }), /bundle.json/);
  await put(dist, 'bundled/packs/sprout.core/bundle.json', '{}');
  await assert.rejects(writeSwManifest({ distDir: dist, logger: quiet }), /JS 资源/);
  assert.equal(await readFile(join(dist, 'sw.js'), 'utf8'), 'previous');
});
