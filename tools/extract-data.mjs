import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
const mainRoot = path.resolve(process.argv[2] || path.join(siteRoot, '..', 'ai-study'));

const readText = (relativePath) => fs.readFileSync(path.join(mainRoot, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const writeJson = (relativePath, value) => {
  const target = path.join(siteRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};
const copyFile = (from, to) => {
  const target = path.join(siteRoot, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(mainRoot, from), target);
};
const stripMarkdown = (value) =>
  value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

if (!fs.existsSync(mainRoot)) {
  throw new Error(`main-branch checkout not found: ${mainRoot}`);
}

const stageDir = 'content/packs/sprout-core/routes/_stages';
const lessonDir = 'content/packs/sprout-core/lessons';
const stageFiles = fs
  .readdirSync(path.join(mainRoot, stageDir))
  .filter((file) => /^s\d+\.json$/.test(file))
  .sort();
const stages = stageFiles.map((file) => readJson(path.join(stageDir, file)));

const lessonFiles = [];
for (const stage of ['s1', 's2', 's3', 's4', 's5', 's6']) {
  const directory = path.join(mainRoot, lessonDir, stage);
  for (const file of fs.readdirSync(directory).filter((item) => item.endsWith('.json')).sort()) {
    lessonFiles.push(path.join(lessonDir, stage, file));
  }
}
const lessons = lessonFiles.map(readJson);
const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

const lexicon = readJson('content/packs/sprout-core/lexicon.json');
const sources = readJson('content/packs/sprout-core/assets/sources.json');
const evidence = readText('docs/research/evidence-review.md');
const rootPackage = readJson('package.json');
const serverPackage = readJson('apps/server/package.json');
const adminPackage = readJson('apps/admin/package.json');
const playerPackage = readJson('apps/player/package.json');
const schemaPackage = readJson('packages/schema/package.json');
const activitySource = readText('packages/schema/src/activities.ts');

const evidenceSection = evidence.match(/## 10\. 参考文献[\s\S]*?(?=### 附：里程碑数据来源)/)?.[0] || '';
const references = [...evidenceSection.matchAll(/^(\d+)\.\s+(.+)$/gm)].map((match) => {
  const number = Number(match[1]);
  const raw = match[2].trim();
  const urlMatch = raw.match(/https?:\/\/\S+/);
  const url = urlMatch?.[0]?.replace(/[）。，；]+$/, '') || '';
  const title = stripMarkdown((url ? raw.slice(0, raw.indexOf(url)) : raw).replace(/[：:]\s*$/, ''));
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
  return { number, title, year: yearMatch ? Number(yearMatch[0]) : null, url, raw: stripMarkdown(raw) };
});

const activityBlock =
  activitySource.match(/BUILTIN_ACTIVITY_META:[\s\S]*?=\s*\{([\s\S]*?)\n\};/)?.[1] || '';
const activities = [...activityBlock.matchAll(
  /^\s*(['"]?[\w-]+['"]?):\s*\{\s*zh:\s*'([^']+)',\s*en:\s*'([^']+)',\s*ageRange:\s*\[(\d+),\s*(\d+)\]\s*\},?$/gm,
)].map((match) => ({
  type: match[1].replace(/^['"]|['"]$/g, ''),
  title: { zh: match[2], en: match[3] },
  ageRange: [Number(match[4]), Number(match[5])],
}));

const concepts = new Map(lexicon.concepts.map((concept) => [concept.id, concept]));
const selectedLessonId = 'core.s3.vehicles';
const selectedLesson = lessonById.get(selectedLessonId);
if (!selectedLesson) throw new Error(`Missing selected lesson: ${selectedLessonId}`);

const lessonSummary = (lesson) => ({
  id: lesson.id,
  title: lesson.title,
  summary: lesson.summary || null,
  ageRange: lesson.ageRange,
  domains: lesson.domains,
  themeId: lesson.themeId || null,
  durationMin: lesson.durationMin,
  coView: lesson.coView,
  audience: lesson.audience || 'child',
  parentGuide: lesson.parentGuide,
  offline: lesson.offline,
  printables: lesson.printables || [],
  stepTypes: lesson.steps.map((step) => step.type),
});

const lessonSummaries = lessons
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(lessonSummary);

const stageData = stages.map((stage) => {
  const stageLessonIds = stage.themes.flatMap((theme) => theme.lessons);
  const stageLessons = stageLessonIds.map((id) => lessonById.get(id)).filter(Boolean);
  const sampleId = stage.id === 's3' ? selectedLessonId : stageLessonIds[0];
  return {
    ...stage,
    lessonCount: stageLessons.length,
    parentLessonCount: stageLessons.filter((lesson) => lesson.audience === 'parent').length,
    childLessonCount: stageLessons.filter((lesson) => lesson.audience !== 'parent').length,
    sampleLessonId: sampleId,
    sampleLesson: sampleId ? lessonSummary(lessonById.get(sampleId)) : null,
  };
});

const illustrationsDir = path.join(siteRoot, 'assets/illustrations');
fs.rmSync(illustrationsDir, { recursive: true, force: true });
fs.mkdirSync(illustrationsDir, { recursive: true });
const selectedPrintableItems = selectedLesson.printables
  .filter((item) => item.kind === 'cards')
  .flatMap((item) => item.items);
const illustrationCredits = [];
const copiedIllustrations = [];
for (const conceptId of selectedPrintableItems) {
  const concept = concepts.get(conceptId);
  if (!concept?.image || copiedIllustrations.includes(concept.image)) continue;
  const targetName = path.basename(concept.image);
  copyFile(`content/packs/sprout-core/${concept.image}`, `assets/illustrations/${targetName}`);
  copiedIllustrations.push(concept.image);
  const source = sources.items[concept.image] || { source: 'unknown' };
  illustrationCredits.push({
    file: targetName,
    sourcePath: concept.image,
    source: source.source,
    name: source.name || null,
    license: source.source === 'fluent-emoji' ? 'MIT' : source.source === 'custom' ? 'CC0-1.0' : 'See source',
  });
}

const credits = [
  '# Illustration credits',
  '',
  'These files are copied from the main branch by `tools/extract-data.mjs`.',
  '',
  ...illustrationCredits.map((item) => {
    const origin =
      item.source === 'fluent-emoji'
        ? `Microsoft Fluent Emoji${item.name ? `, ${item.name}` : ''} · MIT`
        : item.source === 'custom'
          ? 'Sprout custom illustration · CC0-1.0'
          : `${item.source} · see the main branch`;
    return `- \`${item.file}\` ← \`${item.sourcePath}\`: ${origin}.`;
  }),
  '',
  'Fluent Emoji license: `content/packs/sprout-core/LICENSES.md` on the main branch.',
  'Custom illustration license: CC0-1.0, as declared in the main branch `assets/sources.json` and `LICENSES.md`.',
  '',
].join('\n');
fs.writeFileSync(path.join(illustrationsDir, 'CREDITS.md'), credits);

const readmeWordClaim = lexicon.concepts.length;
const tech = {
  node: rootPackage.engines?.node || '>=22',
  fastify: serverPackage.dependencies?.fastify || serverPackage.devDependencies?.fastify || 'Fastify',
  react: adminPackage.dependencies?.react || playerPackage.dependencies?.react || 'React',
  vite: adminPackage.devDependencies?.vite || playerPackage.devDependencies?.vite || 'Vite',
  antd: adminPackage.dependencies?.antd || 'Ant Design',
  capacitor: playerPackage.dependencies?.['@capacitor/core'] || 'Capacitor',
  zod: schemaPackage.dependencies?.zod || 'Zod',
  sqlite: 'node:sqlite',
};

const data = {
  generatedAt: 'source-derived',
  sources: {
    main: 'https://github.com/gxlself/ai-study',
    stages: 'content/packs/sprout-core/routes/_stages/s1..s6.json',
    lessons: 'content/packs/sprout-core/lessons/s1..s6/*.json',
    activities: 'packages/schema/src/activities.ts',
    evidence: 'docs/research/evidence-review.md',
    lexicon: 'content/packs/sprout-core/lexicon.json',
  },
  stats: {
    lessons: lessons.length,
    parentLessons: lessons.filter((lesson) => lesson.audience === 'parent').length,
    childLessons: lessons.filter((lesson) => lesson.audience !== 'parent').length,
    stages: stageData.length,
    activities: activities.length,
    wordEntries: lexicon.concepts.length,
    readmeWordEntries: readmeWordClaim,
    evidenceReferences: references.length,
  },
  selectedLessonId,
  stages: stageData,
  lessons: lessonSummaries,
  activities,
  references,
  selectedIllustrations: illustrationCredits,
  selectedConcepts: selectedPrintableItems.map((conceptId) => concepts.get(conceptId)).filter(Boolean),
  tech,
};

writeJson('data/site-data.json', data);
console.log(
  JSON.stringify(
    {
      mainRoot,
      stats: data.stats,
      selectedLesson: selectedLessonId,
      illustrations: copiedIllustrations.map((item) => path.basename(item)),
    },
    null,
    2,
  ),
);
