import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKey } from '../keygen.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sprout-keygen-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('口令通过环境传给 keytool，文件权限严格且二次执行不换签名', async (t) => {
  const root = await fixture(t);
  let calls = 0;
  const config = {
    androidRoot: root, env: { SPROUT_KEYSTORE_PASSWORD: 'test_password_only_123' },
    getJavaHome: () => '/test/java',
    execute: async (_command, args, opts) => {
      calls++;
      assert.ok(!args.includes(opts.env.SPROUT_KEYSTORE_PASSWORD));
      assert.ok(args.includes('-storepass:env'));
      await writeFile(join(root, 'keystore/sprout-release.jks'), 'unit-test-keystore');
    },
  };
  await createKey(config);
  const key = await readFile(join(root, 'keystore/sprout-release.jks'));
  assert.equal((await stat(join(root, 'keystore.properties'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(root, 'keystore/sprout-release.jks'))).mode & 0o777, 0o600);
  await createKey(config);
  assert.equal(calls, 1);
  assert.deepEqual(await readFile(join(root, 'keystore/sprout-release.jks')), key);
});

test('只有密钥或只有口令时拒绝覆盖', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'keystore'));
  await writeFile(join(root, 'keystore/sprout-release.jks'), 'unit-test-old-key');
  await assert.rejects(createKey({ androidRoot: root }), /签名文件不完整/);
  assert.equal(await readFile(join(root, 'keystore/sprout-release.jks'), 'utf8'), 'unit-test-old-key');
});

test('弱口令在创建密钥前拒绝', async (t) => {
  const root = await fixture(t);
  await assert.rejects(createKey({ androidRoot: root, env: { SPROUT_KEYSTORE_PASSWORD: 'weak' } }), /至少 12 位/);
});
