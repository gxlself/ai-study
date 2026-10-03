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
    app.log.warn({ host: config.host, port: config.port },
      '服务使用明文 HTTP；0.0.0.0/:: 会监听所有网卡。仅部署到可信家庭局域网，不要映射到公网；跨网络访问请配置 HTTPS 反向代理。CORS 不是认证或网络隔离。');
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
