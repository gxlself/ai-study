import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { unzipSync } from 'fflate';
import {
  AudioManifest, GuideProps, Lexicon, MovementProps, PackManifest, SongProps, WordCardsProps,
  speechKey, validateConcepts, validateLesson, type Lesson, type PackBundle,
} from '@sprout/schema';
import { audioRelativePath } from '../../../../scripts/gen-audio';
import { collectSpeech } from '../../../../scripts/lib/collect-speech';
import { normalizeSvg } from '../../../../scripts/lib/fluent-assets';
import { walkFiles } from '../../../../scripts/lib/io';
import { inspectPack, punctuationIssues, type PackInspection } from '../../../../scripts/lib/validate-pack';

const root = fileURLToPath(new URL('../', import.meta.url));
const coreRoot = fileURLToPath(new URL('../../sprout-core/', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const archivePath = path.join(repoRoot, 'release/sprout.english-1.0.0.zip');

async function json(directory: string, file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(directory, file), 'utf8'));
}

const manifest = PackManifest.parse(await json(root, 'pack.json'));
const lexicon = Lexicon.parse(await json(root, 'lexicon.json'));
const coreLexicon = Lexicon.parse(await json(coreRoot, 'lexicon.json'));
const concepts = new Map([...coreLexicon.concepts, ...lexicon.concepts].map((concept) => [concept.id, concept]));
const files = (await walkFiles(root, 'lessons')).filter((file) => file.endsWith('.json'));
const lessons: Lesson[] = [];

for (const file of files) {
  const result = validateLesson(await json(root, file), { knownConcepts: new Set(concepts.keys()) });
  assert.deepEqual(result.issues, [], file);
  assert.ok(result.lesson, file);
  lessons.push(result.lesson);
}

const parents = lessons.filter((lesson) => lesson.audience === 'parent');
const children = lessons.filter((lesson) => lesson.audience === 'child');

test('清单为十二课扩展包，不伪造路线或跨包依赖字段', async () => {
  assert.equal(manifest.id, 'sprout.english');
  assert.deepEqual(manifest.name, { zh: '英语日常', en: 'Everyday English' });
  assert.deepEqual(manifest.ageRange, [6, 36]);
  assert.deepEqual(manifest.routes, []);
  assert.equal(lessons.length, 12);
  assert.equal(new Set(lessons.map((lesson) => lesson.id)).size, 12);
  assert.ok(lessons.every((lesson) => lesson.id.startsWith('english.')));
  const raw = await json(root, 'pack.json') as Record<string, unknown>;
  assert.ok(!JSON.stringify(raw.requires).includes('packs'));
  assert.equal(manifest.requires?.plugins, undefined);
});

test('九节家长课、三节短共看，婴儿年龄绝不进入共看', () => {
  assert.equal(parents.length, 9);
  assert.equal(children.length, 3);
  for (const lesson of lessons) {
    assert.equal(lesson.coView, 'required');
    assert.equal(lesson.domains[0], 'english');
    assert.ok(lesson.ageRange[1] - lesson.ageRange[0] <= 18);
    assert.ok(lesson.steps.length >= 1 && lesson.steps.length <= 4);
    assert.equal(lesson.audience, lesson.ageRange[0] < 18 ? 'parent' : lesson.audience);
  }
  for (const lesson of children) {
    assert.deepEqual(lesson.ageRange, [24, 36]);
    assert.ok(lesson.durationMin <= 3);
  }
  for (let age = 6; age <= 36; age++) {
    assert.ok(parents.some((lesson) => lesson.ageRange[0] <= age && lesson.ageRange[1] >= age), `月龄 ${age} 无家长课`);
  }
});

test('八个日常场景与独立动作课全部存在', () => {
  const slugs = [
    'good-morning', 'get-dressed', 'mealtime', 'wash-hands',
    'clean-up', 'lets-go', 'good-night', 'feelings', 'action-game',
  ];
  assert.deepEqual(parents.map((lesson) => lesson.id).sort(), slugs.map((slug) => `english.parent.${slug}`).sort());
});

test('每个家长指引逐句提供六句中英和美式音标，展示字段一致', () => {
  for (const lesson of parents) {
    assert.equal(lesson.durationMin, 3);
    assert.equal(lesson.steps[0].type, 'guide');
    assert.ok(lesson.steps.every((step) => step.type === 'guide' || step.type === 'song'));
    const guide = GuideProps.parse(lesson.steps[0].props);
    const phrases = lesson.parentGuide.phrases ?? [];
    assert.equal(phrases.length, 6, lesson.id);
    assert.equal(guide.steps.length, 6, lesson.id);
    assert.equal(guide.playMin, 5);
    assert.ok(guide.observe && guide.observe.length >= 2 && guide.observe.length <= 3);
    assert.ok(guide.safety);
    assert.ok(lesson.tags?.includes('tpr'));
    for (const [index, step] of guide.steps.entries()) {
      assert.deepEqual(step.say, phrases[index], `${lesson.id} 第 ${index + 1} 句`);
      assert.ok(phrases[index].zh.trim() && phrases[index].en?.trim());
      assert.match(step.text, /美式 \/[a-zɑɡɪɔɛʊəʃθʌɜɝðʒæŋˈˌ\s]+\/。/u, step.text);
    }
    assert.ok((lesson.parentGuide.tips?.length ?? 0) >= 2);
    assert.ok((lesson.parentGuide.tips?.length ?? 0) <= 4);
  }
});

test('家长指引不偷偷增加 TTS、视频、网页或宝宝屏幕活动', () => {
  const speech = collectSpeech({ lessons: parents, includeCommon: false });
  assert.deepEqual(speech, []);
  assert.ok(lessons.every((lesson) => lesson.steps.every((step) => !['video', 'web'].includes(step.type))));
  for (const lesson of children) {
    assert.equal(lesson.parentGuide.phrases?.length, 6);
    assert.ok(lesson.parentGuide.phrases?.every((phrase) => phrase.en && phrase.zh));
  }
});

test('所有课程有可执行线下活动、开放问题、两档玩法和明确安全说明', () => {
  for (const lesson of lessons) {
    assert.ok(lesson.offline.length >= 1 && lesson.offline.length <= 2, lesson.id);
    for (const activity of lesson.offline) {
      assert.ok(activity.steps.length >= 2 && activity.steps.length <= 6, lesson.id);
      assert.ok(activity.question && activity.levels?.easier && activity.levels?.harder, lesson.id);
      assert.ok(activity.safety && activity.safety.length >= 20, lesson.id);
      assert.ok(activity.materials && activity.materials.length > 0, lesson.id);
      assert.ok(activity.steps.some((step) => /关屏|关掉设备|设备留在干燥处|不用设备/u.test(step)));
    }
  }
});

test('进餐、睡前、水边、情绪和不会跳的保护措施可见', () => {
  const get = (id: string) => {
    const lesson = lessons.find((entry) => entry.id === id);
    assert.ok(lesson);
    return JSON.stringify(lesson);
  };
  assert.match(get('english.parent.mealtime'), /不.*(?:进食条件|要求说出来才给食物)/u);
  assert.match(get('english.parent.good-night'), /白天/u);
  assert.match(get('english.parent.good-night'), /睡前.*(?:关屏|不打开|不播放)/u);
  assert.match(get('english.parent.wash-hands'), /不留宝宝独处/u);
  assert.match(get('english.parent.lets-go'), /不依赖.*口令|不能只靠.*英文/u);
  assert.match(get('english.parent.feelings'), /不强抱|不强制身体接触/u);
  assert.match(get('english.child.move-together'), /不会.*(?:脚跟|拍手)/u);
});

test('只新增缺少的站立动作词条，不覆盖核心词库', () => {
  assert.deepEqual(validateConcepts(lexicon.concepts), []);
  assert.deepEqual(lexicon.concepts.map((concept) => concept.id), ['english.stand-up']);
  const coreIds = new Set(coreLexicon.concepts.map((concept) => concept.id));
  assert.ok(lexicon.concepts.every((concept) => !coreIds.has(concept.id)));
  assert.equal(lexicon.concepts[0].category, 'actions');
  assert.deepEqual(lexicon.concepts[0].ageRange, [18, 36]);
  assert.ok(lexicon.concepts[0].tags?.includes('non-count'));
});

test('词卡与打印卡的核心或本包图片真实存在', async () => {
  for (const lesson of lessons) {
    const references: string[] = [];
    if (lesson.cover?.concept) references.push(lesson.cover.concept);
    for (const printable of lesson.printables ?? []) {
      if (printable.kind === 'cards') {
        assert.ok(printable.items.every((item) => typeof item === 'string'));
        references.push(...printable.items as string[]);
      }
    }
    for (const reference of references) {
      const concept = concepts.get(reference);
      assert.ok(concept, `${lesson.id} 缺少 ${reference}`);
      const owner = lexicon.concepts.some((entry) => entry.id === reference) ? root : coreRoot;
      assert.ok((await stat(path.join(owner, concept.image))).size > 0, concept.image);
    }
  }
  const cards = lessons.find((lesson) => lesson.id === 'english.child.everyday-things')?.steps[0];
  assert.ok(cards);
  const props = WordCardsProps.parse(cards.props);
  assert.deepEqual(props.items, ['cup', 'spoon', 'book', 'ball']);
  assert.equal(props.autoAdvanceSec, null);
  assert.equal(props.speak, 'name+phrase');
});

test('所有研究引用使用证据文档实际存在的编号', async () => {
  const review = await readFile(path.join(repoRoot, 'docs/research/evidence-review.md'), 'utf8');
  const numbers = new Set([...review.matchAll(/^(\d+)\.\s/gm)].map((match) => `[${match[1]}]`));
  for (const lesson of lessons) {
    assert.ok(lesson.parentGuide.why);
    assert.ok((lesson.parentGuide.refs?.length ?? 0) >= 2);
    for (const ref of lesson.parentGuide.refs ?? []) assert.ok(numbers.has(ref), `${lesson.id} ${ref}`);
  }
});

test('原创双语歌词逐行匹配音节、传统旋律与拍数，没有零拍', () => {
  const lesson = lessons.find((entry) => entry.id === 'english.child.hello-hands');
  assert.ok(lesson);
  const song = SongProps.parse(lesson.steps[0].props);
  const syllables = [4, 4, 3, 3, 6, 6, 3, 3];
  assert.equal(song.lines.length, 16);
  assert.equal(song.repeat, 1);
  assert.equal(song.bpm, 70);
  assert.match(song.credit, /Frère Jacques/u);
  assert.match(song.credit, /公有领域/u);
  let totalBeats = 0;
  for (const [index, line] of song.lines.entries()) {
    const notes = line.notes.trim().split(/\s+/).map((token) => {
      const [pitch, beats] = token.split('/');
      return { pitch, beats: Number(beats) };
    });
    assert.ok(notes.every((note) => note.beats > 0));
    assert.equal(notes.filter((note) => note.pitch !== 'R').length,
      line.lang === 'en' ? syllables[index] : [...line.text.matchAll(/\p{Script=Han}/gu)].length);
    const beats = notes.reduce((sum, note) => sum + note.beats, 0);
    assert.equal(beats, 4, line.text);
    totalBeats += beats;
    if (index >= 8) assert.equal(line.notes, song.lines[index - 8].notes);
    assert.equal(line.lang, index < 8 ? 'en' : 'zh');
  }
  assert.equal(totalBeats, 64);
  assert.ok(totalBeats * 60 / song.bpm < lesson.durationMin * 60);
});

test('动作时间从容，只有自愿且可替代的动作，实际朗读有双语', () => {
  const lesson = lessons.find((entry) => entry.id === 'english.child.move-together');
  assert.ok(lesson);
  const movement = MovementProps.parse(lesson.steps[0].props);
  assert.equal(movement.moves.length, 6);
  assert.ok(movement.moves.every((move) => move.seconds === 15 && move.say.zh && move.say.en));
  assert.ok(movement.moves.reduce((total, move) => total + move.seconds, 0) <= lesson.durationMin * 60);
  assert.match(movement.moves[5].say.zh ?? '', /脚跟/u);
  assert.match(movement.moves[5].say.en ?? '', /heels/);
});

test('两张原创 SVG 与来源表闭合，不含脚本、外链、动画或固定像素尺寸', async () => {
  const sources = await json(root, 'assets/sources.json') as {
    schemaVersion: number; items: Record<string, { source: string }>;
  };
  assert.equal(sources.schemaVersion, 1);
  assert.equal(Object.keys(sources.items).length, 2);
  for (const [file, source] of Object.entries(sources.items)) {
    assert.equal(source.source, 'custom');
    const svg = await readFile(path.join(root, file), 'utf8');
    assert.doesNotThrow(() => normalizeSvg(svg), file);
    assert.match(svg, /viewBox="0 0 512 512"/);
    assert.match(svg, /width="100%" height="100%"/);
    assert.doesNotMatch(svg, /<(?:script|animate|foreignObject|image)\b|\bon\w+\s*=|\bhref\s*=/i);
    assert.match(svg, /<title\b/);
    assert.match(svg, /<desc\b/);
  }
  assert.ok(manifest.cover && sources.items[manifest.cover]);
  assert.ok(sources.items[lexicon.concepts[0].image]);
});

test('中文标点检查为零问题，孩子的实际朗读中文保持短句', () => {
  for (const [index, lesson] of lessons.entries()) {
    assert.deepEqual(punctuationIssues(lesson, files[index]), []);
    if (lesson.audience === 'child') {
      const speech = collectSpeech({ lessons: [lesson], fallbackConcepts: coreLexicon.concepts, includeCommon: false });
      for (const entry of speech.filter((entry) => entry.lang === 'zh')) {
        assert.ok([...entry.text.matchAll(/\p{Script=Han}/gu)].length <= 20, entry.text);
      }
    }
  }
});

function registeredRouteWarning(issue: PackInspection['issues'][number]): boolean {
  return issue.level === 'warning' && issue.path.startsWith('lessons/')
    && /在主题中出现 0 次，应且仅应出现 1 次/u.test(issue.message);
}

test('官方检查没有内容错误，剩余问题只能是明确登记的无路线归属阻塞', async () => {
  const result = await inspectPack(root);
  assert.equal(result.validLessons.length, 12);
  assert.equal(result.routes.length, 0);
  assert.equal(result.audioCoverage.present, result.audioCoverage.total);
  assert.ok(result.audioCoverage.total > 0);
  assert.deepEqual(result.issues.filter((issue) => !registeredRouteWarning(issue)), []);
  if (result.issues.length) {
    console.info(`需要协调：官方检查仍有 ${result.issues.length} 条无路线包主题归属警告，不能宣称 --strict 通过。`);
  }
});

test('慢读音频使用真实文件、统一 key 和完整运行语料，不把 IPA 当语音', async () => {
  const audio = AudioManifest.parse(await json(root, 'audio/manifest.json'));
  assert.deepEqual(audio.voices, { zh: 'Tingting', en: 'Samantha' });
  const settings = await json(root, 'audio/.tts-settings.json') as { rate: number };
  assert.equal(settings.rate, 125);
  const speech = collectSpeech({ lexicon, lessons, fallbackConcepts: coreLexicon.concepts });
  assert.equal(Object.keys(audio.entries).length, speech.length);
  assert.equal(new Set(speech.map((entry) => entry.key)).size, speech.length);
  for (const entry of speech) {
    const file = audio.entries[entry.key];
    assert.equal(entry.key, speechKey(entry.lang, entry.text));
    assert.equal(file, audioRelativePath(entry));
    const bytes = await readFile(path.join(root, file));
    assert.ok(bytes.length > 100);
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp', file);
    assert.doesNotMatch(entry.text, /美式 \//u);
  }
});

test('bundle 包含本次十二课、补全 props 与完整音频，不引入路线', async () => {
  const bundle = await json(root, 'bundle.json') as PackBundle;
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.manifest.id, manifest.id);
  assert.deepEqual(bundle.routes, []);
  assert.deepEqual(bundle.lessons.map((lesson) => lesson.id).sort(), lessons.map((lesson) => lesson.id).sort());
  assert.deepEqual(bundle.lexicon, lexicon);
  assert.deepEqual(bundle.audio, await json(root, 'audio/manifest.json'));
  for (const lesson of bundle.lessons) {
    assert.deepEqual(validateLesson(lesson, { knownConcepts: new Set(concepts.keys()) }).issues, []);
  }
});

test('最终 ZIP 根含清单、许可、源课程和音频，排除缓存及他包文件', async () => {
  const files = unzipSync(new Uint8Array(await readFile(archivePath)));
  const decode = (file: string) => JSON.parse(new TextDecoder().decode(files[file]));
  assert.ok(files['pack.json'] && files['bundle.json'] && files['README.md'] && files['LICENSES.md']);
  assert.equal(decode('pack.json').id, 'sprout.english');
  assert.equal(decode('bundle.json').lessons.length, 12);
  for (const file of await walkFiles(root)) {
    assert.ok(files[file], `ZIP 缺少 ${file}`);
    assert.deepEqual(files[file], new Uint8Array(await readFile(path.join(root, file))), `ZIP 内容过期 ${file}`);
  }
  for (const file of Object.values(decode('audio/manifest.json').entries) as string[]) {
    assert.ok(files[file]?.length > 100, file);
  }
  assert.ok(Object.keys(files).every((file) =>
    !file.split('/').some((part) => part.startsWith('.') || ['node_modules', 'coverage', 'release'].includes(part))
    && !/\.(?:zip|aiff?|tmp|log)$/i.test(file)));
  assert.ok(!Object.keys(files).some((file) => file.includes('sprout-core/')));
});
