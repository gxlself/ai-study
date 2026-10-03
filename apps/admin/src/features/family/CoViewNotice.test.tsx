// @vitest-environment jsdom
import { ageOf, ChildInput, type ChildProfile, type Route, type ScreenStatus } from '@sprout/schema';
import { ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import CoViewNotice from './CoViewNotice';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const noticeText = '中国卫健委/教育部对 0–3 岁的建议更严格（不接触/禁用视屏类产品）；本 App 的共看课是可选的、短时的、必须陪同的；您可以随时在后台切换为『仅家长指引』，课程会以线下版继续。';
const readKey = (id: string) => `sprout.admin.coViewNotice.v1.${encodeURIComponent(id)}`;
let root: Root;
let container: HTMLDivElement;

function profile(months = 30, mode?: ChildProfile['screen']['mode'], id = 'child-a'): ChildProfile {
  return {
    ...ChildInput.parse({
      name: id, birthday: dayjs().subtract(months, 'month').format('YYYY-MM-DD'), screen: { mode },
    }),
    id, createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z',
  };
}

function status(mode?: ScreenStatus['mode']): ScreenStatus {
  return { mode, usedSec: 0, dailyMaxSec: 1200, sessionMaxSec: 600, allowedNow: true, coView: 'required' };
}

function route(childScreen?: Route['stages'][number]['screen']['childScreen']): Route {
  return {
    schemaVersion: 1, id: 'sprout.core.route', title: { zh: '路线' },
    stages: [{
      id: 'stage', title: { zh: '阶段' }, ageRange: [18, 36], focus: [{ zh: '亲子互动' }],
      screen: { sessionMaxMin: 8, dailyMaxMin: 20, lessonsPerDay: 2, coView: 'required', childScreen },
      themes: [{ id: 'theme', title: { zh: '主题' }, weeks: 2, domains: ['language'], lessons: ['lesson'] }],
    }],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 3, 12));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  vi.spyOn(api, 'get').mockResolvedValue(status('co-view'));
  vi.spyOn(api, 'put');
  vi.spyOn(api, 'post');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(child: ChildProfile | null) {
  await act(async () => {
    root.render(<ConfigProvider theme={{ token: { motion: false } }}>
      {child && <CoViewNotice key={`${child.id}:${child.updatedAt}:${ageOf(child.birthday).months}`}
        child={child} />}
    </ConfigProvider>);
  });
}

async function dismiss(child: ChildProfile) {
  const close = container.querySelector(`button[aria-label="关闭${child.name}的亲子共看提示"]`);
  expect(close).not.toBeNull();
  await act(async () => { (close as HTMLButtonElement).click(); });
}

describe('共看提示的生效条件', () => {
  it.each([
    [18, 'co-view'], [23, 'co-view'], [24, 'auto'], [30, undefined],
  ] as const)('%i 月龄、模式 %s 首次生效共看时显示完整原文', async (months, mode) => {
    const child = profile(months, mode);
    await render(child);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(noticeText);
    expect(window.localStorage.getItem(readKey(child.id))).toBeNull();
    expect(api.get).toHaveBeenCalledExactlyOnceWith(`/api/children/${child.id}/screen`, expect.anything());
  });

  it.each([
    [17, 'co-view'], [30, 'parent-only'],
  ] as const)('%i 月龄、模式 %s 即使服务器返回共看也不提示', async (months, mode) => {
    await render(profile(months, mode));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it.each([
    [18, 'auto'], [23, undefined], [30, 'co-view'],
  ] as const)('%i 月龄、模式 %s 尊重服务器生效的家长模式', async (months, mode) => {
    vi.mocked(api.get).mockResolvedValue(status('parent-only'));
    const child = profile(months, mode);
    await render(child);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(window.localStorage.getItem(readKey(child.id))).toBeNull();
  });

  it('未到可用时段或达到屏幕上限，不改变共看模式的知情提示', async () => {
    vi.mocked(api.get).mockResolvedValue({ ...status('co-view'), allowedNow: false, reason: 'daily-limit' });
    await render(profile());
    expect(container.textContent).toContain(noticeText);
  });

  it('修改设置并保存后，新的生效共看模式会触发提示', async () => {
    const child = profile(20, 'auto');
    vi.mocked(api.get).mockResolvedValueOnce(status('parent-only')).mockResolvedValueOnce(status('co-view'));
    await render(child);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await render({ ...child, screen: { ...child.screen, mode: 'co-view' }, updatedAt: '2026-10-03T01:00:00.000Z' });
    expect(container.textContent).toContain(noticeText);
  });

  it('等待服务器确认时不提前显示共看提示', async () => {
    let resolve!: (value: ScreenStatus) => void;
    vi.mocked(api.get).mockReturnValueOnce(new Promise<ScreenStatus>((done) => { resolve = done; }));
    await render(profile(24, 'auto'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => { resolve(status('co-view')); });
    expect(container.textContent).toContain(noticeText);
  });

  it('非法生日不触发提示或发起模式查询', async () => {
    await render({ ...profile(), birthday: 'invalid' });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('旧接口的路线与年龄兼容', () => {
  it.each([
    [24, 'auto', 'default', true],
    [30, undefined, undefined, true],
    [23, 'auto', undefined, false],
    [24, 'auto', 'optional', false],
    [30, 'auto', 'none', false],
    [18, 'co-view', 'optional', true],
  ] as const)('%i 月龄、模式 %s、路线 %s 的提示为 %s', async (months, mode, policy, visible) => {
    vi.mocked(api.get).mockResolvedValueOnce(status()).mockResolvedValueOnce(route(policy));
    await render(profile(months, mode));
    expect(container.textContent?.includes(noticeText)).toBe(visible);
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/routes/sprout.core.route', expect.anything());
  });

  it('旧接口路线仍在加载时，不先套用默认共看模式', async () => {
    let resolve!: (value: Route) => void;
    vi.mocked(api.get).mockResolvedValueOnce(status())
      .mockReturnValueOnce(new Promise<Route>((done) => { resolve = done; }));
    await render(profile(30, 'auto'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => { resolve(route('none')); });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('屏幕状态查询失败时，仍可按可用路线判断，不令孩子页报错', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('暂不可用')).mockResolvedValueOnce(route('default'));
    await render(profile(24, 'auto'));
    expect(container.textContent).toContain(noticeText);
  });
});

describe('每个孩子的本地已读状态', () => {
  it('关闭只标记当前孩子；重新挂载、切换和重开共看均不重复提示', async () => {
    const first = profile(30, 'auto', 'first-child');
    const second = profile(18, 'co-view', 'second-child');
    await render(first);
    await dismiss(first);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(window.localStorage.getItem(readKey(first.id))).toBe('1');
    expect(window.localStorage.getItem(readKey(second.id))).toBeNull();

    await render(null);
    await render(first);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await render(second);
    expect(container.textContent).toContain(noticeText);
    await render({ ...first, screen: { ...first.screen, mode: 'parent-only' } });
    await render({ ...first, screen: { ...first.screen, mode: 'co-view' }, updatedAt: '2026-10-03T02:00:00.000Z' });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('未读的家长模式不消耗提示，满 24 月龄后仍显示', async () => {
    const child = profile(23, 'auto');
    vi.mocked(api.get).mockResolvedValueOnce(status('parent-only')).mockResolvedValueOnce(status('co-view'));
    await render(child);
    expect(window.localStorage.getItem(readKey(child.id))).toBeNull();
    await render(null);
    vi.setSystemTime(new Date(2026, 10, 3, 12));
    await render(child);
    expect(container.textContent).toContain(noticeText);
  });

  it('读取 localStorage 被禁用时仍显示提示', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('存储不可用'); });
    await render(profile());
    expect(container.textContent).toContain(noticeText);
  });

  it('写入 localStorage 失败时仍可关闭，当前页面不重复显示', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('存储不可用'); });
    const child = profile();
    await render(child);
    await dismiss(child);
    await render(child);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(window.localStorage.getItem(readKey(child.id))).toBeNull();
  });

  it('带特殊字符的孩子 ID 只匹配自己的本地标记和请求地址', async () => {
    const child = profile(30, 'auto', 'child a/1');
    window.localStorage.setItem(readKey('child-a-1'), '1');
    await render(child);
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/api/children/child%20a%2F1/screen', expect.anything());
    await dismiss(child);
    expect(window.localStorage.getItem(readKey(child.id))).toBe('1');
  });
});
