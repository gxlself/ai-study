import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { options, renderPlist } from '../macos/install.mjs';
import { checkContent } from '../check-content.mjs';

test('launchd 使用绝对 Node/仓库/数据路径并正确转义 XML，不遗留占位符', async () => {
  const template = await readFile(new URL('../macos/com.sprout.server.plist', import.meta.url), 'utf8');
  const config = options(['--repo', '/tmp/Sprout & Home', '--node', '/tmp/node 22/bin/node', '--data-dir', '/tmp/data<one>', '--port', '4410', '--timezone', 'Asia/Seoul', '--dry-run']);
  const plist = renderPlist(template, config);
  assert.ok(plist.includes('/tmp/Sprout &amp; Home/apps/server/dist/index.js'));
  assert.ok(plist.includes('/tmp/data&lt;one&gt;'));
  assert.ok(plist.includes('<string>4410</string>'));
  assert.ok(plist.includes('<string>Asia/Seoul</string>'));
  assert.ok(!/__[A-Z]+__/.test(plist));
  assert.equal(config.dryRun, true);
});

test('安装参数拒绝未知参数、缺值、非法端口与仓库根作为数据目录', () => {
  for (const args of [['--unknown', 'x'], ['--node'], ['--port', '0'], ['--port', '99999'], ['--port', 'no'], ['--repo', '/tmp/sprout', '--data-dir', '/tmp/sprout']]) {
    assert.throws(() => options(args));
  }
});

test('内容检查显式报告缺音，可严格拒绝无音、夹具、坏资源及路径穿越', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sprout-deploy-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bundle = { schemaVersion: 1, manifest: { id: 'sprout.core' }, lessons: [{ id: 'core.test.lesson' }], routes: [{ id: 'route' }], audio: null, lexicon: { concepts: [] }, builtAt: '2026-10-03T00:00:00Z' };
  const save = () => writeFile(join(root, 'bundle.json'), JSON.stringify(bundle));
  await save();
  assert.equal((await checkContent(root)).audio, 0);
  await assert.rejects(checkContent(root, true), /预生成朗读音频/);
  bundle.lessons[0].id = 'core.fixture.demo';
  await save();
  await assert.rejects(checkContent(root), /不能发布开发夹具/);
  bundle.lessons[0].id = 'core.test.lesson';
  bundle.lexicon.concepts = [{ image: '../outside.png' }];
  await save();
  await assert.rejects(checkContent(root), /包内相对路径/);
  bundle.lexicon.concepts = [{ image: 'missing.png' }];
  await save();
  await assert.rejects(checkContent(root), /ENOENT/);
  await mkdir(join(root, 'audio'));
  await writeFile(join(root, 'audio/test.m4a'), 'unit-test-audio');
  bundle.lexicon.concepts = [];
  bundle.audio = { entries: { 'zh:test': 'audio/test.m4a' } };
  await save();
  assert.equal((await checkContent(root, true)).audio, 1);
});

test('Docker 运行层不复制开发目录、私钥或真实家庭数据，使用非 root 和 /data', async () => {
  const docker = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const ignore = await readFile(new URL('../Dockerfile.dockerignore', import.meta.url), 'utf8');
  assert.ok(docker.includes('USER node'));
  assert.ok(docker.includes('VOLUME ["/data"]'));
  assert.ok(docker.includes('EXPOSE 4310'));
  assert.ok(docker.includes('pnpm-workspace.yaml'));
  for (const value of ['**/*.jks', '**/keystore.properties', 'apps/player/android', 'apps/player/ios', 'data', 'release']) assert.ok(ignore.split('\n').includes(value));
  assert.ok(!docker.split('AS runtime')[1].includes('COPY . .'));
});
