// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConnection, normalizeServer, readConnection, saveConnection, StorageError } from '../index';
import { MemoryStorage } from './fixtures';
import { legacyRemoteStateKey, remoteStateKey } from '../identity';

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('location', { protocol: 'https:', origin: 'https://sprout.example' });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('连接设置', () => {
  it('规范化 LAN、HTTPS、IPv6 和反向代理前缀', () => {
    expect(normalizeServer(' 192.168.1.2:4310/// ')).toBe('http://192.168.1.2:4310');
    expect(normalizeServer('HTTPS://SPROUT.EXAMPLE:443/')).toBe('https://sprout.example');
    expect(normalizeServer('[::1]:4310')).toBe('http://[::1]:4310');
    expect(normalizeServer('http://sprout.example/player/')).toBe('http://sprout.example/player');
    expect(normalizeServer('')).toBe('https://sprout.example');
  });

  it.each(['ftp://sprout.example', 'file:///tmp', 'https://user:secret@sprout.example', 'http://host/path?token=secret', 'http://host/#/', 'bad address'])('拒绝无效服务器地址 %s', (server) => {
    expect(() => normalizeServer(server)).toThrow();
  });

  it('切换和清除连接移除旧身份队列与凭据键，保留离线档案和其它 v2 身份', () => {
    expect(readConnection()).toBeNull();
    storage.setItem('sprout.local.state', 'saved history');
    storage.setItem(remoteStateKey('https://other.test', 'other-token'), 'other history');
    storage.setItem('sprout.remote:history', 'legacy');
    saveConnection({ kind: 'remote', server: '192.168.1.2:4310/', token: ' token-a ' });
    expect(readConnection()).toEqual({ kind: 'remote', server: 'http://192.168.1.2:4310', token: 'token-a' });
    expect(storage.getItem('sprout.source')).toBe('remote');
    expect(storage.getItem('sprout.server')).toBe('http://192.168.1.2:4310');
    expect(storage.getItem('sprout.deviceToken')).toBe('token-a');
    const key = remoteStateKey('http://192.168.1.2:4310', 'token-a');
    storage.setItem(key, 'pending');
    storage.setItem(legacyRemoteStateKey('http://192.168.1.2:4310', 'token-a'), 'old pending');
    saveConnection({ kind: 'remote', server: '192.168.1.2:4310/', token: 'token-a' });
    expect(storage.getItem(key)).toBe('pending');
    saveConnection({ kind: 'local' });
    expect(readConnection()).toEqual({ kind: 'local' });
    expect(storage.getItem('sprout.deviceToken')).toBeNull();
    clearConnection();
    expect(readConnection()).toBeNull();
    expect(storage.getItem('sprout.local.state')).toBe('saved history');
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem('sprout.remote:history')).toBeNull();
    expect(storage.getItem(remoteStateKey('https://other.test', 'other-token'))).toBe('other history');
  });

  it('已配对且未保存地址时使用 http(s) 页面 origin，Capacitor 不会误连 localhost', () => {
    storage.setItem('sprout.deviceToken', 'paired');
    expect(readConnection()).toEqual({ kind: 'remote', server: 'https://sprout.example', token: 'paired' });
    vi.stubGlobal('location', { protocol: 'capacitor:', origin: 'capacitor://localhost' });
    expect(readConnection()).toBeNull();
    expect(() => normalizeServer('')).toThrow();
  });

  it('不保存半配对连接，存储不可用不会误报已保存', () => {
    expect(() => saveConnection({ kind: 'remote', server: 'http://localhost:4310' })).toThrow();
    expect(readConnection()).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('disabled'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('disabled'); },
    });
    expect(readConnection()).toBeNull();
    expect(() => saveConnection({ kind: 'local' })).toThrow(StorageError);
    expect(() => clearConnection()).toThrow(StorageError);
  });
});
