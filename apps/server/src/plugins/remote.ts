import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import { checkServerIdentity } from 'node:tls';
import { RegistryError } from '../content/files';

export const REMOTE_MANIFEST_MAX_BYTES = 1024 * 1024;
export const REMOTE_MANIFEST_TIMEOUT_MS = 10_000;
export const REMOTE_MANIFEST_MAX_REDIRECTS = 5;

export type PluginResolver = (hostname: string) => Promise<readonly LookupAddress[]>;
export const resolvePluginHost: PluginResolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

interface ManifestResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

const metadataHosts = ['metadata', 'metadata.google.internal', 'metadata.goog', 'instance-data.ec2.internal', 'instance-data'];
const metadataIPv6 = new Set(['fd00:ec2::254', 'fd00:ec2::23', 'fd20:ce::254'].map(ipv6Number));
const redirects = new Set([301, 302, 303, 307, 308]);

export function httpUrl(value: string, base?: string): URL {
  let url: URL;
  try { url = new URL(value, base); } catch { throw new RegistryError(400, 'INVALID_URL', '插件地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new RegistryError(400, 'INVALID_URL', '插件地址只允许不含账号密码的 HTTP(S) URL');
  }
  return url;
}

function unsafeAddress(): never {
  throw new RegistryError(400, 'UNSAFE_REMOTE_ADDRESS', '插件地址不允许回环、链路本地、云元数据或保留地址，公网地址必须使用 HTTPS');
}

function ipv4Kind(address: string): 'lan' | 'public' {
  const [a, b, c] = address.split('.').map(Number);
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'lan';
  if (a === 0 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) ||
      address === '168.63.129.16') unsafeAddress();
  return 'public';
}

function ipv6Number(address: string): bigint {
  const expanded = address.replace(/(\d+\.\d+\.\d+\.\d+)$/, (ipv4) => {
    const octets = ipv4.split('.').map(Number);
    return `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  });
  const [left, right] = expanded.split('::');
  const first = left ? left.split(':') : [];
  const last = right ? right.split(':') : [];
  const groups = right === undefined ? first : [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function inIpv6Range(address: bigint, base: string, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return (address >> shift) === (ipv6Number(base) >> shift);
}

function addressKind(address: string): 'lan' | 'public' {
  const family = isIP(address);
  if (family === 4) return ipv4Kind(address);
  if (family !== 6 || address.includes('%')) unsafeAddress();
  const value = ipv6Number(address);
  // IPv4 映射地址按实际 IPv4 校验，阻止十六进制形式绕过回环或 metadata 限制。
  if ((value >> 32n) === 0xffffn) {
    const ipv4 = [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join('.');
    return ipv4Kind(ipv4);
  }
  if (metadataIPv6.has(value)) unsafeAddress();
  if (inIpv6Range(value, 'fc00::', 7)) return 'lan';
  if (!inIpv6Range(value, '2000::', 3) ||
      inIpv6Range(value, '2001::', 23) || inIpv6Range(value, '2001:db8::', 32) ||
      inIpv6Range(value, '2002::', 16) || inIpv6Range(value, '3fff::', 20)) unsafeAddress();
  return 'public';
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function timeoutError(): RegistryError {
  return new RegistryError(504, 'REMOTE_TIMEOUT', '远程插件地址校验或清单请求超时');
}

export function assertRemoteActive(signal: AbortSignal): void {
  if (signal.aborted) throw timeoutError();
}

export async function validateRemoteUrl(url: URL, resolver: PluginResolver, signal: AbortSignal): Promise<LookupAddress> {
  assertRemoteActive(signal);
  const hostname = hostnameOf(url);
  if (hostname === 'localhost' || hostname.endsWith('.localhost') ||
      metadataHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) unsafeAddress();
  const family = isIP(hostname);
  let addresses: readonly LookupAddress[];
  try {
    addresses = family ? [{ address: hostname, family }] : await resolver(hostname);
  } catch {
    assertRemoteActive(signal);
    throw new RegistryError(502, 'REMOTE_DNS_FAILED', '无法解析远程插件地址');
  }
  assertRemoteActive(signal);
  if (!addresses.length) throw new RegistryError(502, 'REMOTE_DNS_FAILED', '远程插件地址没有 DNS 解析结果');
  for (const address of addresses) {
    if (!address.family || isIP(address.address) !== address.family) unsafeAddress();
    if (addressKind(address.address) === 'public' && url.protocol !== 'https:') unsafeAddress();
  }
  return { address: addresses[0].address, family: addresses[0].family };
}

export async function withRemoteTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError());
      controller.abort();
    }, REMOTE_MANIFEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError(502, 'REMOTE_FETCH_FAILED', '无法获取远程插件清单');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function requestPinned(url: URL, address: LookupAddress, signal: AbortSignal): Promise<ManifestResponse> {
  assertRemoteActive(signal);
  // URL 保留原始域名供 Host/SNI/证书验证；连接 lookup 只返回本次已检查的 IP。
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    callback(null, options.all ? [address] : address.address, address.family);
  };
  const options: https.RequestOptions = {
    method: 'GET', agent: false, family: address.family, lookup: pinnedLookup,
    headers: { accept: 'application/json', 'accept-encoding': 'identity', host: url.host },
    rejectUnauthorized: true, checkServerIdentity,
    servername: isIP(hostnameOf(url)) ? undefined : hostnameOf(url),
  };
  return new Promise((resolve, reject) => {
    let response: http.IncomingMessage | undefined;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const request = (url.protocol === 'https:' ? https : http).request(url, options, (message) => {
      response = message;
      message.once('close', cleanup);
      if (signal.aborted) { message.destroy(); reject(timeoutError()); return; }
      const headers = new Headers();
      for (const [key, value] of Object.entries(message.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      resolve({
        status: message.statusCode ?? 0, headers,
        body: Readable.toWeb(message) as ReadableStream<Uint8Array>,
      });
    });
    const abort = () => { request.destroy(timeoutError()); response?.destroy(); };
    request.once('error', (error) => { cleanup(); reject(error); });
    signal.addEventListener('abort', abort, { once: true });
    request.end();
  });
}

function cancelBody(response: ManifestResponse): void {
  void response.body?.cancel().catch(() => {});
}

async function readManifest(response: ManifestResponse, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > REMOTE_MANIFEST_MAX_BYTES) {
    cancelBody(response);
    throw new RegistryError(413, 'REMOTE_TOO_LARGE', '远程插件清单超过 1 MiB');
  }
  if (!response.body) throw new RegistryError(400, 'INVALID_MANIFEST', '远程插件清单为空');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      assertRemoteActive(signal);
      if (next.done) break;
      length += next.value.byteLength;
      if (length > REMOTE_MANIFEST_MAX_BYTES) throw new RegistryError(413, 'REMOTE_TOO_LARGE', '远程插件清单超过 1 MiB');
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
  assertRemoteActive(signal);
  try { return JSON.parse(Buffer.concat(chunks, length).toString('utf8')); } catch {
    throw new RegistryError(400, 'INVALID_MANIFEST', '远程插件清单不是有效 JSON');
  }
}

export async function downloadRemoteManifest(
  manifestUrl: string,
  resolver: PluginResolver,
  signal: AbortSignal,
  fetcher?: typeof fetch,
): Promise<{ input: unknown; url: string }> {
  let url = httpUrl(manifestUrl);
  for (let hop = 0; hop <= REMOTE_MANIFEST_MAX_REDIRECTS; hop++) {
    const address = await validateRemoteUrl(url, resolver, signal);
    const response = fetcher
      ? await fetcher(url.href, { signal, redirect: 'manual', headers: { accept: 'application/json' } })
      : await requestPinned(url, address, signal);
    if (signal.aborted) { cancelBody(response); assertRemoteActive(signal); }
    if (redirects.has(response.status)) {
      cancelBody(response);
      const location = response.headers.get('location');
      if (!location || hop === REMOTE_MANIFEST_MAX_REDIRECTS) {
        throw new RegistryError(502, 'REMOTE_REDIRECT', '远程清单重定向异常');
      }
      url = httpUrl(location, url.href);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      cancelBody(response);
      throw new RegistryError(502, 'REMOTE_FETCH_FAILED', '无法获取远程插件清单');
    }
    return { input: await readManifest(response, signal), url: url.href };
  }
  throw new RegistryError(502, 'REMOTE_REDIRECT', '远程清单重定向异常');
}
