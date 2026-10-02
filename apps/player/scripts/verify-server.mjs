import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const missing = !existsSync(join(root, '../../packages/activities/src/index.ts'));
const fallback = process.env.SPROUT_VERIFY_MISSING_ACTIVITIES === '1';
if (missing && !fallback) throw new Error('活动包尚未完成；验证占位步骤需显式设置 SPROUT_VERIFY_MISSING_ACTIVITIES=1');
if (fallback) console.warn('[verify-server] 仅本次浏览器验收使用空活动注册表，所有步骤显示缺少插件；不是正式构建。');
const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  server: { port: Number(process.env.PORT || 5310), host: '127.0.0.1', strictPort: true },
  plugins: fallback ? [{
    name: 'verification-only-missing-activities',
    enforce: 'pre',
    resolveId(id) {
      if (id === '@sprout/activities' || id === '@sprout/activities/styles.css') return `\0verification:${id}`;
    },
    load(id) {
      if (id === '\0verification:@sprout/activities') return 'export const builtinActivities = [];';
      if (id === '\0verification:@sprout/activities/styles.css') return '';
    },
  }] : [],
});
await server.listen();
server.printUrls();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
