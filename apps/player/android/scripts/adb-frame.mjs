import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({ options: {
  name: { type: 'string' }, keys: { type: 'string', default: '' }, wait: { type: 'string', default: '500' },
} });
assert.match(values.name ?? '', /^[a-zA-Z0-9_-]+$/);
const keys = values.keys ? values.keys.split(',').map(Number) : [];
assert.ok(keys.every((key) => [4, 19, 20, 21, 22, 23, 66].includes(key)));
const wait = Number(values.wait);
assert.ok(Number.isInteger(wait) && wait >= 0 && wait <= 185000);
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = process.env.SPROUT_NATIVE_FINAL_RUN || '';
assert.match(run, /^[a-zA-Z0-9_-]*$/);
const artifacts = join(root, 'apps/player/test-artifacts/android-final', run);
const adb = join(process.env.ANDROID_HOME || join(process.env.HOME, 'Library/Android/sdk'), 'platform-tools/adb');
const args = ['-P', process.env.SPROUT_ADB_PORT || '5049', '-s', process.env.SPROUT_ANDROID_SERIAL || 'emulator-5582'];
const record = { name: values.name, keys, waitMs: wait, startedAt: new Date().toISOString() };
for (const key of keys) {
  await exec(adb, [...args, 'shell', 'input', 'keyevent', String(key)], { timeout: 15000 });
  await new Promise((done) => setTimeout(done, 250));
}
await new Promise((done) => setTimeout(done, wait));
const { stdout } = await exec(adb, [...args, 'exec-out', 'screencap', '-p'], {
  encoding: 'buffer', timeout: 20000, maxBuffer: 16 * 1024 * 1024,
});
assert.equal(stdout.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
record.size = [stdout.readUInt32BE(16), stdout.readUInt32BE(20)];
record.capturedAt = new Date().toISOString();
await writeFile(join(artifacts, `${values.name}.png`), stdout);
const trace = await readFile(join(artifacts, 'frame-trace.json'), 'utf8').then(JSON.parse).catch((error) => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
trace.push(record);
await writeFile(join(artifacts, 'frame-trace.json'), JSON.stringify(trace, null, 2) + '\n');
console.info(JSON.stringify(record));
