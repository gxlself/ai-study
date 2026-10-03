import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { builtinActivities } from '@sprout/activities';
import type { PluginInfo } from '@sprout/schema';
import { SDK_VERSION } from '../../../../packages/plugin-sdk/src/types';
import type { ActivityPlugin, SproutHostGlobal } from '../../../../packages/plugin-sdk/src/types';
import { installRuntimePolicy, pluginEntry } from '../security/csp';
import { requestDeadline } from '../compat';

function isActivity(value: unknown): value is ActivityPlugin {
  if (!value || typeof value !== 'object') return false;
  const plugin = value as Partial<ActivityPlugin>;
  return typeof plugin.type === 'string' && typeof plugin.version === 'string' &&
    typeof plugin.name?.zh === 'string' && typeof plugin.mount === 'function' &&
    (plugin.preload === undefined || typeof plugin.preload === 'function');
}

const externalType = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
let register: (plugin: ActivityPlugin) => void = () => {};

export const SproutHost: SproutHostGlobal = {
  sdkVersion: SDK_VERSION,
  React,
  ReactDOMClient,
  registerActivity(plugin) {
    if (isActivity(plugin) && externalType.test(plugin.type)) register(plugin);
  },
};

const modules = new Map<string, Promise<ActivityPlugin[]>>();
let importQueue: Promise<void> = Promise.resolve();

async function loadModule(url: string): Promise<{ default?: unknown }> {
  const deadline = requestDeadline(new AbortController().signal, 8_000);
  try {
    // import() 自身不能拒绝重定向；先校验入口，CSP 再限制实际求值来源。
    const response = await fetch(url, {
      signal: deadline.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    void response.body?.cancel().catch(() => {});
    if (!response.ok || response.redirected || (response.url && response.url !== url)) throw new Error('插件入口校验失败');
  } finally { deadline.dispose(); }
  return import(/* @vite-ignore */ url);
}

function importActivities(url: string, importer: typeof loadModule): Promise<ActivityPlugin[]> {
  const cached = modules.get(url);
  if (cached) return cached;
  // 注册式模块共享全局入口，串行求值避免异步 import 串错注册目标。
  const pending = importQueue.then(async () => {
    const registrations: ActivityPlugin[] = [];
    const previousRegister = register;
    register = (plugin) => { registrations.push(plugin); };
    globalThis.SproutHost = SproutHost;
    try {
      const imported = await importer(url);
      const exported = Array.isArray(imported.default) ? imported.default : [imported.default];
      return [...registrations, ...exported.filter(isActivity)];
    } finally {
      register = previousRegister;
    }
  });
  modules.set(url, pending);
  importQueue = pending.then(() => {}, () => {});
  void pending.catch(() => {
    if (modules.get(url) === pending) modules.delete(url);
  });
  return pending;
}

export interface PluginLoadError {
  pluginId: string;
  message: string;
}

export class ActivityRegistry {
  private readonly builtin = new Map<string, ActivityPlugin>();
  private activities: Map<string, ActivityPlugin>;
  private allowedExternal = new Set<string>();
  private generation = 0;
  private failures: PluginLoadError[] = [];

  constructor(private readonly importer = loadModule) {
    for (const activity of builtinActivities) this.builtin.set(activity.type, activity);
    this.activities = new Map(this.builtin);
    globalThis.SproutHost = SproutHost;
    register = (plugin) => {
      if (this.allowedExternal.has(plugin.type) && !this.builtin.has(plugin.type)) {
        this.activities.set(plugin.type, plugin);
      }
    };
  }

  get errors(): readonly PluginLoadError[] {
    return this.failures;
  }

  get(type: string): ActivityPlugin | undefined {
    return this.activities.get(type);
  }

  async load(plugins: PluginInfo[], resolveUrl: (url: string) => string, server = ''): Promise<void> {
    const generation = ++this.generation;
    const activities = new Map(this.builtin);
    const allowed = new Set<string>();
    const errors: PluginLoadError[] = [];
    const entries = new Map<PluginInfo, string>();
    for (const info of plugins) {
      if (!info.enabled || !info.entryUrl || info.source === 'builtin') continue;
      try { entries.set(info, pluginEntry(info, resolveUrl, server)); }
      catch (error) { errors.push({ pluginId: info.id, message: error instanceof Error ? error.message : String(error) }); }
    }
    installRuntimePolicy(server, [...entries.values()]);
    for (const info of plugins) {
      const entry = entries.get(info);
      if (!entry) continue;
      const declared = new Set(info.activities.map(({ type }) => type));
      try {
        globalThis.SproutHost = SproutHost;
        const loaded = await importActivities(entry, this.importer);
        if (generation !== this.generation) return;
        let accepted = 0;
        for (const activity of loaded) {
          if (!declared.has(activity.type) || !externalType.test(activity.type) ||
              this.builtin.has(activity.type)) continue;
          if (!activities.has(activity.type)) {
            activities.set(activity.type, activity);
            allowed.add(activity.type);
            accepted += 1;
          }
        }
        if (!accepted) errors.push({ pluginId: info.id, message: '插件未导出已声明的活动' });
      } catch (error) {
        errors.push({ pluginId: info.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (generation !== this.generation) return;
    this.activities = activities;
    this.allowedExternal = allowed;
    this.failures = errors;
  }
}
