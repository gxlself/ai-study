import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import { loadConfig } from '../src/config';
import { ApiError } from '../src/errors';
import { corsOriginAllowed, parseCorsOrigins } from '../src/security/cors';
import { MAX_RATE_BUCKETS, RESOURCE_LIMITS, ResourceLimiter, type ResourceKind } from '../src/security/limits';
import { MAX_PENDING_TTS_TASKS, TtsService, type TtsProvider } from '../src/tts';
import { fixture } from './app-fixture';

describe('局域网 CORS 来源校验', () => {
  it.each([
    'http://localhost:5310', 'https://localhost', 'http://127.0.0.1:4310', 'http://127.25.1.2',
    'http://10.20.30.40', 'https://172.16.0.1', 'http://172.31.255.254:5311', 'http://192.168.1.5',
    'http://[::1]:5310', 'https://[fd12:3456::1]', 'http://[fc00::10]', 'capacitor://localhost',
  ])('允许 %s', (origin) => expect(corsOriginAllowed(origin, null)).toBe(true));

  it.each([
    'null', '*', '', 'https://example.com', 'http://8.8.8.8', 'http://172.15.0.1',
    'http://172.32.0.1', 'http://192.169.0.1', 'http://169.254.169.254', 'http://[fe80::1]',
    'https://[2001:4860:4860::8888]', 'http://localhost.attacker.example',
    'http://192.168.1.1.attacker.example', 'http://localhost@attacker.example', 'file:///',
    'http://localhost/extra', 'http://localhost?x=1', 'http://localhost#evil', 'javascript:alert(1)',
  ])('拒绝 %s', (origin) => expect(corsOriginAllowed(origin, null)).toBe(false));

  it('配置为精确覆盖而非开放默认白名单；不接受通配符、凭据或路径', () => {
    const configured = parseCorsOrigins(' https://trusted.example:443/ ,capacitor://localhost,https://trusted.example ');
    expect(configured).toEqual(['https://trusted.example', 'capacitor://localhost']);
    expect(corsOriginAllowed('https://trusted.example', configured)).toBe(true);
    expect(corsOriginAllowed('http://localhost', configured)).toBe(false);
    expect(corsOriginAllowed('https://trusted.example.attacker.example', configured)).toBe(false);
    expect(corsOriginAllowed('http://localhost', [])).toBe(false);
    for (const invalid of ['*', 'https://*.example', 'https://user:pass@example.com', 'https://example.com/path']) {
      expect(() => parseCorsOrigins(invalid)).toThrow();
    }
    expect(loadConfig({}, {}).host).toBe('0.0.0.0');
    expect(loadConfig({}, {}).corsOrigins).toBeNull();
    expect(loadConfig({}, { SPROUT_CORS_ORIGINS: 'https://trusted.example' }).corsOrigins).toEqual(['https://trusted.example']);
    expect(loadConfig({}, { SPROUT_CORS_ORIGINS: '' }).corsOrigins).toEqual([]);
  });
});

describe('高成本任务配额与并发', () => {
  const apps: FastifyInstance[] = [];
  const create = async (kind: ResourceKind, handler: (request: FastifyRequest) => Promise<unknown>, now?: () => number) => {
    const app = Fastify();
    apps.push(app);
    const limiter = new ResourceLimiter(now);
    limiter.register(app);
    app.decorateRequest('principal', null);
    app.addHook('onRequest', async (request) => {
      if (request.headers['x-test-admin']) request.principal = { role: 'admin', hash: 'unit-test-admin' };
    });
    app.post('/work', { config: { sproutResource: kind }, onRequest: limiter.guard(kind) }, handler);
    await app.ready();
    return app;
  };
  afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

  it('token bucket 按时间补充并按实际 IP 隔离', async () => {
    let time = 0;
    const app = await create('pair-start', async () => ({ ok: true }), () => time);
    const post = () => app.inject({ method: 'POST', url: '/work' });
    for (let i = 0; i < RESOURCE_LIMITS['pair-start'].capacity; i++) expect((await post()).statusCode).toBe(200);
    const blocked = await post();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBe('10');
    time += 10_000;
    expect((await post()).statusCode).toBe(200);
    expect((await post()).statusCode).toBe(429);
    expect((await app.inject({ method: 'POST', url: '/work', remoteAddress: '10.0.0.2' })).statusCode).toBe(200);
  });

  it('多个管理员令牌/来源仍受家庭级配额限制', async () => {
    const app = await create('preview', async () => ({ ok: true }), () => 0);
    for (let i = 0; i < RESOURCE_LIMITS.preview.capacity; i++) {
      const response = await app.inject({ method: 'POST', url: '/work',
        remoteAddress: `10.0.0.${i + 1}`, headers: { 'x-test-admin': 'yes' } });
      expect(response.statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: '/work', remoteAddress: '10.0.1.1',
      headers: { 'x-test-admin': 'yes' } })).statusCode).toBe(429);
  });

  it('只允许两个并发密码任务，结束后释放名额', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started = 0;
    let ready: () => void = () => {};
    const running = new Promise<void>((resolve) => { ready = resolve; });
    const app = await create('password', async () => {
      if (++started === 2) ready();
      await gate;
      return { ok: true };
    });
    const first = app.inject({ method: 'POST', url: '/work' }).then((response) => response);
    const second = app.inject({ method: 'POST', url: '/work' }).then((response) => response);
    try {
      await running;
      const blocked = await app.inject({ method: 'POST', url: '/work' });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().code).toBe('RESOURCE_BUSY');
      expect(blocked.headers['retry-after']).toBe('5');
    } finally { release(); await Promise.allSettled([first, second]); }
    expect((await app.inject({ method: 'POST', url: '/work' })).statusCode).toBe(200);
  });

  it('解析失败和 handler 异常都释放导入名额', async () => {
    const app = await create('import', async (request) => {
      if (request.headers['x-test-error']) throw new ApiError(400, 'TEST_ERROR', '测试失败');
      return { ok: true };
    });
    expect((await app.inject({ method: 'POST', url: '/work', payload: '{',
      headers: { 'content-type': 'application/json' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/work', headers: { 'x-test-error': 'yes' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/work' })).statusCode).toBe(200);
  });

  it('读取请求体时断连释放名额，运行中的任务断连则等实际完成才释放', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let admitted: () => void = () => {};
    let admittedSignal = new Promise<void>((resolve) => { admitted = resolve; });
    let started: () => void = () => {};
    const startedSignal = new Promise<void>((resolve) => { started = resolve; });
    let aborted: () => void = () => {};
    const abortedSignal = new Promise<void>((resolve) => { aborted = resolve; });
    const app = Fastify();
    apps.push(app);
    const limits = new ResourceLimiter();
    limits.register(app);
    app.addHook('onRequestAbort', async (_request) => aborted());
    app.post('/work', { config: { sproutResource: 'import' }, onRequest: [
      limits.guard('import'), async () => admitted(),
    ] }, async (request) => {
      if (request.headers['x-test-wait']) { started(); await gate; }
      return { ok: true };
    });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const clients: http.ClientRequest[] = [];
    const open = (headers: http.OutgoingHttpHeaders) => {
      const client = http.request(`${address}/work`, { method: 'POST', headers });
      client.on('error', () => {});
      clients.push(client);
      return client;
    };
    try {
      const incomplete = open({ 'content-type': 'application/json', 'transfer-encoding': 'chunked' });
      incomplete.write('{');
      await admittedSignal;
      incomplete.destroy();
      await abortedSignal;
      expect((await app.inject({ method: 'POST', url: '/work' })).statusCode).toBe(200);

      admittedSignal = new Promise<void>((resolve) => { admitted = resolve; });
      const running = open({ 'x-test-wait': 'yes' });
      running.end();
      await startedSignal;
      const closed = new Promise<void>((resolve) => running.once('close', resolve));
      running.destroy();
      await closed;
      expect((await app.inject({ method: 'POST', url: '/work' })).statusCode).toBe(429);
      release();
      await new Promise((resolve) => setImmediate(resolve));
      expect((await app.inject({ method: 'POST', url: '/work' })).statusCode).toBe(200);
    } finally {
      release();
      for (const client of clients) client.destroy();
    }
  });

  it('配额索引大小有界，闲置满一个补充周期后可回收', async () => {
    let time = 0;
    const app = await create('pair-start', async () => ({ ok: true }), () => time);
    for (let i = 0; i < MAX_RATE_BUCKETS; i++) {
      const ip = `10.${Math.floor(i / 65536)}.${Math.floor(i / 256) % 256}.${i % 256}`;
      expect((await app.inject({ method: 'POST', url: '/work', remoteAddress: ip })).statusCode).toBe(200);
    }
    const next = () => app.inject({ method: 'POST', url: '/work', remoteAddress: '192.168.1.1' });
    expect((await next()).statusCode).toBe(429);
    time = 60_000;
    expect((await next()).statusCode).toBe(200);
  });
});

it('TTS 仅一个合成 worker，待处理队列有界，溢出返回 429 且关闭后不留任务', async () => {
  const paths = fixture();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let peak = 0;
  let synthesized = 0;
  const provider: TtsProvider = {
    id: 'test-provider',
    status: async () => ({ available: true, voices: { zh: ['Tingting'], en: ['Samantha'] } }),
    synthesize: async ({ outputPath }) => {
      active++;
      peak = Math.max(peak, active);
      try { await gate; await writeFile(outputPath, Buffer.from('test-audio')); synthesized++; }
      finally { active--; }
    },
  };
  const tts = new TtsService({ dataDir: paths.dataDir, provider,
    getSettings: () => ({ ttsProvider: 'auto', ttsVoices: { zh: '', en: '' } }) });
  const pending = Array.from({ length: MAX_PENDING_TTS_TASKS }, (_, i) => tts.generate('zh', `测试文本 ${i}`));
  try {
    await expect(tts.generate('zh', '超过队列上限')).rejects.toMatchObject({ statusCode: 429, code: 'TTS_BUSY' });
    release();
    await Promise.all(pending);
    await tts.close();
    expect(peak).toBe(1);
    expect(active).toBe(0);
    expect(synthesized).toBe(MAX_PENDING_TTS_TASKS);
  } finally {
    release();
    await Promise.allSettled(pending);
    await tts.close();
    rmSync(paths.directory, { recursive: true, force: true });
  }
});
