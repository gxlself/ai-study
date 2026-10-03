import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createServer } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const label = 'com.sprout.server';

export function options(args, env = process.env) {
  const result = {
    repo: resolve(here, '../..'), data: null, node: process.execPath,
    port: 4310, tz: env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
    home: homedir(), dryRun: false, uninstall: false,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--uninstall') result.uninstall = true;
    else {
      const key = { '--repo': 'repo', '--data-dir': 'data', '--node': 'node', '--port': 'port', '--timezone': 'tz' }[arg];
      const value = args[++index];
      if (!key || !value || value.startsWith('--')) throw new Error(`无效参数：${arg}`);
      result[key] = key === 'port' ? Number(value) : value;
    }
  }
  if (!Number.isInteger(result.port) || result.port < 1 || result.port > 65535) throw new Error('端口须为 1–65535。');
  result.repo = resolve(result.repo);
  result.node = resolve(result.node);
  result.data = resolve(result.data || join(result.repo, 'data'));
  if (result.repo === result.data) throw new Error('数据目录不能是仓库根目录。');
  if (result.tz.includes('\0')) throw new Error('时区无效。');
  return result;
}

export function renderPlist(template, config) {
  const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  const mapping = { NODE: config.node, REPO: config.repo, DATA: config.data, PORT: config.port, HOME: config.home, TZ: config.tz };
  for (const [key, value] of Object.entries(mapping)) template = template.replaceAll(`__${key}__`, escape(value));
  if (/__[A-Z]+__/.test(template)) throw new Error('launchd 模板有未填充的字段。');
  return template;
}

async function checkPort(port) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`端口 ${port} 已占用，请使用 --port 指定空闲端口。`)));
    server.listen(port, '0.0.0.0', () => server.close(done));
  });
}

export async function install(config) {
  const target = join(config.home, `Library/LaunchAgents/${label}.plist`);
  const domain = `gui/${process.getuid()}`;
  if (config.uninstall) {
    if (config.dryRun) { console.info(`将卸载 ${label}，保留 ${config.data}`); return; }
    spawnSync('launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' });
    await rm(target, { force: true });
    console.info('已停止并卸载自启配置；没有删除任何家庭数据。');
    return;
  }
  for (const path of ['pnpm-workspace.yaml', 'apps/server/dist/index.js', 'apps/player/dist/index.html', 'apps/admin/dist/index.html']) {
    if (!existsSync(join(config.repo, path))) throw new Error(`缺少 ${path}，请先构建三个应用。`);
  }
  const version = spawnSync(config.node, ['-p', 'process.versions.node'], { encoding: 'utf8' });
  const [major, minor] = version.stdout?.trim().split('.').map(Number) ?? [];
  if (version.status !== 0 || major < 22 || (major === 22 && minor < 13)) throw new Error('launchd 需要 Node 22.13+ 的绝对路径。');
  const plist = renderPlist(await readFile(join(here, `${label}.plist`), 'utf8'), config);
  if (config.dryRun) { console.info(plist); return; }
  if (process.platform !== 'darwin') throw new Error('launchd 安装仅支持 macOS。');
  if (existsSync(target)) spawnSync('launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' });
  await checkPort(config.port);
  await mkdir(dirname(target), { recursive: true });
  await mkdir(join(config.data, 'logs'), { recursive: true, mode: 0o700 });
  await writeFile(target, plist, { mode: 0o600 });
  const result = spawnSync('launchctl', ['bootstrap', domain, target], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('launchctl bootstrap 失败，请查看错误及日志。');
  console.info(`已安装 ${label}，家庭后台 http://localhost:${config.port}/admin/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  install(options(process.argv.slice(2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
