import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { isMain, javaHome, PLAYER_ROOT, run } from './native-utils.mjs';

export async function createKey({ androidRoot = join(PLAYER_ROOT, 'android'), env = process.env, execute = run, getJavaHome = javaHome } = {}) {
  const key = join(androidRoot, 'keystore/sprout-release.jks');
  const properties = join(androidRoot, 'keystore.properties');
  if (existsSync(key) || existsSync(properties)) {
    if (!existsSync(key) || !existsSync(properties)) throw new Error('签名文件不完整；请恢复 keystore 及对应口令，不会覆盖已有密钥。');
    await chmod(key, 0o600);
    await chmod(properties, 0o600);
    console.info('已保留现有签名密钥。');
    return;
  }
  const password = env.SPROUT_KEYSTORE_PASSWORD || randomBytes(24).toString('hex');
  if (!/^[A-Za-z0-9_-]{12,}$/.test(password)) throw new Error('SPROUT_KEYSTORE_PASSWORD 须为至少 12 位字母、数字、下划线或短横线。');
  const home = getJavaHome(env);
  await mkdir(join(androidRoot, 'keystore'), { recursive: true, mode: 0o700 });
  await execute(join(home, 'bin/keytool'), [
    '-genkeypair', '-noprompt', '-keystore', key, '-storetype', 'JKS',
    '-alias', 'sprout', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
    '-dname', 'CN=Sprout Household, OU=Sprout, O=Sprout, L=Home, ST=Home, C=CN',
    '-storepass:env', 'SPROUT_KEYSTORE_PASSWORD', '-keypass:env', 'SPROUT_KEYSTORE_PASSWORD',
  ], { env: { ...env, JAVA_HOME: home, SPROUT_KEYSTORE_PASSWORD: password } });
  if (!(await stat(key)).size) throw new Error('keytool 没有生成有效密钥。');
  await chmod(key, 0o600);
  await writeFile(properties, [
    'storeFile=keystore/sprout-release.jks', `storePassword=${password}`,
    'keyAlias=sprout', `keyPassword=${password}`, '',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  console.info('已生成本地签名；密钥和口令均已 gitignore，请加密备份二者。');
}

if (isMain(import.meta.url)) {
  createKey().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
