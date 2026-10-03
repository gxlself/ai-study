import { existsSync, lstatSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  BUILTIN_ACTIVITY_META, BUILTIN_ACTIVITY_TYPES, PluginManifest,
  activityPropsJsonSchema, type PluginInfo, type ValidationIssue,
} from '@sprout/schema';
import {
  RegistryError, assetUrl, compareVersions, ensureDirectory, ensureRoot, guard,
  makeStage, parse, readJson, replaceDirectory, safePath, safeRelativePath, validationError,
} from '../content/files';
import { extractFiles, readZip } from '../content/zip';
import {
  assertRemoteActive, downloadRemoteManifest, httpUrl, resolvePluginHost, validateRemoteUrl,
  withRemoteTimeout, type PluginResolver,
} from './remote';

export interface PluginRegistryOptions {
  dataDir: string;
  db: DatabaseSync;
  resolver?: PluginResolver;
  /** 仅供离线测试；生产默认使用固定已校验 IP 的 http/https 连接。 */
  fetch?: typeof fetch;
}
export interface PluginSourceInfo extends PluginInfo { manifestUrl?: string }
interface PluginRow {
  id: string; manifest: string; source: 'installed' | 'remote';
  enabled: number; manifest_url: string | null; directory: string | null;
}

export { REMOTE_MANIFEST_MAX_BYTES, REMOTE_MANIFEST_TIMEOUT_MS } from './remote';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateProps(schema: unknown, value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let nodes = 0;
  const visit = (rule: unknown, current: unknown, path: string, depth: number) => {
    if (++nodes > 10000 || depth > 64) {
      throw new RegistryError(400, 'PROPS_TOO_COMPLEX', '插件参数嵌套过深或过大');
    }
    const fail = (message: string, at = path) => issues.push({ path: at, message, level: 'error' });
    if (rule === false) { fail('此参数不被允许'); return; }
    if (!object(rule)) return;
    const matches = (type: unknown) => {
      switch (type) {
        case 'object': return object(current);
        case 'array': return Array.isArray(current);
        case 'integer': return typeof current === 'number' && Number.isInteger(current);
        case 'number': return typeof current === 'number' && Number.isFinite(current);
        case 'null': return current === null;
        case 'string': case 'boolean': return typeof current === type;
        default: return false;
      }
    };
    if (rule.type !== undefined && !(Array.isArray(rule.type) ? rule.type : [rule.type]).some(matches)) {
      fail(`参数类型应为 ${String(rule.type)}`); return;
    }
    if (object(current)) {
      if (Array.isArray(rule.required)) for (const key of rule.required) {
        if (typeof key === 'string' && !Object.hasOwn(current, key)) fail('缺少必填参数', [path, key].filter(Boolean).join('.'));
      }
      if (object(rule.properties)) for (const [key, child] of Object.entries(rule.properties)) {
        if (Object.hasOwn(current, key)) visit(child, current[key], [path, key].filter(Boolean).join('.'), depth + 1);
      }
    }
    if (Array.isArray(current) && rule.items !== undefined) {
      current.forEach((item, index) => visit(rule.items, item, [path, index].filter((part) => part !== '').join('.'), depth + 1));
    }
  };
  visit(schema, value, '', 0);
  return issues;
}

export class PluginRegistry {
  private readonly root: string;
  private readonly db: DatabaseSync;
  private readonly fetcher: typeof fetch | undefined;
  private readonly resolver: PluginResolver;

  constructor(options: PluginRegistryOptions) {
    if (options.fetch && !options.resolver) {
      throw new TypeError('离线 fetch 注入必须同时提供 resolver；生产下载使用固定 IP 的 http/https 连接');
    }
    this.db = options.db;
    this.fetcher = options.fetch;
    this.resolver = options.resolver ?? resolvePluginHost;
    this.root = guard(() => ensureDirectory(ensureRoot(options.dataDir), 'plugins'));
  }

  private rows(): PluginRow[] {
    return this.db.prepare("SELECT * FROM plugins WHERE id <> 'sprout.builtin' ORDER BY id").all() as unknown as PluginRow[];
  }

  private row(id: string): PluginRow {
    const row = this.rows().find((entry) => entry.id === id);
    if (!row) throw new RegistryError(404, 'PLUGIN_NOT_FOUND', '插件不存在');
    return row;
  }

  private info(row: PluginRow): PluginSourceInfo {
    const manifest = parse(PluginManifest, JSON.parse(row.manifest));
    return {
      id: manifest.id, version: manifest.version, name: manifest.name, description: manifest.description,
      source: row.source, enabled: Boolean(row.enabled), activities: manifest.activities, permissions: manifest.permissions,
      entryUrl: row.source === 'remote' ? httpUrl(manifest.entry, row.manifest_url!).href :
        assetUrl(`/plugins/${manifest.id}/`, manifest.entry),
      ...(row.source === 'remote' ? { manifestUrl: row.manifest_url! } : {}),
    };
  }

  private builtin(): PluginInfo {
    const row = this.db.prepare("SELECT enabled FROM plugins WHERE id = 'sprout.builtin'").get();
    return {
      id: 'sprout.builtin', version: '1.0.0', name: { zh: '芽芽内置活动', en: 'Sprout Built-in Activities' },
      source: 'builtin', enabled: row ? Boolean(row.enabled) : true, permissions: [],
      activities: BUILTIN_ACTIVITY_TYPES.map((type) => ({
        type, name: { zh: BUILTIN_ACTIVITY_META[type].zh, en: BUILTIN_ACTIVITY_META[type].en },
        ageRange: BUILTIN_ACTIVITY_META[type].ageRange, propsSchema: activityPropsJsonSchema(type),
      })),
    };
  }

  list(): PluginSourceInfo[] { return guard(() => [this.builtin(), ...this.rows().map((row) => this.info(row))]); }

  private checkManifest(input: unknown): PluginManifest {
    const manifest = parse(PluginManifest, input, 'plugin.json');
    if (manifest.id === 'sprout.builtin') throw new RegistryError(403, 'BUILTIN_PLUGIN', '不能替换内置活动');
    safeRelativePath(manifest.id);
    const types = new Set<string>();
    for (const activity of manifest.activities) {
      if (types.has(activity.type)) validationError([{ path: 'activities', level: 'error', message: '插件包含重复活动 type' }]);
      types.add(activity.type);
      if (activity.propsSchema) {
        const check = (schema: unknown, depth = 0): void => {
          if (typeof schema === 'boolean') return;
          if (!object(schema) || depth > 64) validationError([{ path: 'activities.propsSchema', level: 'error', message: 'propsSchema 无效或嵌套过深' }]);
          const allowed = ['object', 'array', 'integer', 'number', 'string', 'boolean', 'null'];
          if (schema.type !== undefined && !(Array.isArray(schema.type) ? schema.type : [schema.type]).every((type) => typeof type === 'string' && allowed.includes(type))) {
            validationError([{ path: 'activities.propsSchema.type', level: 'error', message: '不支持的 JSON Schema type' }]);
          }
          if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((key) => typeof key === 'string'))) {
            validationError([{ path: 'activities.propsSchema.required', level: 'error', message: 'required 必须是字段名数组' }]);
          }
          if (schema.properties !== undefined) {
            if (!object(schema.properties)) validationError([{ path: 'activities.propsSchema.properties', level: 'error', message: 'properties 必须是对象' }]);
            Object.values(schema.properties).forEach((child) => check(child, depth + 1));
          }
          if (schema.items !== undefined) check(schema.items, depth + 1);
        };
        check(activity.propsSchema);
      }
    }
    const existing = this.rows();
    for (const row of existing) {
      const other = parse(PluginManifest, JSON.parse(row.manifest));
      if (other.id === manifest.id) {
        if (compareVersions(manifest.version, other.version) <= 0) throw new RegistryError(409, 'VERSION_CONFLICT', '只允许安装更高版本的插件');
      } else if (other.activities.some((activity) => types.has(activity.type))) {
        throw new RegistryError(409, 'ACTIVITY_CONFLICT', '活动 type 已由其他插件注册');
      }
    }
    return manifest;
  }

  private save(manifest: PluginManifest, source: PluginRow['source'], directory: string | null, manifestUrl: string | null): PluginSourceInfo {
    this.db.prepare(`INSERT INTO plugins(id, manifest, source, enabled, manifest_url, directory) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET manifest=excluded.manifest, source=excluded.source,
      manifest_url=excluded.manifest_url, directory=excluded.directory`)
      .run(manifest.id, JSON.stringify(manifest), source, manifestUrl, directory);
    return this.info(this.row(manifest.id));
  }

  async installZip(bytes: Uint8Array): Promise<PluginSourceInfo> {
    const files = guard(() => readZip(bytes, 'plugin.json'));
    const stage = guard(() => makeStage(this.root));
    try {
      const manifest = guard(() => {
        extractFiles(files, stage);
        const candidate = this.checkManifest(readJson(stage, 'plugin.json'));
        if (!/^https?:\/\//i.test(candidate.entry)) {
          const entry = safePath(stage, candidate.entry);
          if (!existsSync(entry) || !lstatSync(entry).isFile()) validationError([{ path: 'entry', level: 'error', message: '插件入口文件不存在' }]);
        }
        return candidate;
      });
      if (/^https?:\/\//i.test(manifest.entry)) {
        await withRemoteTimeout((signal) => validateRemoteUrl(httpUrl(manifest.entry), this.resolver, signal));
      }
      return guard(() => {
        this.checkManifest(manifest);
        const target = safePath(this.root, manifest.id);
        let info!: PluginSourceInfo;
        replaceDirectory(stage, target, () => { info = this.save(manifest, 'installed', target, null); });
        return info;
      });
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }

  async registerRemote(manifestUrl: string): Promise<PluginSourceInfo> {
    const downloaded = await withRemoteTimeout(async (signal) => {
      const result = await downloadRemoteManifest(manifestUrl, this.resolver, signal, this.fetcher);
      assertRemoteActive(signal);
      const manifest = guard(() => parse(PluginManifest, result.input, 'plugin.json'));
      await validateRemoteUrl(httpUrl(manifest.entry, result.url), this.resolver, signal);
      assertRemoteActive(signal);
      return result;
    });
    // 超时竞态只产出候选数据；数据库及文件替换必须在竞态成功后才执行。
    return guard(() => {
      const manifest = this.checkManifest(downloaded.input);
      const old = this.rows().find((row) => row.id === manifest.id);
      const oldDirectory = old?.source === 'installed' ? this.directory(manifest.id) : undefined;
      const backup = join(this.root, `.backup-${randomUUID()}`);
      if (oldDirectory) renameSync(oldDirectory, backup);
      let info: PluginSourceInfo;
      try { info = this.save(manifest, 'remote', null, downloaded.url); } catch (error) {
        if (oldDirectory) renameSync(backup, oldDirectory);
        throw error;
      }
      if (oldDirectory) rmSync(backup, { recursive: true, force: true });
      return info;
    });
  }

  setEnabled(id: string, enabled: boolean): PluginSourceInfo {
    return guard(() => {
      if (typeof enabled !== 'boolean') throw new RegistryError(400, 'VALIDATION_ERROR', 'enabled 必须是布尔值');
      if (id === 'sprout.builtin') {
        this.db.prepare(`INSERT INTO plugins(id, manifest, source, enabled) VALUES (?, ?, 'builtin', ?)
          ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled`).run(id, JSON.stringify(this.builtin()), enabled ? 1 : 0);
        return this.builtin();
      }
      this.row(id);
      this.db.prepare('UPDATE plugins SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
      return this.info(this.row(id));
    });
  }

  directory(id: string): string | undefined {
    return guard(() => {
      const row = this.rows().find((entry) => entry.id === id);
      if (row?.source !== 'installed') return undefined;
      const expected = safePath(this.root, row.id);
      if (row.directory !== expected) throw new RegistryError(400, 'UNSAFE_PATH', '插件目录不在受管目录中');
      return existsSync(expected) && lstatSync(expected).isDirectory() ? expected : undefined;
    });
  }

  deletePlugin(id: string): void {
    guard(() => {
      if (id === 'sprout.builtin') throw new RegistryError(403, 'BUILTIN_PLUGIN', '不能删除内置活动');
      const row = this.row(id), directory = this.directory(id);
      const backup = join(this.root, `.delete-${randomUUID()}`);
      if (directory) renameSync(directory, backup);
      try { this.db.prepare('DELETE FROM plugins WHERE id = ?').run(row.id); } catch (error) {
        if (directory) renameSync(backup, directory);
        throw error;
      }
      if (directory) rmSync(backup, { recursive: true, force: true });
    });
  }

  validateExternal(type: string, props: unknown): ValidationIssue[] | null {
    return guard(() => {
      for (const row of this.rows()) {
        if (!row.enabled) continue;
        const manifest = parse(PluginManifest, JSON.parse(row.manifest));
        const activity = manifest.activities.find((entry) => entry.type === type);
        if (activity) return activity.propsSchema ? validateProps(activity.propsSchema, props) : [];
      }
      return null;
    });
  }
}
