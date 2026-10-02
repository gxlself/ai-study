import { createRequire } from 'node:module';
import { afterAll } from 'vitest';

// 先启动轻量 Node worker，再加载 jsdom，避免高负载机器的环境启动超时。
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000/', pretendToBeVisual: true,
});
for (const name of [
  'window', 'document', 'navigator', 'HTMLElement', 'HTMLMediaElement', 'HTMLVideoElement',
  'HTMLButtonElement', 'Node', 'Element', 'Event', 'EventTarget', 'MessageEvent', 'KeyboardEvent', 'MouseEvent', 'DOMException',
  'AbortController', 'AbortSignal', 'DOMParser',
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true, writable: true,
    value: name === 'window' ? dom.window : dom.window[name],
  });
}
Object.defineProperty(globalThis, 'getComputedStyle', {
  configurable: true, writable: true, value: dom.window.getComputedStyle.bind(dom.window),
});
afterAll(() => { dom.window.close(); });
