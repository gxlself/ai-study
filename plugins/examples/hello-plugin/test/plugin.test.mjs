import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { PluginManifest, pickText } from '@sprout/schema';
import plugin, { readHelloProps } from '../src/index.ts';

const tools = createRequire(new URL('../../../../packages/activities/package.json', import.meta.url));
const { JSDOM } = tools('jsdom');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(t, props = { count: 3 }, overrides = {}) {
  const dom = new JSDOM('<main id="stage"></main><p id="outside">unchanged</p>');
  const stage = dom.window.document.getElementById('stage');
  const controller = new AbortController();
  const calls = { speech: [], complete: [], log: [], stops: 0 };
  const listeners = new Set();
  let focused = null;
  const ctx = {
    props: readHelloProps(props), signal: controller.signal, sdkVersion: '1.0.0',
    locale: { mode: 'zh-en', pick: (text) => pickText(text, 'zh-en'), showPinyin: false },
    input: { mode: 'dpad', onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    reducedMotion: false,
    speak: async (speech) => { calls.speech.push(speech); },
    sfx() {},
    complete: (result) => { calls.complete.push(result); },
    stopSpeaking() { calls.stops++; },
    setParentHint() {},
    log: (type, data) => calls.log.push({ type, data }),
    focus: {
      current: () => focused,
      focus: (element) => { focused = element; element?.focus(); },
      refresh() { if (!focused || focused.disabled) focused = stage.querySelector('button:not(:disabled)'); },
    },
    ...overrides,
  };
  const instance = plugin.mount(stage, ctx);
  t.after(() => { instance.unmount(); dom.window.close(); });
  return { stage, instance, ctx, calls, controller, listeners, dom };
}

test('清单声明与源码一致，默认 props 可用，源码无运行时 React 依赖', async () => {
  const manifest = PluginManifest.parse(JSON.parse(await readFile(new URL('../plugin.json', import.meta.url))));
  assert.equal(manifest.id, 'example.hello');
  assert.equal(manifest.activities[0].type, plugin.type);
  assert.equal(manifest.version, plugin.version);
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(readHelloProps({}), manifest.activities[0].defaultProps);
  assert.equal(manifest.activities[0].propsSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]react/);
});

test('props 拒绝越界、非整数和不合约标题，保留默认值', () => {
  for (const count of [0, 6, 1.5, '3', NaN, null]) assert.throws(() => readHelloProps({ count }));
  for (const title of ['', null, {}, { zh: '' }, { zh: '好', en: '' }]) assert.throws(() => readHelloProps({ title }));
  assert.throws(() => readHelloProps({ unknown: true }));
  assert.equal(readHelloProps({ title: { zh: '数一数' } }).count, 3);
});

test('逐颗点按只计一次，朗读唱数和基数，只完成一次', async (t) => {
  const { stage, calls, dom } = setup(t);
  const buttons = stage.querySelectorAll('button');
  for (const button of buttons) {
    button.click();
    button.click();
    await flush();
  }
  assert.deepEqual(calls.speech.map((speech) => speech.zh), ['一', '二', '三', '一共三颗星星']);
  assert.deepEqual(calls.complete, [{ data: { count: 3 } }]);
  buttons[0].click();
  await flush();
  assert.equal(calls.complete.length, 1);
  assert.equal(dom.window.document.getElementById('outside').textContent, 'unchanged');
});

test('遥控器左右和 OK，与点按共享路径；返回键交给宿主', async (t) => {
  const { instance, calls } = setup(t, { count: 2 });
  assert.equal(instance.onKey('back'), false);
  assert.equal(instance.onKey('right'), true);
  instance.onKey('ok');
  await flush();
  instance.onKey('left');
  instance.onKey('ok');
  await flush();
  assert.deepEqual(calls.speech.map((speech) => speech.zh), ['一', '二', '一共两颗星星']);
  assert.equal(calls.complete.length, 1);
});

test('暂停期间不能推进，恢复后可完成', async (t) => {
  const { instance, stage, calls } = setup(t, { count: 1 });
  instance.pause();
  stage.querySelector('button').click();
  instance.onKey('ok');
  assert.equal(calls.speech.length, 0);
  instance.resume();
  instance.onKey('ok');
  await flush();
  assert.equal(calls.complete.length, 1);
});

test('最后一次朗读途中暂停，旧 promise 不完成，恢复只完成一次', async (t) => {
  const waiting = [];
  const { instance, calls } = setup(t, { count: 1 }, {
    speak: () => new Promise((resolve) => waiting.push(resolve)),
  });
  instance.onKey('ok');
  instance.pause();
  waiting.shift()();
  await flush();
  assert.equal(calls.complete.length, 0);
  instance.resume();
  waiting.shift()();
  await flush();
  assert.equal(calls.complete.length, 1);
});

test('中止会清理订阅和 DOM，未决朗读不能晚到完成', async (t) => {
  let resolve;
  const { instance, stage, calls, controller, listeners } = setup(t, { count: 1 }, {
    speak: () => new Promise((done) => { resolve = done; }),
  });
  instance.onKey('ok');
  controller.abort();
  resolve();
  await flush();
  assert.equal(stage.childElementCount, 0);
  assert.equal(listeners.size, 0);
  assert.equal(calls.complete.length, 0);
  instance.unmount();
  instance.unmount();
});

test('卸载幂等、支持减少动画与输入文案订阅', (t) => {
  const { instance, stage, listeners } = setup(t, { count: 2 }, { reducedMotion: true });
  assert.ok(stage.querySelector('[data-reduced-motion]'));
  for (const listener of listeners) listener('touch');
  assert.match(stage.querySelector('p').textContent, /点一点/);
  instance.unmount();
  instance.unmount();
  assert.equal(stage.childElementCount, 0);
  assert.equal(listeners.size, 0);
});

test('speeches 完整包含全部唱数和基数，preload 无外链', () => {
  const props = readHelloProps({ count: 5 });
  assert.equal(plugin.speeches(props).length, 6);
  assert.deepEqual(plugin.preload(props), []);
});
