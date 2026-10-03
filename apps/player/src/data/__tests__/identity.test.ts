// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { identityDigest, remoteStateKey } from '../identity';

describe('缓存身份摘要', () => {
  it.each(['', 'abc', '芽芽成长', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)])('与标准 SHA-256 一致 %j', (value) => {
    expect(identityDigest(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });
  it('服务器与凭据共同隔离身份，键名不包含原始凭据', () => {
    const a = remoteStateKey('http://192.168.1.2:4310', 'device-token');
    expect(a).toMatch(/^sprout\.remote:v2:[a-f0-9]{64}$/);
    expect(a).not.toContain('device-token');
    expect(a).not.toBe(remoteStateKey('http://192.168.1.2:4310', 'other-token'));
    expect(a).not.toBe(remoteStateKey('http://192.168.1.3:4310', 'device-token'));
  });
});
