import { randomUUID } from 'node:crypto';
import {
  closeSync, constants, linkSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser, XMLSerializer, type Element, type Node } from '@xmldom/xmldom';

export const FLUENT_TREE_URL = 'https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1';
export const FLUENT_RAW_URL = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/';
export const TREE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const DEFAULT_CACHE_FILE = fileURLToPath(new URL('../.cache/fluent-tree.json', import.meta.url));
export const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_TREE_BYTES = 32 * 1024 * 1024;

export interface FluentSource {
  source: 'fluent-emoji';
  name: string;
  style: string;
  skinTone?: string;
}

export type AssetSource = FluentSource | { source: 'custom' };
export type FetchImplementation = typeof globalThis.fetch;

export interface NetworkOptions {
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
  return `${error.name}: ${error.message}${cause}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFsError(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function pathSegments(path: string): string[] {
  const parts = path.split('/');
  if (
    !path || /[\\%:?#\u0000-\u001f\u007f]/u.test(path)
    || parts.some((part) => !part || part === '.' || part === '..' || part.trim() !== part || /[. ]$/.test(part))
  ) {
    throw new Error(`不安全的相对路径：${JSON.stringify(path)}`);
  }
  return parts;
}

export function canonicalDirectory(path: string): string {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`目录不能是符号链接或非目录：${path}`);
  }
  return realpathSync(path);
}

/** 从可信根逐级检查，不跟随符号链接；建目录时也逐级检查。 */
export function checkedFile(root: string, relativePath: string, createParents = false): { path: string; exists: boolean } {
  const parts = pathSegments(relativePath);
  canonicalDirectory(root);
  let current = root;
  for (let i = 0; i < parts.length; i += 1) {
    current = join(current, parts[i]);
    const last = i === parts.length - 1;
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (!isFsError(error, 'ENOENT')) throw error;
      if (last || !createParents) return { path: join(root, ...parts), exists: false };
      try {
        mkdirSync(current);
      } catch (mkdirError) {
        if (!isFsError(mkdirError, 'EEXIST')) throw mkdirError;
      }
      stat = lstatSync(current);
    }
    if (stat.isSymbolicLink()) throw new Error(`拒绝符号链接：${current}`);
    if (last ? !stat.isFile() : !stat.isDirectory()) {
      throw new Error(`路径类型错误，需要${last ? '普通文件' : '目录'}：${current}`);
    }
  }
  return { path: current, exists: true };
}

export function assetFile(packDir: string, assetPath: string): { path: string; exists: boolean } {
  const parts = pathSegments(assetPath);
  if (parts.length < 3 || parts[0] !== 'assets' || parts[1] !== 'images') {
    throw new Error(`资源目标仅允许在 assets/images/ 内：${JSON.stringify(assetPath)}`);
  }
  return checkedFile(packDir, assetPath);
}

function atomicWrite(root: string, relativePath: string, contents: string, force: boolean): 'written' | 'skipped' {
  const target = checkedFile(root, relativePath, true);
  if (target.exists && !force) return 'skipped';
  const tempRelative = `${dirname(relativePath)}/.${basename(relativePath)}.${randomUUID()}.tmp`;
  const temporary = checkedFile(root, tempRelative);
  let created = false;
  try {
    const fd = openSync(temporary.path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
    created = true;
    try {
      writeFileSync(fd, contents, 'utf8');
    } finally {
      closeSync(fd);
    }
    checkedFile(root, relativePath);
    if (force) {
      renameSync(temporary.path, target.path);
    } else {
      // link 不覆盖并发出现的文件，rename 则用于明确要求的替换；均不写穿硬链接。
      try {
        linkSync(temporary.path, target.path);
      } catch (error) {
        if (!isFsError(error, 'EEXIST')) throw error;
        checkedFile(root, relativePath);
        return 'skipped';
      }
    }
    return 'written';
  } finally {
    if (created && checkedFile(root, tempRelative).exists) unlinkSync(temporary.path);
  }
}

export function writeAsset(packDir: string, assetPath: string, svg: string, force = false): 'written' | 'skipped' {
  assetFile(packDir, assetPath);
  return atomicWrite(packDir, assetPath, svg, force);
}

function sourceSegment(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new Error(`${field} 必须是非空字符串（最多 200 字符）`);
  }
  const clean = value.trim();
  if (clean === '.' || clean === '..' || /[/\\\u0000-\u001f\u007f]/u.test(clean)) {
    throw new Error(`${field} 不能包含路径分隔符或控制字符`);
  }
  return clean;
}

export function parseAssetSource(value: unknown): AssetSource {
  if (!isRecord(value)) throw new Error('来源项必须是对象');
  if (value.source === 'custom') return { source: 'custom' };
  if (value.source !== 'fluent-emoji') throw new Error(`不支持的 source：${JSON.stringify(value.source)}`);
  return {
    source: 'fluent-emoji',
    name: sourceSegment(value.name, 'name'),
    style: sourceSegment(value.style, 'style'),
    ...(value.skinTone === undefined ? {} : { skinTone: sourceSegment(value.skinTone, 'skinTone') }),
  };
}

function fluentParts(path: string): string[] | undefined {
  const parts = path.split('/');
  if (
    (parts.length !== 4 && parts.length !== 5) || parts[0] !== 'assets'
    || !parts.at(-1)?.toLowerCase().endsWith('.svg')
    || parts.some((part) => !part || part === '.' || part === '..' || /[\\\u0000-\u001f\u007f]/u.test(part))
  ) return undefined;
  return parts;
}

export function editDistance(a: string, b: string): number {
  const left = [...a.toLowerCase()];
  const right = [...b.toLowerCase()];
  let row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 0; i < left.length; i += 1) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (left[i] === right[j] ? 0 : 1)));
    }
    row = next;
  }
  return row[right.length];
}

export function suggestNames(name: string, names: Iterable<string>, limit = 5): string[] {
  return [...new Set(names)].map((candidate) => ({ candidate, distance: editDistance(name.trim(), candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate, 'en'))
    .slice(0, limit).map(({ candidate }) => candidate);
}

function matchSpelling(requested: string, available: string[], field: string): string {
  const names = [...new Set(available)];
  if (names.includes(requested)) return requested;
  const matches = names.filter((name) => name.toLowerCase() === requested.toLowerCase());
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`${field} 大小写匹配有歧义：${matches.join('、')}`);
  const options = field === 'name' ? suggestNames(requested, names) : names;
  throw new Error(`找不到 ${field} "${requested}"；${field === 'name' ? '相近名称建议' : '可用值'}：${options.join('、') || '无'}`);
}

export function resolveFluentPath(paths: readonly string[], source: FluentSource): string {
  const entries = paths.flatMap((path) => {
    const parts = fluentParts(path);
    return parts ? [{ path, name: parts[1], style: parts.at(-2)!, skinTone: parts.length === 5 ? parts[2] : undefined }] : [];
  });
  const request = parseAssetSource(source) as FluentSource;
  const name = matchSpelling(request.name, entries.map((entry) => entry.name), 'name');
  let candidates = entries.filter((entry) => entry.name === name);
  if (request.skinTone !== undefined) {
    const tone = matchSpelling(request.skinTone, candidates.flatMap((entry) => entry.skinTone === undefined ? [] : [entry.skinTone]), 'skinTone');
    candidates = candidates.filter((entry) => entry.skinTone === tone);
  } else {
    const direct = candidates.filter((entry) => entry.skinTone === undefined);
    if (direct.length) {
      candidates = direct;
    } else {
      const tone = matchSpelling('Default', candidates.flatMap((entry) => entry.skinTone ? [entry.skinTone] : []), 'skinTone（未填写时使用 Default）');
      candidates = candidates.filter((entry) => entry.skinTone === tone);
    }
  }
  const style = matchSpelling(request.style, candidates.map((entry) => entry.style), 'style');
  const matches = [...new Set(candidates.filter((entry) => entry.style === style).map((entry) => entry.path))];
  if (matches.length !== 1) throw new Error(`Fluent 路径有歧义，拒绝任选文件：${matches.join('、')}`);
  return matches[0];
}

async function readResponse(response: Response, maxBytes: number): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel();
    throw new Error(`响应超过大小限制 ${maxBytes} 字节`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(`响应超过大小限制 ${maxBytes} 字节`);
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function fetchText(url: string, maxBytes: number, options: NetworkOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: url === FLUENT_TREE_URL ? 'application/vnd.github+json' : 'image/svg+xml', 'User-Agent': 'Sprout-content-assets' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    throw new Error(`请求失败 ${url}：${errorMessage(error)}`);
  }
  if (!response.ok) {
    const body = await readResponse(response, 4096).catch(() => '');
    let detail = body.trim().slice(0, 300);
    try {
      const parsed: unknown = JSON.parse(body);
      if (isRecord(parsed) && typeof parsed.message === 'string') detail = parsed.message.slice(0, 300);
    } catch { /* 非 JSON 错误页保留短摘要。 */ }
    const retry = response.headers.get('retry-after');
    const limited = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
    throw new Error(`HTTP ${response.status} ${response.statusText} ${url}${detail ? `：${detail}` : ''}${limited ? '；GitHub 限流，请稍后重试' : ''}${retry ? `；Retry-After: ${retry}` : ''}`);
  }
  if (response.redirected || (response.url && response.url !== url)) {
    await response.body?.cancel();
    throw new Error(`拒绝重定向响应：${url}`);
  }
  try {
    return await readResponse(response, maxBytes);
  } catch (error) {
    throw new Error(`读取响应失败 ${url}：${errorMessage(error)}`);
  }
}

interface TreeCache {
  schemaVersion: 1;
  fetchedAt: string;
  paths: string[];
}

export interface TreeResult extends TreeCache {
  source: 'network' | 'cache' | 'stale-cache';
}

export interface TreeOptions extends NetworkOptions {
  cacheFile?: string;
  now?: number;
  warn?: (message: string) => void;
}

function treePaths(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.tree) || typeof value.truncated !== 'boolean') {
    throw new Error('GitHub tree 响应格式错误，需要 tree 数组和 truncated 标记');
  }
  if (value.truncated) throw new Error('GitHub recursive tree 已截断，不能作为完整索引使用');
  const paths: string[] = [];
  for (const entry of value.tree) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || typeof entry.type !== 'string') {
      throw new Error('GitHub tree 包含非法条目');
    }
    if (entry.type === 'blob' && entry.mode !== '120000' && fluentParts(entry.path)) paths.push(entry.path);
  }
  if (!paths.length) throw new Error('GitHub tree 没有可用的 Fluent SVG 路径');
  return [...new Set(paths)].sort();
}

function parseCache(value: unknown, now: number): TreeCache {
  if (
    !isRecord(value) || value.schemaVersion !== 1 || typeof value.fetchedAt !== 'string'
    || !Number.isFinite(Date.parse(value.fetchedAt)) || Date.parse(value.fetchedAt) > now
    || !Array.isArray(value.paths) || !value.paths.length
    || !value.paths.every((path) => typeof path === 'string' && fluentParts(path))
  ) throw new Error('索引缓存结构、时间或路径无效');
  return { schemaVersion: 1, fetchedAt: value.fetchedAt, paths: [...new Set(value.paths as string[])] };
}

export async function loadFluentTree(options: TreeOptions = {}): Promise<TreeResult> {
  const now = options.now ?? Date.now();
  const warn = options.warn ?? (() => undefined);
  const cacheFile = resolve(options.cacheFile ?? DEFAULT_CACHE_FILE);
  const cacheRoot = dirname(dirname(cacheFile));
  const cacheRelative = `${basename(dirname(cacheFile))}/${basename(cacheFile)}`;
  let cache: TreeCache | undefined;
  try {
    const file = checkedFile(canonicalDirectory(cacheRoot), cacheRelative);
    if (file.exists) {
      if (lstatSync(file.path).size > MAX_TREE_BYTES) throw new Error('索引缓存过大');
      cache = parseCache(JSON.parse(readFileSync(file.path, 'utf8')), now);
    }
  } catch (error) {
    warn(`忽略不可用缓存 ${cacheFile}：${errorMessage(error)}`);
  }
  if (cache && now - Date.parse(cache.fetchedAt) < TREE_CACHE_TTL_MS) {
    return { ...cache, source: 'cache' };
  }
  let paths: string[];
  try {
    const text = await fetchText(FLUENT_TREE_URL, MAX_TREE_BYTES, options);
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new Error('GitHub tree 返回的不是合法 JSON'); }
    paths = treePaths(json);
  } catch (error) {
    if (!cache) throw new Error(`Fluent 索引不可用，且无有效缓存：${errorMessage(error)}`);
    warn(`索引刷新失败：${errorMessage(error)}；回退过期缓存（${cache.fetchedAt}），仅能离线解析名称，缺失 SVG 仍需联网下载`);
    return { ...cache, source: 'stale-cache' };
  }
  const fresh: TreeCache = { schemaVersion: 1, fetchedAt: new Date(now).toISOString(), paths };
  try {
    atomicWrite(canonicalDirectory(cacheRoot), cacheRelative, `${JSON.stringify(fresh)}\n`, true);
  } catch (error) {
    warn(`索引已获取，但缓存写入失败 ${cacheFile}：${errorMessage(error)}`);
  }
  return { ...fresh, source: 'network' };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse',
  'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'clipPath',
  'mask', 'pattern', 'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
  'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
  'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur',
  'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence',
]);
const ATTRIBUTES = new Set([
  'id', 'viewBox', 'version', 'width', 'height', 'preserveAspectRatio', 'x', 'y', 'x1', 'x2',
  'y1', 'y2', 'dx', 'dy', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'pathLength', 'transform',
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'color', 'color-interpolation', 'color-interpolation-filters', 'clip-rule', 'clip-path',
  'mask', 'maskUnits', 'maskContentUnits', 'mask-type', 'clipPathUnits', 'filter', 'filterUnits',
  'primitiveUnits', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'fx', 'fy', 'fr',
  'offset', 'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color',
  'in', 'in2', 'result', 'mode', 'type', 'values', 'operator', 'k1', 'k2', 'k3', 'k4',
  'stdDeviation', 'radius', 'scale', 'xChannelSelector', 'yChannelSelector', 'tableValues',
  'slope', 'intercept', 'amplitude', 'exponent', 'baseFrequency', 'numOctaves', 'seed',
  'stitchTiles', 'surfaceScale', 'diffuseConstant', 'specularConstant', 'specularExponent',
  'kernelMatrix', 'kernelUnitLength', 'order', 'divisor', 'bias', 'targetX', 'targetY',
  'edgeMode', 'preserveAlpha', 'azimuth', 'elevation', 'z', 'pointsAtX', 'pointsAtY',
  'pointsAtZ', 'limitingConeAngle', 'patternUnits', 'patternContentUnits', 'patternTransform',
  'overflow', 'display', 'visibility', 'vector-effect', 'shape-rendering', 'mix-blend-mode',
  'isolation', 'enable-background', 'role', 'aria-label', 'aria-hidden', 'focusable',
]);
const STYLE_PROPERTIES = new Set([
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'color', 'clip-rule', 'clip-path', 'mask', 'filter', 'stop-color', 'stop-opacity',
  'flood-color', 'flood-opacity', 'color-interpolation-filters', 'mix-blend-mode', 'isolation',
]);
const REFERENCE_ATTRIBUTES = new Set(['fill', 'stroke', 'clip-path', 'mask', 'filter']);
const LOCAL_REFERENCE = /^#[A-Za-z_][\w.:-]*$/;
const LOCAL_URL = /^url\(\s*(?:(["'])(#[A-Za-z_][\w.:-]*)\1|(#[A-Za-z_][\w.:-]*))\s*\)$/i;
const SVG_NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const VIEW_BOX = new RegExp(`^\\s*${SVG_NUMBER}(?:(?:\\s*,\\s*|\\s+)${SVG_NUMBER}){3}\\s*$`);

function safeAttributeValue(name: string, value: string): void {
  // CSS 仅接受受限的字面值及本地 url(#id)，不支持转义、注释、变量或外部加载语法。
  if (/[\\@{}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) || value.includes('/*') || value.includes('*/')) {
    throw new Error(`SVG 属性 ${name} 含不允许的转义或 CSS 语法`);
  }
  if (/url\s*\(/i.test(value)) {
    if (!REFERENCE_ATTRIBUTES.has(name) || !LOCAL_URL.test(value.trim())) {
      throw new Error(`SVG 属性 ${name} 仅允许本地资源 url(#id)`);
    }
  } else if (/[():;]/.test(value) && !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY|rgb|rgba|hsl|hsla)\([\d\s.,%+eE/-]*\)\s*)+$/.test(value.trim())) {
    throw new Error(`SVG 属性 ${name} 含不允许的表达式或外部资源`);
  }
}

function checkElement(element: Element): void {
  if (element.namespaceURI !== SVG_NS || !ELEMENTS.has(element.localName ?? '')) {
    throw new Error(`SVG 含不允许的元素或命名空间：${element.tagName}`);
  }
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes.item(i)!;
    const name = attr.localName ?? attr.name;
    if (name.toLowerCase().startsWith('on')) throw new Error(`SVG 禁止事件属性：${attr.name}`);
    if (attr.namespaceURI === XMLNS_NS) {
      if (![SVG_NS, XLINK_NS].includes(attr.value)) throw new Error(`SVG 禁止外部命名空间：${attr.value}`);
      continue;
    }
    if (attr.namespaceURI === XML_NS && (name === 'space' || name === 'lang')) continue;
    if (name === 'href' && (!attr.namespaceURI || attr.namespaceURI === XLINK_NS)) {
      if (!LOCAL_REFERENCE.test(attr.value)) throw new Error(`SVG href 仅允许本地 #id：${attr.value}`);
      continue;
    }
    if (attr.namespaceURI) throw new Error(`SVG 禁止命名空间属性：${attr.name}`);
    if (name === 'style') {
      for (const declaration of attr.value.split(';').filter((part) => part.trim())) {
        const colon = declaration.indexOf(':');
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim();
        if (colon < 0 || !STYLE_PROPERTIES.has(property) || !value) {
          throw new Error(`SVG 含不允许的 style 属性：${declaration}`);
        }
        safeAttributeValue(property, value);
      }
      continue;
    }
    if (!ATTRIBUTES.has(name)) throw new Error(`SVG 含不允许的属性：${attr.name}`);
    safeAttributeValue(name, attr.value);
  }
}

export function normalizeSvg(svg: string): string {
  if (Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES) throw new Error('SVG 超过大小限制');
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('SVG 禁止 DOCTYPE 和实体声明');
  const parser = new DOMParser({
    onError: (level, message) => { throw new Error(`XML ${level}: ${message}`); },
  });
  let document;
  try {
    document = parser.parseFromString(svg, 'application/xml');
  } catch (error) {
    throw new Error(`非法 SVG/XML：${errorMessage(error)}`);
  }
  const root = document.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) {
    throw new Error('SVG 必须有 SVG 命名空间的 svg 根元素');
  }
  const viewBox = root.getAttribute('viewBox');
  const box = viewBox?.trim().split(/[\s,]+/).map(Number);
  if (!viewBox || !VIEW_BOX.test(viewBox) || !box || box.some((value) => !Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0) {
    throw new Error('SVG 缺少有效 viewBox，不能安全移除固定尺寸');
  }
  const stack: { node: Node; depth: number }[] = [{ node: document, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    count += 1;
    if (count > 50_000 || depth > 128) throw new Error('SVG 节点数量或嵌套深度超过限制');
    if (node.nodeType === 1) checkElement(node as Element);
    else if (node.nodeType === 7) {
      if (node.nodeName !== 'xml' || node.parentNode !== document) {
        throw new Error('SVG 禁止处理指令（包括外部样式表）');
      }
    } else if (![3, 4, 8, 9].includes(node.nodeType)) {
      throw new Error(`SVG 禁止节点类型：${node.nodeType}`);
    }
    for (let child = node.firstChild; child; child = child.nextSibling) stack.push({ node: child, depth: depth + 1 });
  }
  root.setAttribute('width', '100%');
  root.setAttribute('height', '100%');
  return `${new XMLSerializer().serializeToString(root, { requireWellFormed: true })}\n`;
}

export async function downloadFluentSvg(path: string, options: NetworkOptions = {}): Promise<string> {
  if (!fluentParts(path)) throw new Error(`非法 Fluent 仓库路径：${JSON.stringify(path)}`);
  const url = FLUENT_RAW_URL + path.split('/').map(encodeURIComponent).join('/');
  return normalizeSvg(await fetchText(url, MAX_SVG_BYTES, options));
}
