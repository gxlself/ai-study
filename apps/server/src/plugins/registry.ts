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

export interface PluginRegistryOptions { dataDir: string; db: DatabaseSync; fetch?: typeof fetch }
interface PluginRow {
  id: string; manifest: string; source: 'installed' | 'remote';
  enabled: number; manifest_url: string | null; directory: string | null;
}

export const REMOTE_MANIFEST_MAX_BYTES = 1024 * 1024;
export const REMOTE_MANIFEST_TIMEOUT_MS = 10_000;

function httpUrl(value: string, base?: string): URL {
  let url: URL;
  try { url = new URL(value, base); } catch { throw new RegistryError(400, 'INVALID_URL', '插件地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new RegistryError(400, 'INVALID_URL', '插件地址只允许不含账号密码的 HTTP(S) URL');
  }
  return url;
}

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
  private readonly fetcher: typeof fetch;

  constructor(options: PluginRegistryOptions) {
    this.db = options.db;
    this.fetcher = options.fetch ?? globalThis.fetch;
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

  private info(row: PluginRow): PluginInfo {
    const manifest = parse(PluginManifest, JSON.parse(row.manifest));
    return {
      id: manifest.id, version: manifest.version, name: manifest.name, description: manifest.description,
      source: row.source, enabled: Boolean(row.enabled), activities: manifest.activities, permissions: manifest.permissions,
      entryUrl: row.source === 'remote' ? httpUrl(manifest.entry, row.manifest_url!).href :
        assetUrl(`/plugins/${manifest.id}/`, manifest.entry),
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

  list(): PluginInfo[] { return guard(() => [this.builtin(), ...this.rows().map((row) => this.info(row))]); }

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

  private save(manifest: PluginManifest, source: PluginRow['source'], directory: string | null, manifestUrl: string | null): PluginInfo {
    this.db.prepare(`INSERT INTO plugins(id, manifest, source, enabled, manifest_url, directory) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET manifest=excluded.manifest, source=excluded.source,
      manifest_url=excluded.manifest_url, directory=excluded.directory`)
      .run(manifest.id, JSON.stringify(manifest), source, manifestUrl, directory);
    return this.info(this.row(manifest.id));
  }

  installZip(bytes: Uint8Array): PluginInfo {
    return guard(() => {
      const files = readZip(bytes, 'plugin.json');
      const stage = makeStage(this.root);
      try {
        extractFiles(files, stage);
        const manifest = this.checkManifest(readJson(stage, 'plugin.json'));
        if (/^https?:\/\//i.test(manifest.entry)) httpUrl(manifest.entry);
        else {
          const entry = safePath(stage, manifest.entry);
          if (!existsSync(entry) || !lstatSync(entry).isFile()) validationError([{ path: 'entry', level: 'error', message: '插件入口文件不存在' }]);
        }
        const target = safePath(this.root, manifest.id);
        let info!: PluginInfo;
        replaceDirectory(stage, target, () => { info = this.save(manifest, 'installed', target, null); });
        return info;
      } finally { rmSync(stage, { recursive: true, force: true }); }
    });
  }

  async registerRemote(manifestUrl: string): Promise<PluginInfo> {
    let url = httpUrl(manifestUrl);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RegistryError(504, 'REMOTE_TIMEOUT', '远程插件清单请求超时'));
      }, REMOTE_MANIFEST_TIMEOUT_MS);
    });
    try {
      const operation = async () => {
        for (let redirects = 0; redirects <= 5; redirects++) {
          const response = await this.fetcher(url.href, { signal: controller.signal, redirect: 'manual', headers: { accept: 'application/json' } });
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            void response.body?.cancel();
            const location = response.headers.get('location');
            if (!location || redirects === 5) throw new RegistryError(502, 'REMOTE_REDIRECT', '远程清单重定向异常');
            url = httpUrl(location, url.href); continue;
          }
          if (!response.ok) { void response.body?.cancel(); throw new RegistryError(502, 'REMOTE_FETCH_FAILED', '无法获取远程插件清单'); }
          if (Number(response.headers.get('content-length')) > REMOTE_MANIFEST_MAX_BYTES) {
            void response.body?.cancel();
            throw new RegistryError(413, 'REMOTE_TOO_LARGE', '远程插件清单超过 1 MiB');
          }
          if (!response.body) throw new RegistryError(400, 'INVALID_MANIFEST', '远程插件清单为空');
          const reader = response.body.getReader();
          const cancel = () => { void reader.cancel().catch(() => {}); };
          controller.signal.addEventListener('abort', cancel, { once: true });
          const chunks: Uint8Array[] = [];
          let length = 0;
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              length += next.value.length;
              if (length > REMOTE_MANIFEST_MAX_BYTES) throw new RegistryError(413, 'REMOTE_TOO_LARGE', '远程插件清单超过 1 MiB');
              chunks.push(next.value);
            }
          } finally {
            controller.signal.removeEventListener('abort', cancel);
            cancel(); reader.releaseLock();
          }
          let input: unknown;
          try { input = JSON.parse(Buffer.concat(chunks, length).toString('utf8')); } catch {
            throw new RegistryError(400, 'INVALID_MANIFEST', '远程插件清单不是有效 JSON');
          }
          if (controller.signal.aborted) throw new RegistryError(504, 'REMOTE_TIMEOUT', '远程插件清单请求超时');
          return { input, url: url.href };
        }
        throw new RegistryError(502, 'REMOTE_REDIRECT', '远程清单重定向异常');
      };
      const downloaded = await Promise.race([operation(), timeout]);
      return guard(() => {
        const manifest = this.checkManifest(downloaded.input);
        httpUrl(manifest.entry, downloaded.url);
        const old = this.rows().find((row) => row.id === manifest.id);
        const oldDirectory = old?.source === 'installed' ? this.directory(manifest.id) : undefined;
        const backup = join(this.root, `.backup-${randomUUID()}`);
        if (oldDirectory) renameSync(oldDirectory, backup);
        let info: PluginInfo;
        try { info = this.save(manifest, 'remote', null, downloaded.url); } catch (error) {
          if (oldDirectory) renameSync(backup, oldDirectory);
          throw error;
        }
        if (oldDirectory) rmSync(backup, { recursive: true, force: true });
        return info;
      });
    } catch (error) {
      if (error instanceof RegistryError) throw error;
      throw new RegistryError(502, 'REMOTE_FETCH_FAILED', '无法获取远程插件清单');
    } finally { clearTimeout(timer); controller.abort(); }
  }

  setEnabled(id: string, enabled: boolean): PluginInfo {
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
