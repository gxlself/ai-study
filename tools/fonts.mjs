import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets/fonts');
const tempDir = path.join(os.tmpdir(), 'sprout-fonts');
const python = fs.existsSync('/opt/homebrew/bin/python3') ? '/opt/homebrew/bin/python3' : 'python3';

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });
const curl = (url, output) => {
  if (fs.existsSync(output) && fs.statSync(output).size > 0) return;
  run('/usr/bin/curl', ['-fL', '--retry', '3', '--connect-timeout', '20', url, '-o', output]);
};
const curlText = (url, fallback) => {
  try {
    return execFileSync('/usr/bin/curl', ['-fsSL', '--retry', '3', '--connect-timeout', '20', url], {
      encoding: 'utf8',
    });
  } catch {
    return fallback;
  }
};

const frauncesTgz = path.join(tempDir, 'fraunces-5.3.0.tgz');
const nunitoTgz = path.join(tempDir, 'nunito-5.3.0.tgz');
const lxgwTtf = path.join(tempDir, 'LXGWWenKai-Regular.ttf');
curl('https://registry.npmjs.org/@fontsource-variable/fraunces/-/fraunces-5.3.0.tgz', frauncesTgz);
curl('https://registry.npmjs.org/@fontsource/nunito/-/nunito-5.3.0.tgz', nunitoTgz);
curl('https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf', lxgwTtf);

const unpack = (archive, destination) => {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  run('/usr/bin/tar', ['-xzf', archive, '-C', destination]);
};
const frauncesDir = path.join(tempDir, 'fraunces');
const nunitoDir = path.join(tempDir, 'nunito');
unpack(frauncesTgz, frauncesDir);
unpack(nunitoTgz, nunitoDir);

const findFile = (directory, name) => {
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(target);
      else if (entry.name === name) return target;
    }
  }
  return null;
};

const frauncesSource =
  findFile(frauncesDir, 'fraunces-latin-soft-normal.woff2') ||
  findFile(frauncesDir, 'fraunces-latin-wght-normal.woff2');
const nunitoSource = findFile(nunitoDir, 'nunito-latin-400-normal.woff2');
if (!frauncesSource || !nunitoSource) throw new Error('Could not find the extracted Latin font files.');

const textSources = [
  path.join(root, 'src/template.html'),
];
const uiZh = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/zh.json'), 'utf8'));
const uiEn = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8'));
const siteData = JSON.parse(fs.readFileSync(path.join(root, 'data/site-data.json'), 'utf8'));
const headingText = [
  uiZh.hero.title,
  uiEn.hero.title,
  uiZh.principles.title,
  uiEn.principles.title,
  uiZh.stages.title,
  uiEn.stages.title,
  uiZh.lesson.title,
  uiEn.lesson.title,
  uiZh.activities.title,
  uiEn.activities.title,
  uiZh.home.title,
  uiEn.home.title,
  uiZh.try.title,
  uiEn.try.title,
  uiZh.evidence.title,
  uiEn.evidence.title,
  uiZh.dev.title,
  uiEn.dev.title,
  uiZh.faq.title,
  uiEn.faq.title,
  uiZh.notFound?.title,
  ...uiZh.principles.items.flatMap((item) => [item.label, item.title]),
  ...uiEn.principles.items.flatMap((item) => [item.label, item.title]),
  ...uiZh.faq.items.map((item) => item.q),
  ...uiEn.faq.items.map((item) => item.q),
  ...siteData.stages.flatMap((stage) => [
    stage.title.zh,
    stage.title.en,
    ...stage.themes.flatMap((theme) => [theme.title.zh, theme.title.en]),
    stage.sampleLesson?.title?.zh,
    stage.sampleLesson?.title?.en,
  ]),
  ...siteData.activities.flatMap((activity) => [activity.title.zh, activity.title.en]),
  ...siteData.references.map((reference) => reference.title),
  uiZh.lessonVehiclesEn?.offlineTitle,
].filter(Boolean);
const cnText = [
  ...textSources
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf8')),
  headingText.join('\n'),
].join('\n');
const latinText = [
  cnText,
  fs.readFileSync(path.join(root, 'src/i18n/zh.json'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8'),
  fs.readFileSync(path.join(root, 'data/site-data.json'), 'utf8'),
].join('\n');
const cnChars = [...new Set([...cnText].filter((char) => /[\u3400-\u9fff\u3000-\u303f\uff01-\uffef]/u.test(char)))].join('');
const latinChars = [...new Set([...latinText].filter((char) => /[A-Za-z0-9À-ÿ .,;:!?'"“”‘’(){}\[\]<>/\\+=_#%&@*·–—-]/u.test(char)))].join('');
fs.writeFileSync(path.join(tempDir, 'cn.txt'), cnChars);
fs.writeFileSync(path.join(tempDir, 'latin.txt'), latinChars);

const subset = (input, output, textFile, extra = []) => {
  run(python, [
    '-m',
    'fontTools.subset',
    input,
    `--output-file=${output}`,
    '--flavor=woff2',
    '--layout-features=*',
    '--no-hinting',
    '--desubroutinize',
    `--text-file=${textFile}`,
    ...extra,
  ]);
};

subset(lxgwTtf, path.join(outDir, 'lxgw-wenkai-subset.woff2'), path.join(tempDir, 'cn.txt'));
subset(frauncesSource, path.join(outDir, 'fraunces-soft.woff2'), path.join(tempDir, 'latin.txt'));
subset(nunitoSource, path.join(outDir, 'nunito-400.woff2'), path.join(tempDir, 'latin.txt'));

const licenseFallback = `This font is distributed under the SIL Open Font License 1.1.\nSee https://scripts.sil.org/OFL\n`;
const licenses = [
  [
    'LXGW-WenKai-OFL.txt',
    'https://raw.githubusercontent.com/lxgw/LxgwWenKai/master/OFL.txt',
    licenseFallback,
  ],
  [
    'Fraunces-OFL.txt',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt',
    licenseFallback,
  ],
  [
    'Nunito-OFL.txt',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt',
    licenseFallback,
  ],
];
for (const [file, url, fallback] of licenses) fs.writeFileSync(path.join(outDir, file), curlText(url, fallback));

const sizes = Object.fromEntries(
  ['lxgw-wenkai-subset.woff2', 'fraunces-soft.woff2', 'nunito-400.woff2'].map((file) => [
    file,
    fs.statSync(path.join(outDir, file)).size,
  ]),
);
console.log(JSON.stringify({ characters: { chinese: cnChars.length, latin: latinChars.length }, bytes: sizes }, null, 2));
