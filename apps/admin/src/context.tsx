import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChildProfile } from '@sprout/schema';
import { App, Alert, Button } from 'antd';
import { api } from './lib/api';

interface FamilyContext {
  children: ChildProfile[];
  child: ChildProfile | undefined;
  childId: string | undefined;
  selectChild: (id: string) => void;
  refreshChildren: () => Promise<void>;
  loading: boolean;
}

const Context = createContext<FamilyContext | null>(null);
const CHILD_KEY = 'sprout.selectedChild';

export function FamilyProvider({ children: content }: { children: ReactNode }) {
  const { message } = App.useApp();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [childId, setChildId] = useState<string | undefined>(() => localStorage.getItem(CHILD_KEY) ?? undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);
  const refreshChildren = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const items = await api.get<ChildProfile[]>('/api/children');
      if (id !== requestId.current) return;
      setChildren(items);
      setError(undefined);
      setChildId((current) => items.some((child) => child.id === current) ? current : items[0]?.id);
    } catch (err) {
      if (id !== requestId.current) return;
      const text = err instanceof Error ? err.message : '孩子档案加载失败';
      setError(text);
      void message.error(text);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [message]);
  useEffect(() => { void refreshChildren(); return () => { ++requestId.current; }; }, [refreshChildren]);
  useEffect(() => {
    if (childId) localStorage.setItem(CHILD_KEY, childId);
    else localStorage.removeItem(CHILD_KEY);
  }, [childId]);
  return (
    <Context.Provider value={{
      children, childId, child: children.find((child) => child.id === childId),
      selectChild: setChildId, refreshChildren, loading,
    }}>
      {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => void refreshChildren()}>重试</Button>} />}
      {content}
    </Context.Provider>
  );
}

export function useFamily() {
  const value = useContext(Context);
  if (!value) throw new Error('孩子状态尚未初始化');
  return value;
}
