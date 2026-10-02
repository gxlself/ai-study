import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  rootDir: string;
  port: number;
  host: string;
  dataDir: string;
  contentDirs: string[];
  playerDist: string;
  adminDist: string;
  milestonesPath: string;
  reloadIntervalMs: number;
  logger: boolean;
}

export function findWorkspaceRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  let directory = resolve(start);
  while (!existsSync(join(directory, 'pnpm-workspace.yaml'))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error('找不到 pnpm-workspace.yaml，请在 Sprout 工作区内运行服务端');
    directory = parent;
  }
  return directory;
}

export function loadConfig(
  overrides: Partial<ServerConfig> = {},
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const rootDir = resolve(overrides.rootDir ?? findWorkspaceRoot());
  const absolute = (path: string) => isAbsolute(path) ? path : resolve(rootDir, path);
  const port = overrides.port ?? Number(env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 必须是 0 到 65535 的整数');
  return {
    rootDir,
    port,
    host: overrides.host ?? env.HOST ?? '0.0.0.0',
    dataDir: absolute(overrides.dataDir ?? env.SPROUT_DATA_DIR ?? 'data'),
    contentDirs: (overrides.contentDirs ??
      (env.SPROUT_CONTENT_DIRS ?? 'content/packs').split(',').map((s) => s.trim()).filter(Boolean)).map(absolute),
    playerDist: absolute(overrides.playerDist ?? env.SPROUT_PLAYER_DIST ?? 'apps/player/dist'),
    adminDist: absolute(overrides.adminDist ?? env.SPROUT_ADMIN_DIST ?? 'apps/admin/dist'),
    milestonesPath: absolute(overrides.milestonesPath ?? env.SPROUT_MILESTONES ?? 'content/milestones/milestones.json'),
    reloadIntervalMs: overrides.reloadIntervalMs ?? 2000,
    logger: overrides.logger ?? false,
  };
}
