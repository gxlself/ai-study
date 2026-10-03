import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, readFile } from 'node:fs/promises';
import { isMain, PLAYER_ROOT } from './native-utils.mjs';
import { join } from 'node:path';

export async function normalizeIOSCapture(raw, target, rotation = 0) {
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('截图方向校正仅支持 0/90/180/270 度。');
  if (rotation) await promisify(execFile)('sips', ['--rotate', String(rotation), raw, '--out', target]);
  else await copyFile(raw, target);
  const png = await readFile(target);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

if (isMain(import.meta.url)) {
  const root = join(PLAYER_ROOT, 'test-artifacts/ios');
  normalizeIOSCapture(join(root, '01-ipad-launch-raw.png'), join(root, '01-ipad-launch.png'), Number(process.argv[2] ?? 0))
    .then((size) => console.info(`方向校正完成：${size.join('×')}；原始帧缓冲未修改。`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
