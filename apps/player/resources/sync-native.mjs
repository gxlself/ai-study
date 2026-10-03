import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMain, PLAYER_ROOT, RESOURCE_ROOT, run } from './native-utils.mjs';

export async function syncNative(platform) {
  if (platform && !['android', 'ios'].includes(platform)) throw new Error('平台只支持 android / ios。');
  await run('pnpm', ['exec', 'cap', 'sync', ...(platform ? [platform] : [])]);
  for (const name of platform ? [platform] : ['android', 'ios']) {
    const target = name === 'android'
      ? 'android/app/src/main/assets/sprout-native-runtime.js'
      : 'ios/App/App/sprout-native-runtime.js';
    await copyFile(join(RESOURCE_ROOT, 'native-runtime.js'), join(PLAYER_ROOT, target));
  }
}

if (isMain(import.meta.url)) {
  syncNative(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
