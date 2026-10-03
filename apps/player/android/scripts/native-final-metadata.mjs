import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(join(root, 'apps/server/package.json'));
const { unzipSync } = require('fflate');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = { checkedAt: new Date().toISOString(), apk: {}, content: {}, webAssets: {}, sourceFiles: {} };
const release = join(root, 'release');
const out = join(release, 't26-native-final');
const sourceRoots = ['apps/player/src', 'packages/activities/src', 'packages/core/src', 'packages/schema/src', 'packages/plugin-sdk/src'];
await mkdir(out, { recursive: true });
if (process.argv.includes('--capture-source')) {
  for (const path of sourceRoots) await scan(path);
  await writeFile(join(out, 'build-source.json'), JSON.stringify({ capturedAt: new Date().toISOString(), files: report.sourceFiles }, null, 2) + '\n');
  console.info(`已记录构建前源码：${Object.keys(report.sourceFiles).length} 文件。`);
  process.exit(0);
}
const { version } = JSON.parse(await readFile(join(root, 'apps/player/package.json'), 'utf8'));
const iosPublic = join(root, 'apps/player/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app/public');
const bundlePath = 'bundled/packs/sprout.core/bundle.json';
const bundles = {};
let webNames;
for (const variant of ['debug', 'release']) {
  const name = `sprout-player-${version}-${variant}.apk`;
  const bytes = await readFile(join(release, name));
  const zip = unzipSync(bytes);
  const bundle = JSON.parse(Buffer.from(zip[`assets/public/${bundlePath}`]).toString('utf8'));
  bundles[variant] = bundle;
  const checksum = (await readFile(join(release, `${name}.sha256`), 'utf8')).split(/\s+/)[0];
  assert.equal(hash(bytes), checksum);
  assert.equal(bundle.manifest.id, 'sprout.core');
  assert.ok(bundle.lessons.length >= 96 && bundle.lexicon.concepts.length > 6 && bundle.audio);
  const audioPaths = [...new Set(Object.values(bundle.audio.entries))];
  for (const path of audioPaths) assert.ok(zip[`assets/public/bundled/packs/sprout.core/${path}`]?.length, `APK 音频缺失：${path}`);
  for (const concept of bundle.lexicon.concepts) assert.ok(zip[`assets/public/bundled/packs/sprout.core/${concept.image}`]?.length, `APK 词条图片缺失：${concept.id}`);
  report.apk[variant] = {
    filename: name, bytes: bytes.length, mib: Number((bytes.length / 1048576).toFixed(2)),
    sha256: checksum, verifiedAudioFiles: audioPaths.length,
  };
  const names = Object.keys(zip).filter((path) => /^assets\/public\/assets\/.*\.(js|css)$/.test(path)).sort();
  webNames ??= names;
  assert.deepEqual(names, webNames);
  for (const path of names) {
    const relative = path.slice('assets/public/'.length);
    const digest = hash(zip[path]);
    assert.equal(digest, hash(await readFile(join(iosPublic, relative))), `双端网页产物不一致：${relative}`);
    assert.equal(digest, hash(await readFile(join(root, 'apps/player/dist', relative))), `网页 dist 在构建后发生变化：${relative}`);
    report.webAssets[relative] = digest;
  }
  report.content[variant] = {
    bundleSha256: hash(zip[`assets/public/${bundlePath}`]), builtAt: bundle.builtAt,
    lessons: bundle.lessons.length, steps: bundle.lessons.reduce((sum, lesson) => sum + lesson.steps.length, 0),
    parent: bundle.lessons.filter((lesson) => lesson.audience === 'parent').length,
    child: bundle.lessons.filter((lesson) => lesson.audience !== 'parent').length,
    concepts: bundle.lexicon.concepts.length, audio: Object.keys(bundle.audio.entries).length,
  };
}
bundles.ios = JSON.parse(await readFile(join(iosPublic, bundlePath), 'utf8'));
for (const [platform, bundle] of Object.entries(bundles)) {
  const { builtAt: ignored, ...semantic } = bundle;
  const { builtAt: ignoredDebug, ...expected } = bundles.debug;
  assert.deepEqual(semantic, expected, `两端正式内容不一致：${platform}`);
}
report.content.ios = { ...report.content.debug, builtAt: bundles.ios.builtAt,
  bundleSha256: hash(await readFile(join(iosPublic, bundlePath))) };
for (const path of Object.values(bundles.ios.audio.entries)) assert.ok((await stat(join(iosPublic, 'bundled/packs/sprout.core', path))).size > 0);
const sourceBundle = JSON.parse(await readFile(join(root, 'content/packs/sprout-core/bundle.json'), 'utf8'));
const { builtAt: ignoredSource, ...sourceSemantic } = sourceBundle;
const { builtAt: ignoredNative, ...nativeSemantic } = bundles.debug;
assert.deepEqual(sourceSemantic, nativeSemantic, '根正式 bundle 与原生内置内容不同，需要重建。');
async function scan(relative) {
  for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) report.sourceFiles[path] = hash(await readFile(join(root, path)));
  }
}
for (const path of sourceRoots) await scan(path);
const buildSource = await readFile(join(out, 'build-source.json'), 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (buildSource) {
  assert.deepEqual(report.sourceFiles, JSON.parse(buildSource).files, '构建过程中源码发生变化，请串行重新构建。');
  report.buildSourceVerified = true;
}
const modified = await Promise.all(Object.keys(report.sourceFiles).map(async (path) => (await stat(join(root, path))).mtimeMs));
report.sourceLatestModifiedAt = new Date(Math.max(...modified)).toISOString();
assert.ok(Math.max(...modified) <= (await stat(join(release, report.apk.release.filename))).mtimeMs, '源码比 APK 新，请重新构建。');
report.sourceFingerprint = hash(JSON.stringify(report.sourceFiles));
report.gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
report.ok = true;
await writeFile(join(out, 'metadata.json'), JSON.stringify(report, null, 2) + '\n');
console.info(JSON.stringify({ ...report, sourceFiles: `${Object.keys(report.sourceFiles).length} files` }, null, 2));
