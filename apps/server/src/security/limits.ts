import type { FastifyInstance, FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import { ApiError } from '../errors';

export const RESOURCE_LIMITS = {
  password: { capacity: 10, windowMs: 60_000, concurrency: 2 },
  'pair-start': { capacity: 6, windowMs: 60_000, concurrency: 8 },
  'pair-poll': { capacity: 120, windowMs: 60_000, concurrency: 16 },
  'pair-approve': { capacity: 12, windowMs: 60_000, concurrency: 4 },
  upload: { capacity: 20, windowMs: 60_000, concurrency: 2 },
  import: { capacity: 12, windowMs: 60_000, concurrency: 1 },
  'remote-plugin': { capacity: 12, windowMs: 60_000, concurrency: 2 },
  tts: { capacity: 30, windowMs: 60_000, concurrency: 2 },
  preview: { capacity: 20, windowMs: 60_000, concurrency: 4 },
} as const;
export type ResourceKind = keyof typeof RESOURCE_LIMITS;

declare module 'fastify' {
  interface FastifyContextConfig { sproutResource?: ResourceKind }
}

interface Bucket { tokens: number; updatedAt: number; kind: ResourceKind }
interface Lease { kind: ResourceKind; running: boolean }
export const MAX_RATE_BUCKETS = 2048;

export class ResourceLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly leases = new WeakMap<FastifyRequest, Lease>();
  private readonly active = new Map<ResourceKind, number>();

  constructor(private readonly now: () => number = Date.now) {}

  register(app: FastifyInstance): void {
    app.addHook('onRoute', (route) => {
      if (!route.config?.sproutResource) return;
      const handler = route.handler;
      const limiter = this;
      route.handler = async function (request, reply) {
        const lease = limiter.leases.get(request);
        if (lease) lease.running = true;
        try { return await handler.call(this, request, reply); }
        finally { limiter.release(request); }
      };
    });
    app.addHook('onResponse', async (request) => this.release(request));
    app.addHook('onError', async (request) => this.releaseWaiting(request));
    app.addHook('onTimeout', async (request) => this.releaseWaiting(request));
    app.addHook('onRequestAbort', async (request) => this.releaseWaiting(request));
    app.addHook('onClose', async () => { this.buckets.clear(); this.active.clear(); });
  }

  guard(kind: ResourceKind): onRequestAsyncHookHandler {
    return async (request, reply) => {
      this.take(`${kind}:ip:${request.ip}`, kind, reply);
      if (request.principal?.role === 'admin') this.take(`${kind}:admin`, kind, reply);
      const count = this.active.get(kind) ?? 0;
      if (count >= RESOURCE_LIMITS[kind].concurrency) {
        reply.header('Retry-After', 5);
        throw new ApiError(429, 'RESOURCE_BUSY', '同类任务正在处理，请稍后再试');
      }
      this.active.set(kind, count + 1);
      this.leases.set(request, { kind, running: false });
    };
  }

  private take(key: string, kind: ResourceKind, reply: FastifyReply): void {
    const now = this.now();
    const policy = RESOURCE_LIMITS[kind];
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= MAX_RATE_BUCKETS) {
        for (const [id, entry] of this.buckets) {
          if (now - entry.updatedAt >= RESOURCE_LIMITS[entry.kind].windowMs) this.buckets.delete(id);
        }
        if (this.buckets.size >= MAX_RATE_BUCKETS) {
          reply.header('Retry-After', 60);
          throw new ApiError(429, 'RATE_LIMITED', '请求来源过多，请稍后再试');
        }
      }
      bucket = { tokens: policy.capacity, updatedAt: now, kind };
      this.buckets.set(key, bucket);
    }
    bucket.tokens = Math.min(policy.capacity, bucket.tokens + Math.max(0, now - bucket.updatedAt) * policy.capacity / policy.windowMs);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      reply.header('Retry-After', Math.max(1, Math.ceil((1 - bucket.tokens) * policy.windowMs / policy.capacity / 1000)));
      throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
    }
    bucket.tokens -= 1;
  }

  private release(request: FastifyRequest): void {
    const lease = this.leases.get(request);
    if (!lease) return;
    this.leases.delete(request);
    this.active.set(lease.kind, Math.max(0, (this.active.get(lease.kind) ?? 1) - 1));
  }

  private releaseWaiting(request: FastifyRequest): void {
    // 断开连接不代表密码计算或远程请求已停止，运行中的任务由 handler 的 finally 释放。
    if (!this.leases.get(request)?.running) this.release(request);
  }
}
