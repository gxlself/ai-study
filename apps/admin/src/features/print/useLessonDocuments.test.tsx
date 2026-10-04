// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { initialData } from '../../mocks/fixtures';
import type { LessonDocument } from '../content/model';
import { useLessonDocuments } from './useLessonDocuments';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn() } }));
const lesson = initialData().lessons[0];
const documentFor = (id: string): LessonDocument => ({ lesson: { ...lesson, id }, packId: 'sprout.core', baseUrl: '/', issues: [] });

function Probe({ ids }: { ids: string[] }) {
  const resource = useLessonDocuments(ids);
  return <div>
    <output>{resource.loading ? '加载中' : resource.error?.message ?? resource.data.map((item) => item.lesson.id).join(',')}</output>
    <button onClick={resource.reload}>重试</button>
  </div>;
}

describe('打印课程资料加载', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); });
  const render = (ids: string[]) => act(async () => root.render(<Probe ids={ids} />));
  const text = () => container.querySelector('output')?.textContent;

  it('按请求顺序返回，标识不变不重复拉取，空列表清除旧材料', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => documentFor(decodeURIComponent(path.split('/').pop()!)));
    await render(['core.a', 'custom.b']);
    expect(text()).toBe('core.a,custom.b');
    await render(['core.a', 'custom.b']);
    expect(api.get).toHaveBeenCalledTimes(2);
    await render([]);
    expect(text()).toBe('');
    expect(api.get).toHaveBeenCalledTimes(2);
  });
  it('切换主题中止旧请求，晚到的旧资料不会覆盖当前主题', async () => {
    let oldResolve!: (value: LessonDocument) => void;
    let newResolve!: (value: LessonDocument) => void;
    vi.mocked(api.get)
      .mockImplementationOnce(() => new Promise<LessonDocument>((resolve) => { oldResolve = resolve; }))
      .mockImplementationOnce(() => new Promise<LessonDocument>((resolve) => { newResolve = resolve; }));
    await render(['old']);
    const signal = vi.mocked(api.get).mock.calls[0][1]?.signal;
    await render(['new']);
    expect(signal?.aborted).toBe(true);
    expect(text()).toBe('加载中');
    await act(async () => oldResolve(documentFor('old')));
    expect(text()).toBe('加载中');
    await act(async () => newResolve(documentFor('new')));
    expect(text()).toBe('new');
  });
  it('失败可重试，不把读取失败当作空材料', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('网络断开')).mockResolvedValueOnce(documentFor('core.a'));
    await render(['core.a']);
    expect(text()).toBe('网络断开');
    await act(async () => container.querySelector('button')!.click());
    expect(text()).toBe('core.a');
  });
});
