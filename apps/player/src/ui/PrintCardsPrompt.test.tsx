import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DataSource } from '../data';
import { lessonPrintAddress, PrintCardsPrompt } from './PrintCardsPrompt';

const remote = { kind: 'remote', server: 'http://192.168.1.8:4310/', token: 'private-device-token' } as unknown as DataSource;

describe('打印卡片提示', () => {
  it('显示家庭服务器完整地址，不携带配对凭据', () => {
    const html = renderToStaticMarkup(<PrintCardsPrompt source={remote} lessonId="core.s1.contrast-shapes" />);
    expect(html).toContain('宝宝看的是实体卡片：用手机或电脑打开下面地址打印');
    expect(html).toContain('http://192.168.1.8:4310/admin/print/lesson/core.s1.contrast-shapes');
    expect(html).not.toContain('private-device-token');
  });
  it('保留服务器前缀并编码课程标识', () => {
    expect(lessonPrintAddress({ ...remote, server: 'https://home.test/sprout/' } as DataSource, 'my lesson?'))
      .toBe('https://home.test/sprout/admin/print/lesson/my%20lesson%3F');
  });
  it.each([null, { kind: 'local' }, { kind: 'remote' }])('没有远程服务器时不猜测本机地址', (source) => {
    const html = renderToStaticMarkup(<PrintCardsPrompt source={source as DataSource | null} lessonId="core.s1.test" />);
    expect(html).toContain('连接家庭服务器后可在后台打印卡片');
    expect(html).not.toContain('/admin/print/');
  });
});
