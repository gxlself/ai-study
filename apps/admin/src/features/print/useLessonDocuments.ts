import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { LessonDocument } from '../content/model';

export function useLessonDocuments(ids: string[]) {
  const key = JSON.stringify(ids);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const [state, setState] = useState<{
    data: LessonDocument[]; loading: boolean; error: Error | null; key: string;
  }>({ data: [], loading: !!ids.length, error: null, key });
  useEffect(() => {
    const controller = new AbortController();
    const lessonIds = JSON.parse(key) as string[];
    if (!lessonIds.length) {
      setState({ data: [], loading: false, error: null, key });
      return () => controller.abort();
    }
    setState({ data: [], loading: true, error: null, key });
    Promise.all(lessonIds.map((id) => api.get<LessonDocument>(`/api/lessons/${encodeURIComponent(id)}`, { signal: controller.signal }))).then(
      (data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: null, key }); },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ data: [], loading: false,
          error: error instanceof Error ? error : new Error('课程资料加载失败'), key });
      },
    );
    return () => controller.abort();
  }, [key, revision]);
  const current = state.key === key ? state : { data: [], loading: !!ids.length, error: null };
  return { ...current, reload };
}
