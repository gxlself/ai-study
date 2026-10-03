import { parse } from 'acorn';
import postcss from 'postcss';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

export function checkJavaScript(code, name = 'bundle.js') {
  const sourceType = name.endsWith('sw.js') ? 'script' : 'module';
  const ast = parse(code, { ecmaVersion: 2020, sourceType });
  const replacements = [];
  walk(ast, (node) => {
    if (node.type === 'ChainExpression' || (node.type === 'LogicalExpression' && node.operator === '??')) {
      throw new Error(`${name}: 不支持的 ${node.type}（位置 ${node.start}）`);
    }
    if (node.type === 'Literal' && node.regex && /\(\?<[=!]/.test(node.regex.pattern)) {
      throw new Error(`${name}: Safari 14 不支持正则 lookbehind`);
    }
    // Chromium 70 支持这三种语法；仅规范化它们后，再由 ES2018 解析器严格检查其余语法。
    if (node.type === 'ImportExpression') replacements.push([node.start, node.start + 6, '__import']);
    if (node.type === 'MetaProperty') replacements.push([node.start, node.end, '__importMeta']);
    if (node.type === 'CatchClause' && !node.param) replacements.push([node.body.start, node.body.start, '(compatError) ']);
  });
  let normalized = code;
  for (const [start, end, text] of replacements.sort((a, b) => b[0] - a[0])) {
    normalized = normalized.slice(0, start) + text + normalized.slice(end);
  }
  parse(normalized, { ecmaVersion: 2018, sourceType });
}

export function checkCSS(code, name = 'bundle.css') {
  const root = postcss.parse(code, { from: name });
  const layouts = new Map();
  const scope = (node) => {
    const parts = [];
    for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule') parts.unshift(`@${parent.name} ${parent.params}`);
    }
    return parts;
  };
  root.walkRules((rule) => {
    rule.walkDecls('display', (decl) => {
      for (const selector of rule.selectors) layouts.set(JSON.stringify([scope(rule), selector]), decl.value);
    });
    if (rule.parent.type === 'rule' || /:(?:is|where|has)\(|:focus-visible\b/.test(rule.selector)) {
      throw rule.error('不支持的嵌套或新选择器');
    }
  });
  const layoutFor = (rule, selector) => {
    const own = rule.nodes.find((node) => node.type === 'decl' && node.prop === 'display');
    if (own) return own.value;
    const parts = scope(rule);
    for (let length = parts.length; length >= 0; length--) {
      const value = layouts.get(JSON.stringify([parts.slice(0, length), selector]));
      if (value) return value;
    }
    return undefined;
  };
  root.walkDecls((decl) => {
    if (/^(?:aspect-ratio|inset(?:-.+)?|translate|scale|rotate)$/.test(decl.prop) ||
        /(?:\b(?:clamp|min|max|color-mix)\(|\d(?:dvh|svh|lvh|dvw|svw|lvw)\b)/.test(decl.value)) {
      throw decl.error('不支持的 CSS 属性或函数');
    }
    if (/^(?:gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)$/.test(decl.prop) &&
        !/^0(?:px)?(?: 0(?:px)?)?$/.test(decl.value) &&
        decl.parent.selectors?.some((selector) => layoutFor(decl.parent, selector)?.includes('flex'))) {
      throw decl.error('flex 间距必须使用 margin，不能使用 gap');
    }
    if (decl.prop.includes('backdrop-filter')) {
      const background = decl.parent.nodes.find((node) => node.type === 'decl' && /^(background|background-color)$/.test(node.prop));
      if (!background || /transparent|rgba|hsla|color-mix/.test(background.value)) {
        throw decl.error('backdrop-filter 需要不透明背景回退');
      }
    }
  });
}

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(file));
    else if (['.js', '.mjs', '.css'].includes(extname(file))) files.push(file);
  }
  return files;
}

export async function checkBuild(directory) {
  const files = await filesIn(directory);
  if (!files.some((file) => file.endsWith('sw.js')) || !files.some((file) => /assets\/.+\.js$/.test(file))) {
    throw new Error('缺少构建 JS 或 Service Worker；请先运行完整的 player build');
  }
  for (const file of files) {
    const code = await readFile(file, 'utf8');
    if (file.endsWith('.css')) checkCSS(code, file);
    else checkJavaScript(code, file);
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '../dist');
  try {
    const files = await checkBuild(directory);
    console.log(`电视兼容检查通过：${files.length} 个 JS/CSS（含 sw.js），Chrome 70 / Safari 14 语法基线。`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
