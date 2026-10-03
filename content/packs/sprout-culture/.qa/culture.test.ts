import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { unzipSync } from 'fflate';
import {
  AudioManifest, ChooseProps, CountProps, GuideProps, Lexicon, MovementProps,
  PackManifest, StoryProps, WordCardsProps, cardinalitySpeech, speechKey,
  validateConcepts, validateLesson, type Lesson,
} from '@sprout/schema';
import { inspectPack, punctuationIssues } from '../../../../scripts/lib/validate-pack';

const pack = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const json = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const lexicon = Lexicon.parse(json(path.join(pack, 'lexicon.json')));
const core = Lexicon.parse(json(path.join(repo, 'content/packs/sprout-core/lexicon.json')));
const manifest = PackManifest.parse(json(path.join(pack, 'pack.json')));
const knownConcepts = new Set([...core.concepts, ...lexicon.concepts].map((concept) => concept.id));
const folders = ['parent-young', 'parent-toddler', 'child'];
const lessons = folders.flatMap((folder) =>
  readdirSync(path.join(pack, 'lessons', folder)).filter((file) => file.endsWith('.json')).map((file) => ({
    file: `lessons/${folder}/${file}`,
    input: json(path.join(pack, 'lessons', folder, file)),
  })),
);
const validLessons = lessons.map(({ input }) => {
  const result = validateLesson(input, { knownConcepts });
  assert.ok(result.lesson, JSON.stringify(result.issues));
  return result.lesson;
});
const festivals = [
  'spring-festival', 'lantern-festival', 'qingming', 'dragon-boat-festival',
  'mid-autumn', 'double-ninth', 'winter-solstice', 'family-celebration',
];

function childText(lesson: Lesson): string[] {
  const texts = [lesson.title.zh, ...lesson.objectives.map((objective) => objective.zh)];
  for (const step of lesson.steps) {
    if (step.type === 'word-cards') {
      const props = WordCardsProps.parse(step.props);
      if (props.intro?.zh) texts.push(props.intro.zh);
    } else if (step.type === 'choose') {
      for (const round of ChooseProps.parse(step.props).rounds) {
        if (round.prompt.zh) texts.push(round.prompt.zh);
        if (round.explain?.zh) texts.push(round.explain.zh);
      }
    } else if (step.type === 'story') {
      const props = StoryProps.parse(step.props);
      texts.push(props.title.zh, ...props.pages.map((page) => page.text.zh));
    } else if (step.type === 'movement') {
      const props = MovementProps.parse(step.props);
      if (props.intro?.zh) texts.push(props.intro.zh);
      props.moves.forEach((move) => {
        texts.push(move.name.zh);
        if (move.say.zh) texts.push(move.say.zh);
      });
    }
  }
  return texts;
}

test('包身份、路线为空、七个新词条与核心词库不冲突', () => {
  assert.equal(manifest.id, 'sprout.culture');
  assert.deepEqual(manifest.name, { zh: '中国传统节日', en: 'Chinese Festivals' });
  assert.deepEqual(manifest.ageRange, [6, 36]);
  assert.deepEqual(manifest.routes, []);
  assert.equal(lexicon.concepts.length, 7);
  assert.deepEqual(validateConcepts(lexicon.concepts), []);
  const coreIds = new Set(core.concepts.map((concept) => concept.id));
  for (const concept of lexicon.concepts) {
    assert.match(concept.id, /^fest-/);
    assert.equal(coreIds.has(concept.id), false);
    assert.ok(concept.phrase?.zh && concept.phrase.en);
  }
  assert.equal(validLessons.length, 20);
  assert.equal(new Set(validLessons.map((lesson) => lesson.id)).size, 20);
});

for (const { file, input } of lessons) {
  test(`${file}：结构、引用、标点均无错误或警告`, () => {
    const result = validateLesson(input, { knownConcepts });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(punctuationIssues(input, file), []);
    assert.ok(result.lesson);
    const lesson = result.lesson;
    assert.equal(lesson.coView, 'required');
    assert.ok(lesson.title.en && lesson.summary?.en);
    assert.ok(lesson.cover?.concept && knownConcepts.has(lesson.cover.concept));
    assert.ok(lesson.steps.length <= 4);
    assert.ok(lesson.objectives.length >= 1 && lesson.objectives.length <= 3);
    lesson.objectives.forEach((objective) => assert.ok(objective.en));
    assert.ok(lesson.parentGuide.intro.length <= 160);
    assert.ok((lesson.parentGuide.tips?.length ?? 0) >= 2 && (lesson.parentGuide.tips?.length ?? 0) <= 4);
    const phrases = lesson.parentGuide.phrases ?? [];
    assert.ok(phrases.length >= 3 && phrases.length <= 6);
    phrases.forEach((phrase) => assert.ok(phrase.en));
    assert.ok(lesson.parentGuide.why && lesson.parentGuide.why.length <= 120);
    assert.ok(lesson.parentGuide.refs?.length);
    lesson.parentGuide.refs?.forEach((ref) => assert.match(ref, /^\[(?:[1-9]|[1-9]\d|10[0-5])\]$/));
    assert.ok(lesson.offline.length >= 1 && lesson.offline.length <= 2);
    lesson.offline.forEach((activity) => {
      assert.ok(activity.steps.length >= 2 && activity.steps.length <= 6);
      assert.ok(activity.question && activity.levels?.easier && activity.levels.harder);
      assert.ok(activity.safety);
    });
    assert.ok(lesson.printables?.length);
  });
}

for (const festival of festivals) {
  test(`${festival}：6–36月家长指引连续覆盖且无重叠`, () => {
    const guides = validLessons.filter((lesson) =>
      lesson.audience === 'parent' && lesson.themeId === `culture.${festival}`,
    ).sort((a, b) => a.ageRange[0] - b.ageRange[0]);
    assert.equal(guides.length, 2);
    assert.deepEqual(guides.map((lesson) => lesson.ageRange), [[6, 17], [18, 36]]);
    for (let month = 6; month <= 36; month++) {
      assert.equal(guides.filter((lesson) => month >= lesson.ageRange[0] && month <= lesson.ageRange[1]).length, 1);
    }
    guides.forEach((lesson) => {
      assert.ok(lesson.durationMin >= 2 && lesson.durationMin <= 3);
      assert.equal(lesson.steps[0].type, 'guide');
      lesson.steps.forEach((step) => {
        assert.equal(step.type, 'guide');
        const guide = GuideProps.parse(step.props);
        assert.ok(guide.steps.length >= 3 && guide.steps.length <= 6);
        assert.ok(guide.playMin >= 5 && guide.playMin <= 15);
        assert.ok(guide.observe && guide.observe.length >= 2 && guide.observe.length <= 3);
        assert.ok(guide.safety);
        guide.steps.forEach((instruction) => {
          assert.ok(instruction.say?.zh && instruction.say.en);
          if (lesson.ageRange[1] < 18) assert.ok(Array.from(instruction.say.zh).length <= 12);
        });
      });
    });
  });
}

test('四节共看课仅24–36月，短句、手动词卡、选择题及动作安全', () => {
  const child = validLessons.filter((lesson) => lesson.audience === 'child');
  assert.equal(child.length, 4);
  assert.deepEqual(child.map((lesson) => lesson.themeId).sort(), [
    'culture.dragon-boat-festival', 'culture.lantern-festival',
    'culture.mid-autumn', 'culture.spring-festival',
  ]);
  for (const lesson of child) {
    assert.deepEqual(lesson.ageRange, [24, 36]);
    assert.ok(lesson.durationMin <= 10);
    assert.equal(lesson.coView, 'required');
    childText(lesson).forEach((text) => text.split(/[。！？；]/u).filter(Boolean).forEach((sentence) => {
      assert.ok(Array.from(sentence).length <= 20, `${lesson.id}：${sentence}`);
    }));
    for (const step of lesson.steps) {
      assert.ok(!['web', 'video', 'bubbles', 'song'].includes(step.type));
      if (step.type === 'word-cards') assert.equal(WordCardsProps.parse(step.props).autoAdvanceSec, null);
      if (step.type === 'choose') {
        ChooseProps.parse(step.props).rounds.forEach((round) => {
          const ids = round.options.map((option) => typeof option === 'string' ? option : option.id);
          assert.equal(ids.length, 2);
          assert.equal(new Set(ids).size, 2);
          assert.ok(ids.includes(round.answer));
          assert.ok(round.prompt.en && round.explain?.en);
        });
      }
      if (step.type === 'movement') {
        const props = MovementProps.parse(step.props);
        assert.equal(props.moves.length, 3);
        props.moves.forEach((move) => assert.ok(move.seconds >= 6 && move.seconds <= 8));
        assert.match(JSON.stringify(props), /坐稳/);
        assert.match(JSON.stringify(props), /空手/);
        assert.ok(props.moves.every((move) => move.say.en));
      }
    }
  }
});

test('原创绘本每页2–5个静态精灵并有家长提问', () => {
  const stories = validLessons.flatMap((lesson) => lesson.steps.filter((step) => step.type === 'story'));
  assert.equal(stories.length, 2);
  stories.forEach((step) => {
    const props = StoryProps.parse(step.props);
    assert.equal(props.pages.length, 3);
    assert.ok(props.title.en);
    const prompts = props.pages.filter((page) => page.prompts?.length);
    assert.ok(prompts.length >= 1 && prompts.length <= 3);
    props.pages.forEach((page) => {
      assert.ok(page.text.en);
      assert.ok(page.scene.sprites.length >= 2 && page.scene.sprites.length <= 5);
      page.scene.sprites.forEach((sprite) => {
        assert.equal(sprite.anim, 'none');
        assert.ok(sprite.x >= 10 && sprite.x <= 90);
        assert.ok(sprite.y >= 15 && sprite.y <= 80);
        assert.ok(sprite.size >= 20 && sprite.size <= 42);
      });
      page.prompts?.forEach((prompt) => assert.ok(prompt.en));
    });
  });
});

test('灯笼数量与中英量词正确', () => {
  const lesson = validLessons.find((item) => item.id === 'culture.child.lantern-festival')!;
  const props = CountProps.parse(lesson.steps.find((step) => step.type === 'count')!.props);
  assert.deepEqual(props.rounds.map((round) => round.count), [1, 2]);
  assert.ok(props.rounds.every((round) => round.item === 'fest-lantern'));
  assert.equal(props.mode, 'guided');
  const lantern = lexicon.concepts.find((concept) => concept.id === 'fest-lantern')!;
  assert.deepEqual(cardinalitySpeech(2, lantern), { zh: '一共两盏灯笼', en: 'Two lanterns!' });
});

test('汤圆、粽子、香囊与其它活动有明确安全护栏', () => {
  for (const lesson of validLessons) {
    const offline = lesson.offline.map((activity) => activity.safety).join(' ');
    if (['culture.lantern-festival', 'culture.winter-solstice'].includes(lesson.themeId ?? '')) {
      assert.match(offline, /3岁以下不建议整颗吃/);
      assert.match(offline, /切小.*压扁/);
      assert.match(offline, /窒息风险/);
      assert.match(offline, /不试吃/);
    }
    if (lesson.themeId === 'culture.dragon-boat-festival') {
      assert.match(offline, /粽子.*窒息风险/);
      assert.match(offline, /香囊只看图/);
      assert.match(offline, /不佩戴|不提供.*草药/);
      assert.match(offline, /干燥/);
      assert.match(offline, /不用.*棍/);
    }
    if (lesson.themeId === 'culture.qingming') {
      assert.match(offline, /种子.*窒息风险|窒息风险.*种子/);
      assert.match(offline, /成人/);
      assert.match(offline, /洗手/);
    }
    if (lesson.themeId === 'culture.mid-autumn') {
      assert.match(offline, /月饼只看图/);
      assert.match(offline, /坚果/);
      assert.match(offline, /阳台/);
    }
    if (lesson.themeId === 'culture.family-celebration') {
      assert.match(offline, /不用气球/);
      assert.match(offline, /蜡烛/);
    }
  }
});

test('八幅自绘SVG与素材清单闭合，无网络或活动代码', () => {
  const sources = json(path.join(pack, 'assets/sources.json')) as {
    schemaVersion: number; items: Record<string, { source: string }>;
  };
  assert.equal(sources.schemaVersion, 1);
  assert.equal(Object.keys(sources.items).length, 8);
  const referenced = [...lexicon.concepts.map((concept) => concept.image), manifest.cover!];
  assert.deepEqual(Object.keys(sources.items).sort(), referenced.sort());
  Object.entries(sources.items).forEach(([file, source]) => {
    assert.equal(source.source, 'custom');
    const svg = readFileSync(path.join(pack, file), 'utf8');
    assert.match(svg, /<svg[^>]+viewBox="0 0 \d+ \d+"/);
    assert.match(svg, /width="100%" height="100%"/);
    assert.match(svg, /<title/);
    assert.doesNotMatch(svg, /<script|<foreignObject|<animate|<set\b|\bon\w+=|\bhref=|url\s*\(|<!DOCTYPE/i);
    assert.doesNotMatch(svg.replace('http://www.w3.org/2000/svg', ''), /https?:\/\//);
  });
});

test('整包资源与音频完整；无路线归属告警如实保留，不伪造路线', async () => {
  const inspection = await inspectPack(pack);
  assert.deepEqual(inspection.issues.filter((issue) => issue.level === 'error'), []);
  assert.equal(inspection.validLessons.length, 20);
  assert.equal(inspection.routes.length, 0);
  assert.equal(inspection.audioCoverage.present, inspection.audioCoverage.total);
  assert.ok(inspection.audioCoverage.total > 0);
  const warnings = inspection.issues.filter((issue) => issue.level === 'warning');
  // 共享流水线尚未豁免无路线包；修复后允许零告警，不隐藏其它告警。
  assert.ok(warnings.length === 0 || warnings.length === 20);
  warnings.forEach((warning) => assert.match(warning.message, /在主题中出现 0 次，应且仅应出现 1 次/));
});

test('真实音频清单包含全部核心依赖朗读，数量句不手拼', () => {
  const audio = AudioManifest.parse(json(path.join(pack, 'audio/manifest.json')));
  assert.ok(audio.voices.zh && audio.voices.en);
  for (const [lang, text] of [
    ['zh', '新年好！'], ['en', 'Happy New Year!'],
    ['zh', '一共两盏灯笼'], ['en', 'Two lanterns!'],
    ['zh', '月亮'], ['en', 'moon'], ['zh', '饺子'], ['en', 'dumpling'],
  ] as const) {
    const file = audio.entries[speechKey(lang, text)];
    assert.ok(file, `${lang}:${text}`);
    const bytes = readFileSync(path.join(pack, file));
    assert.ok(bytes.length > 128);
    assert.equal(bytes.subarray(4, 8).toString('ascii'), 'ftyp');
  }
});

test('发布zip源课、bundle、音频一致，排除QA与生成缓存', () => {
  const archive = unzipSync(readFileSync(path.join(repo, 'release/sprout.culture-1.0.0.zip')));
  const names = Object.keys(archive);
  ['pack.json', 'lexicon.json', 'README.md', 'LICENSES.md', 'bundle.json', 'audio/manifest.json'].forEach((file) => assert.ok(archive[file]));
  names.forEach((file) => assert.doesNotMatch(file, /(?:^|\/)\.|node_modules|\.zip$|\.aiff?$|\.tmp$/));
  assert.equal(names.filter((file) => file.startsWith('lessons/') && file.endsWith('.json')).length, 20);
  assert.equal(names.filter((file) => file.startsWith('assets/images/') && file.endsWith('.svg')).length, 8);
  const bundled = JSON.parse(Buffer.from(archive['bundle.json']).toString('utf8')) as {
    manifest: { id: string; routes: string[] }; lessons: Lesson[]; routes: unknown[];
    audio: { entries: Record<string, string> };
  };
  assert.equal(bundled.manifest.id, manifest.id);
  assert.deepEqual(bundled.routes, []);
  assert.deepEqual(bundled.manifest.routes, []);
  assert.deepEqual(bundled.lessons.map((lesson) => lesson.id).sort(), validLessons.map((lesson) => lesson.id).sort());
  const ownAudio = AudioManifest.parse(json(path.join(pack, 'audio/manifest.json')));
  assert.deepEqual(bundled.audio.entries, ownAudio.entries);
  for (const file of Object.values(bundled.audio.entries)) assert.ok(archive[file]?.byteLength);
  lessons.forEach(({ file }) => assert.deepEqual(
    Buffer.from(archive[file]), readFileSync(path.join(pack, file)),
  ));
});
