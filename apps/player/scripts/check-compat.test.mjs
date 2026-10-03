import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCSS, checkJavaScript } from './check-compat.mjs';

describe('构建语法检查', () => {
  it('允许旧内核已有的动态 import、import.meta 和省略 catch 变量', () => {
    checkJavaScript('const url = import.meta.url; async function load() { try { await import(url); } catch { return null; } }');
  });
  it('不把注释、字符串和正则中的问号误报成新语法', () => {
    checkJavaScript('const text = "?. ?? #field"; const re = /ab??/; // ?. \\n');
  });
  for (const code of [
    'a?.b', 'a ?? b', 'class A { #x = 1 }', 'class A { x = 1 }',
    'await load()', 'a ||= b', 'const n = 1_000', 'const n = 1n',
    'const re = /(?<=a)b/', 'const re = /a/d',
  ]) {
    it(`拒绝超纲语法：${code}`, () => assert.throws(() => checkJavaScript(code)));
  }
  it('Service Worker 不能夹带 ESM 或未经编译的新语法', () => {
    assert.throws(() => checkJavaScript('import "./x.js"', 'sw.js'));
    assert.throws(() => checkJavaScript('const a = x ?? ""', 'sw.js'));
    checkJavaScript('self.addEventListener("install", async () => {});', 'sw.js');
  });
});

describe('构建 CSS 检查', () => {
  it('允许 grid gap 和显式定位', () => checkCSS('.grid { display: grid; grid-gap: 12px } .fill { top: 0; left: 0; width: 100% }'));
  it('拒绝 flex gap，包括拆分到另一条规则的间距', () => {
    assert.throws(() => checkCSS('.row { display: flex } .row { gap: 12px }'));
  });
  it('响应式 grid 切换为 flex 并清零 gap 时不误报', () => {
    checkCSS('.layout { display: grid; grid-gap: 12px } @media (max-width: 700px) { .layout { display: flex; grid-gap: 0 } }');
    checkCSS('.layout { display: grid } @media (min-width: 700px) { .layout { grid-gap: 12px } } @media (max-width: 700px) { .layout { display: flex; grid-gap: 0 } }');
  });
  for (const rule of [
    'aspect-ratio: 1', 'inset: 0', 'width: min(100%, 400px)', 'font-size: clamp(12px, 2vw, 18px)',
    'height: 100svh', 'background: color-mix(in srgb, red, white)', 'translate: 2px',
  ]) {
    it(`拒绝不兼容声明：${rule}`, () => assert.throws(() => checkCSS(`.box { ${rule} }`)));
  }
  it('拒绝新选择器和 CSS 嵌套', () => {
    assert.throws(() => checkCSS(':where(.box) { color: red }'));
    assert.throws(() => checkCSS('.box { & p { color: red } }'));
  });
  it('滤镜必须有可独立阅读的不透明背景', () => {
    assert.throws(() => checkCSS('.box { backdrop-filter: blur(10px) }'));
    checkCSS('.box { background: #fff; backdrop-filter: blur(10px) }');
  });
});
