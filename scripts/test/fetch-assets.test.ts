import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAssets, main, parseArguments } from '../fetch-assets.js';
import {
  assetFile, downloadFluentSvg, editDistance, FLUENT_RAW_URL, FLUENT_TREE_URL,
  loadFluentTree, MAX_SVG_BYTES, normalizeSvg, parseAssetSource, resolveFluentPath,
  suggestNames, TREE_CACHE_TTL_MS, type FetchImplementation,
} from '../lib/fluent-assets.js';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const DOG = 'assets/Dog/Color/dog_color.svg';
const OLD_WOMAN = 'assets/Old woman/Default/Color/old_woman_color_default.svg';
const OLD_WOMAN_LIGHT = 'assets/Old woman/Light/Color/old_woman_color_light.svg';
const PATHS = [DOG, 'assets/Dog/Flat/dog_flat.svg', 'assets/Cat/Color/cat_color.svg', OLD_WOMAN, OLD_WOMAN_LIGHT];
const IMAGE = 'assets/images/animals/dog.svg';
const SOURCE = { source: 'fluent-emoji', name: 'Dog', style: 'Color' } as const;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M0 0L32 32" fill="#abc"/></svg>';
const MASKED_SVG = SVG.replace(
  '<path',
  '<mask id="mask0" style="mask-type:alpha"><rect width="32" height="32" fill="#fff"/></mask><path mask="url(#mask0)"',
);

let root: string;
let pack: string;
let cacheFile: string;

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function manifest(items: Record<string, unknown>, directory = pack): void {
  put(join(directory, 'assets/sources.json'), JSON.stringify({ schemaVersion: 1, items }));
}

function cache(age = 0, paths = PATHS): void {
  put(cacheFile, JSON.stringify({ schemaVersion: 1, fetchedAt: new Date(NOW - age).toISOString(), paths }));
}

function treeResponse(paths = PATHS): Response {
  return Response.json({ truncated: false, tree: paths.map((path) => ({ path, type: 'blob', mode: '100644' })) });
}

function network() {
  return vi.fn<FetchImplementation>(async (input) => {
    if (String(input) === FLUENT_TREE_URL) return treeResponse();
    if (String(input).startsWith(FLUENT_RAW_URL)) return new Response(SVG);
    throw new Error(`意外请求：${String(input)}`);
  });
}

function offline() {
  return vi.fn<FetchImplementation>().mockRejectedValue(new Error('offline ECONNREFUSED'));
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'sprout-fetch-assets-')));
  pack = join(root, 'content/packs/example');
  cacheFile = join(root, 'scripts/.cache/fluent-tree.json');
  mkdirSync(pack, { recursive: true });
  mkdirSync(join(root, 'scripts'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('来源与精确路径解析', () => {
  it('校验来源并温和处理首尾空格', () => {
    expect(parseAssetSource({ ...SOURCE, name: ' Dog ', style: ' Color ' })).toEqual(SOURCE);
    expect(parseAssetSource({ source: 'custom' })).toEqual({ source: 'custom' });
  });

  it.each([
    null, [], 'Dog', { source: 'remote' }, { ...SOURCE, name: '' },
    { ...SOURCE, style: 123 }, { ...SOURCE, name: '../Dog' },
    { ...SOURCE, skinTone: '' }, { ...SOURCE, skinTone: 'Default/Color' },
    { ...SOURCE, name: 'x'.repeat(201) },
  ])('拒绝非法来源 %#', (source) => {
    expect(() => parseAssetSource(source)).toThrow();
  });

  it('按目录匹配而非猜文件名，允许唯一的大小写差异', () => {
    expect(resolveFluentPath(PATHS, { ...SOURCE, name: 'dog', style: 'color' })).toBe(DOG);
    expect(resolveFluentPath(['assets/Dog/Color/unexpected_filename.svg'], SOURCE))
      .toBe('assets/Dog/Color/unexpected_filename.svg');
  });

  it('姓名与风格不做子串或模糊替换', () => {
    expect(() => resolveFluentPath(['assets/Dog face/Color/dog_face.svg'], SOURCE)).toThrow('相近名称建议');
    expect(() => resolveFluentPath(PATHS, { ...SOURCE, style: 'Colo' })).toThrow('可用值');
  });

  it('肤色精确匹配，不跨肤色/风格回退', () => {
    expect(resolveFluentPath(PATHS, { ...SOURCE, name: 'old WOMAN', skinTone: 'light' })).toBe(OLD_WOMAN_LIGHT);
    expect(() => resolveFluentPath(PATHS, { ...SOURCE, name: 'Old woman', skinTone: 'Dark' })).toThrow('skinTone');
    expect(() => resolveFluentPath(PATHS, { ...SOURCE, name: 'Old woman', skinTone: 'Light', style: 'Flat' })).toThrow('style');
    expect(() => resolveFluentPath(PATHS, { ...SOURCE, skinTone: 'Default' })).toThrow('skinTone');
  });

  it('未写肤色仅选择直系路径或 Default，不任选肤色', () => {
    expect(resolveFluentPath(PATHS, { ...SOURCE, name: 'Old woman' })).toBe(OLD_WOMAN);
    expect(() => resolveFluentPath([OLD_WOMAN_LIGHT], { ...SOURCE, name: 'Old woman' })).toThrow('Default');
  });

  it('精确拼写优先，模糊大小写或多个文件产生歧义时报错', () => {
    const lower = 'assets/dog/Color/lower.svg';
    expect(resolveFluentPath([DOG, lower], SOURCE)).toBe(DOG);
    expect(() => resolveFluentPath([DOG, lower], { ...SOURCE, name: 'DOG' })).toThrow('歧义');
    expect(() => resolveFluentPath([DOG, 'assets/Dog/Color/other.svg'], SOURCE)).toThrow('歧义');
  });

  it('按编辑距离排序、去重，并提供名称建议', () => {
    expect(editDistance('Dog', 'Dgo')).toBe(2);
    expect(editDistance('dog', 'DOG')).toBe(0);
    expect(editDistance('', 'dog')).toBe(3);
    expect(suggestNames('Dgo', ['Old woman', 'Dog', 'Cat', 'Dog'])[0]).toBe('Dog');
    expect(() => resolveFluentPath(PATHS, { ...SOURCE, name: 'Dgo' })).toThrow(/相近名称建议：Dog/);
  });
});

describe('SVG XML 解析与安全规范化', () => {
  it('规范化根节点尺寸并保留 viewBox 与子节点尺寸', () => {
    const normalized = normalizeSvg(SVG.replace('<path', '<rect width="4" height="8"/><path'));
    expect(normalized).toContain('width="100%" height="100%"');
    expect(normalized).toContain('viewBox="0 0 32 32"');
    expect(normalized).toContain('<rect width="4" height="8"/>');
    expect(normalizeSvg(normalized)).toBe(normalized);
  });

  it('支持 XML 声明、本地渐变、滤镜、xlink 和 Fluent 静态 style', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="-1 -2 32 34">
        <defs><linearGradient id="paint0"><stop stop-color="#abc" stop-opacity=".5"/></linearGradient>
          <filter id="filter0"><feFlood flood-opacity="0" result="bg"/>
            <feBlend in="SourceGraphic" in2="bg" mode="normal"/>
            <feGaussianBlur stdDeviation=".5"/>
          </filter><path id="shape" d="M0 0L1 1"/>
        </defs>
        <g filter="url(#filter0)" style="mix-blend-mode:multiply;isolation:isolate">
          <use xlink:href="#shape" fill="url('#paint0')" transform="translate(1 2) rotate(-45) scale(1.5)"/>
        </g>
      </svg>`;
    expect(normalizeSvg(xml)).toContain('viewBox="-1 -2 32 34"');
    expect(normalizeSvg(xml)).toContain('xlink:href="#shape"');
  });

  it.each([
    'mask-type:alpha', 'mask-type: alpha;', ' MASK-TYPE : ALPHA ; fill: #fff;',
    'mask-type:luminance',
  ])('保留安全的 mask-type 样式、遮罩引用与幂等性：%s', (style) => {
    const normalized = normalizeSvg(MASKED_SVG.replace('mask-type:alpha', style));
    expect(normalized).toContain(`style="${style}"`);
    expect(normalized).toContain('mask="url(#mask0)"');
    expect(normalized).toContain('viewBox="0 0 32 32"');
    expect(normalized).toContain('width="100%" height="100%"');
    expect(normalizeSvg(normalized)).toBe(normalized);
  });

  it.each(['alpha', 'luminance'])('继续支持 mask-type="%s" 普通属性', (value) => {
    const normalized = normalizeSvg(MASKED_SVG.replace('style="mask-type:alpha"', `mask-type="${value}"`));
    expect(normalized).toContain(`mask-type="${value}"`);
    expect(normalized).toContain('mask="url(#mask0)"');
  });

  it.each([
    '', 'unknown', 'alpha !important', 'alpha luminance', 'url(#mask0)',
    'url(https://tracker.example/mask)', 'var(--mask-type)', 'alpha/**/',
    'a\\6cpha', 'expression(alert(1))',
  ])('mask-type 样式与普通属性拒绝非法值 %#', (value) => {
    expect(() => normalizeSvg(MASKED_SVG.replace('mask-type:alpha', `mask-type:${value}`))).toThrow();
    expect(() => normalizeSvg(MASKED_SVG.replace('style="mask-type:alpha"', `mask-type="${value}"`))).toThrow();
  });

  it.each([
    'mask-type:alpha;fill:url(https://tracker.example)',
    'mask-type:alpha;background-image:url(https://tracker.example)',
    'mask-type:alpha;onload:alert(1)',
    'mask-type:alpha;@import:https://tracker.example',
  ])('合法 mask-type 不能掩盖同一 style 内的危险声明 %#', (style) => {
    expect(() => normalizeSvg(MASKED_SVG.replace('mask-type:alpha', style))).toThrow();
  });

  it.each([
    '',
    '<svg',
    SVG.replace('</svg>', ''),
    SVG.replace('<path', '<path broken'),
    SVG.replace('width="32"', 'width=32'),
    SVG.replace('width="32"', 'width="32" width="64"'),
    SVG.replace('</svg>', '</g>'),
    SVG.replace('/></svg>', '></svg>'),
    SVG.replace('fill="#abc"', 'fill="&unknown;"'),
    SVG + SVG,
    '<html><body>error</body></html>',
    SVG.replace('http://www.w3.org/2000/svg', 'urn:other'),
    SVG.replace(' xmlns="http://www.w3.org/2000/svg"', ''),
    SVG.replace(' viewBox="0 0 32 32"', ''),
    SVG.replace('0 0 32 32', '0 0 -32 32'),
    SVG.replace('0 0 32 32', '0 0 0 32'),
    SVG.replace('0 0 32 32', '0 0 NaN 32'),
    SVG.replace('0 0 32 32', '0 0 0x20 32'),
    SVG.replace('0 0 32 32', '0,,0,32,32'),
  ])('拒绝非合法 XML/SVG 或无效坐标系 %#', (xml) => {
    expect(() => normalizeSvg(xml)).toThrow();
  });

  it.each([
    '<script>alert(1)</script>',
    '<SCRIPT/>',
    '<foreignObject/>',
    '<image href="https://tracker.example/image"/>',
    '<feImage href="https://tracker.example/image"/>',
    '<a href="https://tracker.example"/>',
    '<animate attributeName="href" values="https://tracker.example"/>',
    '<set attributeName="onload" to="alert(1)"/>',
    '<style>@import "https://tracker.example/style";</style>',
    '<use href="//tracker.example/image"/>',
    '<use href="data:image/svg+xml,test"/>',
    '<use href="javascript:alert(1)"/>',
    '<use href="&#x68;ttps://tracker.example/image"/>',
    '<use href="relative.svg#x"/>',
    '<use href=" #shape"/>',
    '<g onload="alert(1)"/>',
    '<g ONCLICK="alert(1)"/>',
    '<g xml:base="https://tracker.example/"/>',
    '<g xmlns="http://www.w3.org/1999/xhtml"/>',
    '<path fill="url(https://tracker.example)"/>',
    '<path fill="url(&quot;//tracker.example/image&quot;)"/>',
    '<path fill="url(#safe) url(https://tracker.example)"/>',
    '<path fill="u&#x72;l(https://tracker.example)"/>',
    '<path fill="u\\72l(https://tracker.example)"/>',
    '<path fill="u/**/rl(https://tracker.example)"/>',
    '<path fill="var(--external)"/>',
    '<path style="fill:url(https://tracker.example)"/>',
    '<path style="fill:URL( //tracker.example/image )"/>',
    '<path style="fill: u\\72l(https://tracker.example)"/>',
    '<path style="background-image:url(https://tracker.example)"/>',
    '<path style="fill:expression(alert(1))"/>',
    '<path style="fill: red; @import: https://tracker.example"/>',
    '<path style="fill: red; behavior: url(x)"/>',
    '<?xml-stylesheet href="https://tracker.example"?>',
  ])('拒绝脚本、事件、外部资源和 CSS 绕过 %#', (payload) => {
    expect(() => normalizeSvg(SVG.replace('</svg>', `${payload}</svg>`))).toThrow();
    expect(() => normalizeSvg(MASKED_SVG.replace('</svg>', `${payload}</svg>`))).toThrow();
  });

  it('拒绝 DTD、实体声明与处理指令', () => {
    expect(() => normalizeSvg(`<!DOCTYPE svg SYSTEM "https://tracker.example/evil.dtd">${SVG}`)).toThrow('DOCTYPE');
    expect(() => normalizeSvg(`<!DOCTYPE svg [<!ENTITY boom SYSTEM "file:///etc/passwd">]>${SVG}`)).toThrow('DOCTYPE');
    expect(() => normalizeSvg(`<?xml-stylesheet href="https://tracker.example"?>${SVG}`)).toThrow('处理指令');
  });

  it('限制大小和嵌套深度', () => {
    expect(() => normalizeSvg(' '.repeat(MAX_SVG_BYTES + 1))).toThrow('大小');
    expect(() => normalizeSvg(SVG.replace('<path', `${'<g>'.repeat(130)}<path`).replace('</svg>', `${'</g>'.repeat(130)}</svg>`))).toThrow('深度');
  });
});

describe('GitHub 索引与七天缓存', () => {
  it('首次获取 recursive tree，忽略非 SVG 与仓库符号链接并写入缓存', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(Response.json({
      truncated: false,
      tree: [
        { type: 'tree', path: 'assets' }, { type: 'blob', path: 'README.md' },
        { type: 'blob', path: DOG, mode: '100644' },
        { type: 'blob', path: 'assets/Cat/Color/cat.svg', mode: '120000' },
      ],
    }));
    const index = await loadFluentTree({ cacheFile, now: NOW, fetchImpl });
    expect(index).toMatchObject({ paths: [DOG], source: 'network' });
    expect(fetchImpl).toHaveBeenCalledWith(FLUENT_TREE_URL, expect.objectContaining({
      redirect: 'error', credentials: 'omit', signal: expect.any(AbortSignal),
    }));
    expect(JSON.parse(readFileSync(cacheFile, 'utf8'))).toEqual({
      schemaVersion: 1, fetchedAt: new Date(NOW).toISOString(), paths: [DOG],
    });
  });

  it('七天内缓存直接使用，不请求网络', async () => {
    cache(TREE_CACHE_TTL_MS - 1);
    const fetchImpl = offline();
    expect((await loadFluentTree({ cacheFile, now: NOW, fetchImpl })).source).toBe('cache');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('满七天刷新缓存', async () => {
    cache(TREE_CACHE_TTL_MS);
    const fetchImpl = network();
    expect((await loadFluentTree({ cacheFile, now: NOW, fetchImpl })).source).toBe('network');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('断网回退有效但过期的缓存，报告局限且不延长缓存寿命', async () => {
    cache(TREE_CACHE_TTL_MS + 1);
    const before = readFileSync(cacheFile, 'utf8');
    const warn = vi.fn();
    const index = await loadFluentTree({ cacheFile, now: NOW, fetchImpl: offline(), warn });
    expect(index.source).toBe('stale-cache');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/回退过期缓存.*缺失 SVG 仍需联网/));
    expect(readFileSync(cacheFile, 'utf8')).toBe(before);
  });

  it.each([
    '{broken',
    JSON.stringify({ schemaVersion: 1, fetchedAt: 'invalid', paths: PATHS }),
    JSON.stringify({ schemaVersion: 1, fetchedAt: new Date(NOW + 1000).toISOString(), paths: PATHS }),
    JSON.stringify({ schemaVersion: 1, fetchedAt: new Date(NOW).toISOString(), paths: [] }),
    JSON.stringify({ schemaVersion: 1, fetchedAt: new Date(NOW).toISOString(), paths: ['assets/../Color/a.svg'] }),
    JSON.stringify({ schemaVersion: 2, fetchedAt: new Date(NOW).toISOString(), paths: PATHS }),
  ])('忽略损坏/不安全缓存并刷新 %#', async (contents) => {
    put(cacheFile, contents);
    const warn = vi.fn();
    expect((await loadFluentTree({ cacheFile, now: NOW, fetchImpl: network(), warn })).source).toBe('network');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('忽略不可用缓存'));
  });

  it('无可用缓存时断网报错，不声称可以离线下载', async () => {
    await expect(loadFluentTree({ cacheFile, now: NOW, fetchImpl: offline() })).rejects.toThrow(/无有效缓存.*offline/);
  });

  it.each([
    { truncated: true, tree: [{ path: DOG, type: 'blob' }] },
    { tree: [] }, { truncated: false, tree: 'wrong' },
    { truncated: false, tree: [null] }, { truncated: false, tree: [] },
  ])('拒绝截断或结构异常的 API 返回 %#', async (data) => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(Response.json(data));
    await expect(loadFluentTree({ cacheFile, now: NOW, fetchImpl })).rejects.toThrow('索引不可用');
    expect(existsSync(cacheFile)).toBe(false);
  });

  it('API JSON 损坏时报告明确错误', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(new Response('<html>error</html>'));
    await expect(loadFluentTree({ cacheFile, now: NOW, fetchImpl })).rejects.toThrow('不是合法 JSON');
  });

  it('截断响应不能覆盖旧缓存，使用过期缓存并警告', async () => {
    cache(TREE_CACHE_TTL_MS);
    const original = readFileSync(cacheFile, 'utf8');
    const warn = vi.fn();
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(Response.json({ truncated: true, tree: [] }));
    expect((await loadFluentTree({ cacheFile, now: NOW, fetchImpl, warn })).source).toBe('stale-cache');
    expect(readFileSync(cacheFile, 'utf8')).toBe(original);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('截断'));
  });

  it('HTTP 限流报告状态码、API 原因、Retry-After', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(Response.json(
      { message: 'API rate limit exceeded' },
      { status: 403, statusText: 'Forbidden', headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' } },
    ));
    await expect(loadFluentTree({ cacheFile, now: NOW, fetchImpl })).rejects.toThrow(/HTTP 403.*rate limit.*限流.*Retry-After: 60/);
  });

  it.each(['file', 'directory'])('缓存 %s 符号链接不得写穿', async (kind) => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    const sentinel = join(outside, 'fluent-tree.json');
    put(sentinel, 'untouched');
    if (kind === 'directory') symlinkSync(outside, dirname(cacheFile));
    else {
      mkdirSync(dirname(cacheFile));
      symlinkSync(sentinel, cacheFile);
    }
    const warn = vi.fn();
    expect((await loadFluentTree({ cacheFile, now: NOW, fetchImpl: network(), warn })).source).toBe('network');
    expect(readFileSync(sentinel, 'utf8')).toBe('untouched');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('符号链接'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('缓存写入失败'));
  });

  it('缓存写入失败仍可使用刚获取的完整索引', async () => {
    mkdirSync(cacheFile, { recursive: true });
    const warn = vi.fn();
    expect((await loadFluentTree({ cacheFile, now: NOW, fetchImpl: network(), warn })).source).toBe('network');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('缓存写入失败'));
  });
});

describe('下载 HTTP 处理', () => {
  it('仓库路径按段编码，下载经 XML 校验后再返回', async () => {
    const fetchImpl = network();
    expect(await downloadFluentSvg(OLD_WOMAN, { fetchImpl })).toContain('width="100%"');
    expect(fetchImpl).toHaveBeenCalledWith(
      `${FLUENT_RAW_URL}assets/Old%20woman/Default/Color/old_woman_color_default.svg`, expect.anything(),
    );
  });

  it('缺失文件报告 HTTP 404 和完整 URL', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(new Response('Not Found', { status: 404 }));
    await expect(downloadFluentSvg(DOG, { fetchImpl })).rejects.toThrow(/HTTP 404.*raw.githubusercontent.com/);
  });

  it('超时包含明确错误且传入 AbortSignal', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(downloadFluentSvg(DOG, { fetchImpl, timeoutMs: 10 })).rejects.toThrow('TimeoutError');
    expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('拒绝重定向响应', async () => {
    const response = new Response(SVG);
    Object.defineProperty(response, 'redirected', { value: true });
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(response);
    await expect(downloadFluentSvg(DOG, { fetchImpl })).rejects.toThrow('重定向');
  });

  it.each([true, false])('限制响应大小（content-length=%s）', async (withLength) => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(new Response('x'.repeat(MAX_SVG_BYTES + 1), {
      headers: withLength ? { 'content-length': String(MAX_SVG_BYTES + 1) } : {},
    }));
    await expect(downloadFluentSvg(DOG, { fetchImpl })).rejects.toThrow('大小限制');
  });

  it('损坏的响应流报告读取失败', async () => {
    const body = new ReadableStream({ start(controller) { controller.error(new Error('stream disconnected')); } });
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(new Response(body));
    await expect(downloadFluentSvg(DOG, { fetchImpl })).rejects.toThrow(/读取响应失败.*stream disconnected/);
  });

  it('不允许把 HTML 错误页作为图片', async () => {
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(new Response('<html/>'));
    await expect(downloadFluentSvg(DOG, { fetchImpl })).rejects.toThrow('svg 根元素');
  });

  it('拒绝仓库路径穿越且不发网络请求', async () => {
    const fetchImpl = network();
    await expect(downloadFluentSvg('assets/../Color/evil.svg', { fetchImpl })).rejects.toThrow('非法 Fluent');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('内容包下载、增量、force 与 custom', () => {
  it('默认扫描全部内容包，共用一次索引，不修改 sources/lexicon', async () => {
    manifest({ [IMAGE]: SOURCE });
    const other = join(root, 'content/packs/other');
    manifest({ 'assets/images/family/grandma.svg': { ...SOURCE, name: 'Old woman', skinTone: 'Default' } }, other);
    put(join(pack, 'lexicon.json'), '{"unchanged":true}');
    const before = readFileSync(join(pack, 'assets/sources.json'), 'utf8');
    const fetchImpl = network();
    const report = await fetchAssets({ rootDir: root, cacheFile, now: NOW, fetchImpl });
    expect(report).toMatchObject({ packs: 2, downloaded: 2, errors: 0, exitCode: 0 });
    expect(fetchImpl.mock.calls.filter(([url]) => url === FLUENT_TREE_URL)).toHaveLength(1);
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toContain('width="100%"');
    expect(readFileSync(join(pack, 'assets/sources.json'), 'utf8')).toBe(before);
    expect(readFileSync(join(pack, 'lexicon.json'), 'utf8')).toBe('{"unchanged":true}');
  });

  it('--pack 仅处理指定内容包', async () => {
    manifest({ [IMAGE]: SOURCE });
    manifest({ [IMAGE]: SOURCE }, join(root, 'content/packs/other'));
    const report = await fetchAssets({ rootDir: root, pack: 'content/packs/example', cacheFile, now: NOW, fetchImpl: network() });
    expect(report).toMatchObject({ packs: 1, downloaded: 1 });
    expect(existsSync(join(root, 'content/packs/other', IMAGE))).toBe(false);
  });

  it('下载并写入含 mask-type:alpha 的 Fluent 图片，再次运行增量跳过', async () => {
    manifest({ [IMAGE]: SOURCE });
    cache();
    const fetchImpl = vi.fn<FetchImplementation>().mockImplementation(async () => new Response(MASKED_SVG));
    const options = { pack, cacheFile, now: NOW, fetchImpl };
    const report = await fetchAssets(options);
    expect(report).toMatchObject({ downloaded: 1, errors: 0, exitCode: 0 });
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toBe(normalizeSvg(MASKED_SVG));
    expect(await fetchAssets(options)).toMatchObject({ downloaded: 0, skipped: 1, errors: 0, exitCode: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('已有文件默认跳过，不访问索引或网络', async () => {
    manifest({ [IMAGE]: SOURCE });
    put(join(pack, IMAGE), 'existing');
    const fetchImpl = offline();
    expect(await fetchAssets({ pack, cacheFile, fetchImpl })).toMatchObject({ skipped: 1, exitCode: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toBe('existing');
  });

  it('--force 替换已有文件，但不强制刷新仍有效的索引', async () => {
    manifest({ [IMAGE]: SOURCE });
    put(join(pack, IMAGE), 'existing');
    cache();
    const fetchImpl = network();
    expect(await fetchAssets({ pack, cacheFile, now: NOW, force: true, fetchImpl })).toMatchObject({ downloaded: 1, errors: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toBe(normalizeSvg(SVG));
    expect(readdirSync(dirname(join(pack, IMAGE)))).toEqual(['dog.svg']);
  });

  it.each(['custom', 'force custom'])('%s 只检查文件，绝不改写或联网', async (mode) => {
    manifest({ [IMAGE]: { source: 'custom' } });
    put(join(pack, IMAGE), 'custom source, not parsed');
    const fetchImpl = offline();
    expect(await fetchAssets({ pack, force: mode.startsWith('force'), fetchImpl })).toMatchObject({ custom: 1, exitCode: 0 });
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toBe('custom source, not parsed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('缺失 custom 报错且不创建文件/目录，即使 --force', async () => {
    manifest({ [IMAGE]: { source: 'custom' } });
    const fetchImpl = offline();
    const report = await fetchAssets({ pack, force: true, fetchImpl });
    expect(report).toMatchObject({ errors: 1, exitCode: 1, downloaded: 0 });
    expect(report.results[0].message).toContain('自绘文件缺失');
    expect(existsSync(join(pack, 'assets/images'))).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('条目失败不中断后续条目，名称拼写错误提供建议并非零退出', async () => {
    manifest({ 'assets/images/invalid.svg': { ...SOURCE, name: 'Dgo' }, [IMAGE]: SOURCE });
    const report = await fetchAssets({ pack, cacheFile, now: NOW, fetchImpl: network() });
    expect(report).toMatchObject({ errors: 1, downloaded: 1, exitCode: 1 });
    expect(report.results[0].message).toContain('相近名称建议：Dog');
    expect(existsSync(join(pack, 'assets/images/invalid.svg'))).toBe(false);
  });

  it('断网索引错误汇总到每个条目，索引只尝试一次', async () => {
    manifest({ [IMAGE]: SOURCE, 'assets/images/other.svg': SOURCE });
    const fetchImpl = offline();
    expect(await fetchAssets({ pack, cacheFile, fetchImpl })).toMatchObject({ errors: 2, exitCode: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('过期缓存不能掩盖缺失图片的离线下载错误', async () => {
    manifest({ [IMAGE]: SOURCE });
    cache(TREE_CACHE_TTL_MS + 1);
    const report = await fetchAssets({ pack, cacheFile, now: NOW, fetchImpl: offline() });
    expect(report).toMatchObject({ errors: 1, exitCode: 1 });
    expect(report.warnings.join(' ')).toContain('回退过期缓存');
    expect(report.results[0].message).toContain('raw.githubusercontent.com');
  });

  it.each([
    new Response('not found', { status: 404 }),
    new Response(SVG.replace('</svg>', '<script/></svg>')),
    new Response('<broken>'),
  ])('force 下载失败保留原有文件且不留临时文件 %#', async (response) => {
    manifest({ [IMAGE]: SOURCE });
    cache();
    put(join(pack, IMAGE), 'original');
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValue(response);
    expect(await fetchAssets({ pack, cacheFile, now: NOW, force: true, fetchImpl })).toMatchObject({ errors: 1, downloaded: 0 });
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toBe('original');
    expect(readdirSync(dirname(join(pack, IMAGE)))).toEqual(['dog.svg']);
  });

  it('下载期间出现文件时无 force 保留并记为跳过', async () => {
    manifest({ [IMAGE]: SOURCE });
    cache();
    const fetchImpl = vi.fn<FetchImplementation>(async () => {
      put(join(pack, IMAGE), 'concurrent original');
      return new Response(SVG);
    });
    expect(await fetchAssets({ pack, cacheFile, now: NOW, fetchImpl })).toMatchObject({ skipped: 1, downloaded: 0, errors: 0 });
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toBe('concurrent original');
  });

  it('不存在 sources.json 或空清单时不崩溃、无网络请求', async () => {
    const fetchImpl = offline();
    const missing = await fetchAssets({ pack, fetchImpl });
    expect(missing.warnings.join(' ')).toContain('缺少 assets/sources.json');
    expect(missing.exitCode).toBe(0);
    manifest({});
    expect(await fetchAssets({ pack, fetchImpl })).toMatchObject({ downloaded: 0, errors: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['{', '[]', '{"schemaVersion":2,"items":{}}', '{"schemaVersion":1,"items":[]}'])('非法来源清单报告错误 %#', async (text) => {
    put(join(pack, 'assets/sources.json'), text);
    expect(await fetchAssets({ pack, fetchImpl: offline() })).toMatchObject({ errors: 1, exitCode: 1 });
  });

  it('空目录扫描和不存在的 --pack 有明确状态', async () => {
    rmSync(pack, { recursive: true });
    const empty = await fetchAssets({ rootDir: root });
    expect(empty).toMatchObject({ packs: 0, errors: 0 });
    expect(empty.warnings.join(' ')).toContain('没有内容包');
    expect(await fetchAssets({ pack })).toMatchObject({ errors: 1, exitCode: 1 });
  });
});

describe('路径与文件系统安全', () => {
  it.each([
    '../outside.svg', '/tmp/out.svg', 'C:/temp/out.svg', 'assets/other.svg', 'assets/images',
    'assets/images/../outside.svg', 'assets/images/./a.svg', 'assets/images//a.svg',
    'assets/images\\a.svg', 'assets/images/%2e%2e/out.svg', 'assets/images/%252e%252e/out.svg',
    'assets/images/a.svg?x', 'assets/images/a.svg#x', 'assets/images/a:stream.svg',
    'assets/images/a\u0000.svg', 'assets/images/a\n.svg', 'assets/images/a.svg ',
    'assets/images/a./b.svg',
  ])('阻止目标路径穿越/编码路径 %#', async (path) => {
    manifest({ [path]: SOURCE });
    const fetchImpl = network();
    expect(() => assetFile(pack, path)).toThrow();
    expect(await fetchAssets({ pack, fetchImpl })).toMatchObject({ errors: 1, exitCode: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['assets', 'images', 'subdir', 'file', 'dangling'])('禁止 %s 符号链接逃逸（包括 force）', async (kind) => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    put(join(outside, 'sentinel.svg'), 'untouched');
    manifest({ [IMAGE]: SOURCE });
    if (kind === 'assets') {
      renameSync(join(pack, 'assets/sources.json'), join(outside, 'sources.json'));
      rmSync(join(pack, 'assets'), { recursive: true });
      symlinkSync(outside, join(pack, 'assets'));
    } else if (kind === 'images') {
      symlinkSync(outside, join(pack, 'assets/images'));
    } else if (kind === 'subdir') {
      mkdirSync(join(pack, 'assets/images'));
      symlinkSync(outside, join(pack, 'assets/images/animals'));
    } else {
      mkdirSync(dirname(join(pack, IMAGE)), { recursive: true });
      symlinkSync(join(outside, kind === 'file' ? 'sentinel.svg' : 'not-created.svg'), join(pack, IMAGE));
    }
    const fetchImpl = network();
    const report = await fetchAssets({ pack, force: true, fetchImpl });
    expect(report).toMatchObject({ errors: 1, exitCode: 1 });
    expect(report.results[0].message).toContain('符号链接');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readFileSync(join(outside, 'sentinel.svg'), 'utf8')).toBe('untouched');
    expect(existsSync(join(outside, 'not-created.svg'))).toBe(false);
  });

  it('拒绝 sources.json 符号链接与默认扫描的包符号链接', async () => {
    const source = join(root, 'external-sources.json');
    put(source, JSON.stringify({ schemaVersion: 1, items: {} }));
    mkdirSync(join(pack, 'assets'));
    symlinkSync(source, join(pack, 'assets/sources.json'));
    expect(await fetchAssets({ pack })).toMatchObject({ errors: 1 });
    symlinkSync(pack, join(root, 'content/packs/link'));
    expect(await fetchAssets({ rootDir: root })).toMatchObject({ errors: 2 });
  });

  it('force 原子替换硬链接，不修改被链接的包外文件', async () => {
    manifest({ [IMAGE]: SOURCE });
    cache();
    const outside = join(root, 'sentinel.svg');
    put(outside, 'untouched');
    mkdirSync(dirname(join(pack, IMAGE)), { recursive: true });
    linkSync(outside, join(pack, IMAGE));
    expect(await fetchAssets({ pack, cacheFile, now: NOW, force: true, fetchImpl: network() })).toMatchObject({ downloaded: 1, errors: 0 });
    expect(readFileSync(outside, 'utf8')).toBe('untouched');
    expect(readFileSync(join(pack, IMAGE), 'utf8')).toContain('width="100%"');
  });

  it('下载期间把目录换为符号链接，落盘前重新检查', async () => {
    manifest({ [IMAGE]: SOURCE });
    cache();
    const outside = join(root, 'outside');
    mkdirSync(outside);
    const fetchImpl = vi.fn<FetchImplementation>(async () => {
      symlinkSync(outside, join(pack, 'assets/images'));
      return new Response(SVG);
    });
    const report = await fetchAssets({ pack, cacheFile, now: NOW, fetchImpl });
    expect(report).toMatchObject({ downloaded: 0, errors: 1 });
    expect(report.results[0].message).toContain('符号链接');
    expect(readdirSync(outside)).toEqual([]);
  });

  it('目录不能冒充目标图片，普通文件不能冒充父目录', async () => {
    manifest({ [IMAGE]: SOURCE });
    mkdirSync(join(pack, IMAGE), { recursive: true });
    expect(await fetchAssets({ pack })).toMatchObject({ errors: 1 });
    rmSync(join(pack, IMAGE), { recursive: true });
    rmSync(dirname(join(pack, IMAGE)), { recursive: true });
    put(dirname(join(pack, IMAGE)), 'not a directory');
    expect(await fetchAssets({ pack })).toMatchObject({ errors: 1 });
  });

  it('custom 也不得通过 symlink 检查包外文件', async () => {
    manifest({ [IMAGE]: { source: 'custom' } });
    const outside = join(root, 'outside.svg');
    put(outside, 'custom');
    mkdirSync(dirname(join(pack, IMAGE)), { recursive: true });
    symlinkSync(outside, join(pack, IMAGE));
    expect(await fetchAssets({ pack })).toMatchObject({ custom: 0, errors: 1 });
    expect(readFileSync(outside, 'utf8')).toBe('custom');
  });
});

describe('CLI', () => {
  it('解析指定参数且导入模块不执行 CLI', () => {
    expect(parseArguments(['--pack', 'content/packs/example', '--force']))
      .toEqual({ pack: 'content/packs/example', force: true, help: false });
    expect(parseArguments([])).toEqual({ force: false, help: false });
    expect(process.exitCode).not.toBe(1);
  });

  it.each([['--unknown'], ['--pack'], ['--pack', '--force'], ['--pack', 'a', '--pack', 'b'], ['bare-path']].map((args) => ({ args })))('拒绝非法参数 %#', ({ args }) => {
    expect(() => parseArguments(args)).toThrow();
  });

  it('help 无副作用，参数错误返回 1 且给出汇总', async () => {
    const output = { log: vi.fn(), error: vi.fn() };
    expect(await main(['--help'], {}, output)).toBe(0);
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('用法'));
    expect(await main(['--unknown'], {}, output)).toBe(1);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('素材汇总：错误 1'));
  });

  it('错误输出到 stderr，汇总到 stdout，并返回非零状态', async () => {
    manifest({ [IMAGE]: { source: 'custom' } });
    const output = { log: vi.fn(), error: vi.fn() };
    expect(await main(['--pack', pack], {}, output)).toBe(1);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('[error]'));
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('错误 1'));
  });

  it('成功时返回零并输出各类计数', async () => {
    manifest({ [IMAGE]: { source: 'custom' } });
    put(join(pack, IMAGE), SVG);
    const output = { log: vi.fn(), error: vi.fn() };
    expect(await main(['--pack', pack], {}, output)).toBe(0);
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('自绘已检查 1，错误 0'));
    expect(output.error).not.toHaveBeenCalled();
  });
});
