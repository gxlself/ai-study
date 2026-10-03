import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const script = await readFile(new URL('../native-runtime.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t, implementation) {
  const dom = new JSDOM('<!doctype html><body><main class="home"></main></body>', { runScripts: 'outside-only', url: 'http://localhost' });
  t.after(() => dom.window.close());
  const calls = [];
  let hidden = false;
  let registrations = 0;
  Object.defineProperty(dom.window.document, 'hidden', { get: () => hidden });
  dom.window.Capacitor = { registerPlugin(name) {
    assert.equal(name, 'SproutScreen');
    registrations++;
    return { setAwake: async (options) => { calls.push(options.awake); await implementation?.(options); } };
  } };
  dom.window.eval(script);
  await tick();
  return {
    calls, doc: dom.window.document, win: dom.window,
    registrations: () => registrations,
    hidden(value) { hidden = value; dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')); },
    async html(html) { dom.window.document.body.innerHTML = html; await tick(); },
  };
}

const playing = '<main class="lesson-page phase-playing"><div class="activity-stage" aria-busy="false"></div></main>';

test('首页与导语不常亮，仅可见且未暂停的活动常亮', async (t) => {
  const f = await fixture(t);
  assert.equal(f.calls.at(-1), false);
  await f.html('<main class="lesson-page phase-intro"></main>');
  assert.deepEqual(f.calls, [false]);
  await f.html(playing);
  assert.equal(f.calls.at(-1), true);
  f.doc.querySelector('.activity-stage').setAttribute('aria-busy', 'true');
  await tick();
  assert.equal(f.calls.at(-1), false);
  f.doc.querySelector('.activity-stage').setAttribute('aria-busy', 'false');
  await tick();
  assert.equal(f.calls.at(-1), true);
  await f.html('<main class="lesson-page phase-ended"></main>');
  assert.equal(f.calls.at(-1), false);
});

test('家长门、暂停层、暗屏陪玩和后台均释放常亮', async (t) => {
  const f = await fixture(t);
  for (const block of ['parent-gate', 'pause-overlay']) {
    await f.html(playing);
    assert.equal(f.calls.at(-1), true);
    await f.html(`${playing}<div class="${block}"></div>`);
    assert.equal(f.calls.at(-1), false);
  }
  await f.html(playing);
  f.doc.querySelector('main').classList.add('guide-dim');
  await tick();
  assert.equal(f.calls.at(-1), false);
  await f.html(playing);
  f.hidden(true);
  await tick();
  assert.equal(f.calls.at(-1), false);
  f.hidden(false);
  await tick();
  assert.equal(f.calls.at(-1), true);
});

test('原生恢复强制重申状态，重复注入不重复订阅，页面离开释放', async (t) => {
  const f = await fixture(t);
  await f.html(playing);
  const before = f.calls.length;
  f.win.eval(script);
  assert.equal(f.registrations(), 1);
  f.win.dispatchEvent(new f.win.Event('sprout:native-resume'));
  await tick();
  assert.equal(f.calls.length, before + 1);
  assert.equal(f.calls.at(-1), true);
  f.win.dispatchEvent(new f.win.Event('pagehide'));
  await tick();
  assert.equal(f.calls.at(-1), false);
});

test('连续状态变化串行提交，不产生迟到的常亮覆盖', async (t) => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const f = await fixture(t, ({ awake }) => awake ? blocked : undefined);
  await f.html(playing);
  await f.html('<main class="home"></main>');
  assert.deepEqual(f.calls, [false, true]);
  release();
  await tick();
  assert.deepEqual(f.calls, [false, true, false]);
});

test('插件调用失败后可重试，不阻塞后续释放', async (t) => {
  let fail = true;
  const f = await fixture(t, () => { if (fail) { fail = false; throw new Error('test failure'); } });
  f.win.dispatchEvent(new f.win.Event('sprout:native-resume'));
  await tick();
  await f.html(playing);
  await f.html('<main class="home"></main>');
  assert.deepEqual(f.calls, [false, false, true, false]);
});
