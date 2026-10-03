/** 老 Safari 的媒体查询只有 addListener / removeListener。 */
export function observeMediaQuery(query: MediaQueryList, change: () => void): () => void {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }
  query.addListener(change);
  return () => query.removeListener(change);
}

/** 旧电视 / Safari 的全屏方法可能带前缀、返回 void 或同步抛错。 */
export function tryFullscreen(element: HTMLElement): Promise<void> {
  const legacy = element as HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };
  const request = element.requestFullscreen ?? legacy.webkitRequestFullscreen;
  if (typeof request !== 'function') return Promise.resolve();
  try {
    return Promise.resolve(request.call(element)).then(() => undefined, () => undefined);
  } catch {
    return Promise.resolve();
  }
}

/** 请求完成或退出页面后及时释放超时和监听，不依赖 AbortSignal 的新静态方法。 */
export function requestDeadline(parent: AbortSignal, timeoutMs: number): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent.removeEventListener('abort', abort);
    },
  };
}
