import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{
    data: T | undefined; loading: boolean; error: Error | null; path: string | null;
  }>({ data: undefined, loading: !!path, error: null, path });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    if (!path) {
      setState({ data: undefined, loading: false, error: null, path });
      return;
    }
    setState({ data: undefined, loading: true, error: null, path });
    api.get<T>(path, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: null, path }); },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ data: undefined, loading: false, error: error instanceof Error ? error : new Error('加载失败'), path });
        }
      },
    );
    return () => controller.abort();
  }, [path, revision]);
  // 切换孩子时不短暂展示上一个孩子的数据。
  const current = state.path === path ? state : { data: undefined, loading: !!path, error: null };
  return { data: current.data, loading: current.loading, error: current.error, reload };
}
