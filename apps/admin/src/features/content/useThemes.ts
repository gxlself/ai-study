import { useEffect, useState } from 'react';
import type { Route } from '@sprout/schema';
import { api } from '../../lib/api';
import { useResource } from '../../lib/hooks';

type RouteSummary = Pick<Route, 'id' | 'title'> & { packId: string };
export type ThemeOption = { value: string; label: string; packId: string };

export function useThemes() {
  const routes = useResource<RouteSummary[]>('/api/routes');
  const [themes, setThemes] = useState<ThemeOption[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!routes.data) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all(routes.data.map(async (summary) => ({
      route: await api.get<Route>(`/api/routes/${encodeURIComponent(summary.id)}`, { signal: controller.signal }),
      packId: summary.packId,
    }))).then((items) => {
      if (controller.signal.aborted) return;
      const choices = items.flatMap(({ route, packId }) => route.stages.flatMap((stage) => stage.themes.map((theme) => ({
        value: theme.id, label: `${stage.title.zh} · ${theme.title.zh}`, packId,
      }))));
      setThemes([...new Map(choices.map((choice) => [choice.value, choice])).values()]);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause : new Error('主题加载失败'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [routes.data]);
  return { themes, loading: routes.loading || loading, error: routes.error ?? error, reload: routes.reload };
}
