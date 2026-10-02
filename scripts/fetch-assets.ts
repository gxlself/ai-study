import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assetFile, canonicalDirectory, checkedFile, downloadFluentSvg, errorMessage, isRecord,
  loadFluentTree, parseAssetSource, resolveFluentPath, writeAsset,
  type NetworkOptions, type TreeOptions, type TreeResult,
} from './lib/fluent-assets.js';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

export interface FetchAssetsOptions extends NetworkOptions {
  pack?: string;
  force?: boolean;
  rootDir?: string;
  cacheFile?: string;
  now?: number;
}

export interface AssetResult {
  pack: string;
  path: string;
  status: 'downloaded' | 'skipped' | 'custom' | 'error';
  message: string;
}

export interface AssetSummary {
  packs: number;
  downloaded: number;
  skipped: number;
  custom: number;
  errors: number;
  warnings: string[];
  results: AssetResult[];
  exitCode: 0 | 1;
}

export async function fetchAssets(options: FetchAssetsOptions = {}): Promise<AssetSummary> {
  const summary: AssetSummary = {
    packs: 0, downloaded: 0, skipped: 0, custom: 0, errors: 0, warnings: [], results: [], exitCode: 0,
  };
  const record = (result: AssetResult) => {
    summary.results.push(result);
    if (result.status === 'error') { summary.errors += 1; summary.exitCode = 1; }
    else summary[result.status] += 1;
  };
  const rootDir = resolve(options.rootDir ?? REPOSITORY_ROOT);
  let packs: string[];
  try {
    if (options.pack) {
      packs = [resolve(rootDir, options.pack)];
    } else {
      const directory = canonicalDirectory(resolve(rootDir, 'content/packs'));
      packs = readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => resolve(directory, entry.name)).sort();
      if (!packs.length) summary.warnings.push(`没有内容包：${directory}`);
    }
  } catch (error) {
    record({ pack: options.pack ?? 'content/packs', path: '', status: 'error', message: errorMessage(error) });
    return summary;
  }

  let tree: Promise<TreeResult> | undefined;
  const treeOptions: TreeOptions = { ...options, warn: (message) => summary.warnings.push(message) };
  for (const requestedPack of packs) {
    summary.packs += 1;
    let packDir: string;
    let items: Record<string, unknown>;
    try {
      packDir = canonicalDirectory(requestedPack);
      const manifest = checkedFile(packDir, 'assets/sources.json');
      if (!manifest.exists) {
        summary.warnings.push(`${requestedPack} 缺少 assets/sources.json，跳过此包（内容可能尚未完成）`);
        continue;
      }
      const data: unknown = JSON.parse(readFileSync(manifest.path, 'utf8'));
      if (!isRecord(data) || data.schemaVersion !== 1 || !isRecord(data.items)) {
        throw new Error('assets/sources.json 必须含 schemaVersion: 1 与 items 对象');
      }
      items = data.items;
    } catch (error) {
      record({ pack: requestedPack, path: 'assets/sources.json', status: 'error', message: errorMessage(error) });
      continue;
    }
    for (const [path, value] of Object.entries(items)) {
      try {
        const source = parseAssetSource(value);
        const target = assetFile(packDir, path);
        if (source.source === 'custom') {
          if (!target.exists) throw new Error('custom 自绘文件缺失；请内容作者补充，脚本不会生成或覆盖自绘文件');
          record({ pack: requestedPack, path, status: 'custom', message: '自绘文件存在，未修改' });
          continue;
        }
        if (!path.toLowerCase().endsWith('.svg')) throw new Error('Fluent 下载目标必须是 .svg 文件');
        if (target.exists && !options.force) {
          record({ pack: requestedPack, path, status: 'skipped', message: '已有文件（--force 可重新下载）' });
          continue;
        }
        tree ??= loadFluentTree(treeOptions);
        const index = await tree;
        const remote = resolveFluentPath(index.paths, source);
        const svg = await downloadFluentSvg(remote, options);
        const result = writeAsset(packDir, path, svg, options.force);
        record({
          pack: requestedPack, path, status: result === 'written' ? 'downloaded' : 'skipped',
          message: result === 'written' ? remote : '下载期间文件已出现，保留已有文件',
        });
      } catch (error) {
        record({ pack: requestedPack, path, status: 'error', message: errorMessage(error) });
      }
    }
  }
  return summary;
}

export function parseArguments(args: readonly string[]): { pack?: string; force: boolean; help: boolean } {
  let pack: string | undefined;
  let force = false;
  let help = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force') force = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--pack') {
      const value = args[++i];
      if (!value?.trim() || value.startsWith('-')) throw new Error('--pack 需要内容包目录');
      if (pack !== undefined) throw new Error('--pack 不能重复指定');
      pack = value;
    } else throw new Error(`未知参数：${arg}`);
  }
  return { pack, force, help };
}

export interface CliOutput {
  log: (line: string) => void;
  error: (line: string) => void;
}

const USAGE = '用法：tsx scripts/fetch-assets.ts [--pack <dir>] [--force]';

export async function main(
  args: readonly string[] = process.argv.slice(2),
  options: Omit<FetchAssetsOptions, 'pack' | 'force'> = {},
  output: CliOutput = console,
): Promise<number> {
  try {
    const parsed = parseArguments(args);
    if (parsed.help) { output.log(USAGE); return 0; }
    const summary = await fetchAssets({ ...options, ...parsed });
    for (const warning of summary.warnings) output.error(`[警告] ${warning}`);
    for (const result of summary.results) {
      const line = `[${result.status}] ${result.pack}${result.path ? ` / ${result.path}` : ''}：${result.message}`;
      if (result.status === 'error') output.error(line);
      else output.log(line);
    }
    output.log(`素材汇总：内容包 ${summary.packs}，下载 ${summary.downloaded}，跳过 ${summary.skipped}，自绘已检查 ${summary.custom}，错误 ${summary.errors}，警告 ${summary.warnings.length}`);
    return summary.exitCode;
  } catch (error) {
    output.error(`${errorMessage(error)}\n${USAGE}\n素材汇总：错误 1`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
