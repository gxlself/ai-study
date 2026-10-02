import { buildApp } from './app';
import { loadConfig } from './config';

async function main(): Promise<void> {
  const config = loadConfig({ logger: true });
  const app = await buildApp(config);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    try { await app.close(); }
    catch (error) { app.log.error(error); process.exitCode = 1; }
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    app.log.error(error);
    await close();
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '服务端启动失败');
  process.exitCode = 1;
});
