import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { generateAudio, renderSpeech, type SpeechRenderer } from '../../../../scripts/gen-audio';

const pack = fileURLToPath(new URL('../', import.meta.url));
assert.equal(process.platform, 'darwin', '真实离线音频需在macOS生成，不能用跳过结果代替。');
let queue: Promise<void> = Promise.resolve();
let completed = 0;

// 复用正式生成器，只将底层系统语音调用排成单队列，降低并行开发时的压力。
const renderSerial: SpeechRenderer = (entry, voice, rate, target) => {
  const next = queue.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await renderSpeech(entry, voice, rate, target);
        completed++;
        if (completed % 20 === 0) console.log(`真实音频已串行生成 ${completed} 条`);
        return;
      } catch (error) {
        if (attempt === 1) throw error;
        console.log(`系统语音重试：${entry.key}`);
        await setTimeout(1000);
      }
    }
  });
  queue = next.catch(() => undefined);
  return next;
};

const result = await generateAudio(pack, { prune: true }, { render: renderSerial });
assert.equal(result.failed, 0, JSON.stringify(result.issues));
assert.ok(result.planned > 0);
console.log(JSON.stringify(result, null, 2));
